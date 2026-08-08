
import { createClient } from '@supabase/supabase-js';
import { Asset, InventoryState, User, UserRole, InventoryCampaign, CampaignStatus, UnitConfig, AuditLogEntry, CampaignSnapshot } from '../types';
import { getAppBaseUrl } from '../utils/urlUtils';
import { sanitizeForSupabase } from './utils';
import { localDb } from './localDbService';
import { sqliteService, db } from './sqliteService';
import { compressImage } from '../utils/imageUtils';
import { logger } from '../utils/logger';
import { resolveTenantId, readLocalTenantId, readSessionTenantId } from '../utils/tenantUtils';
import { hasRealAnchor } from '../utils/gpsAnchors';

export class SupabaseNetworkException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseNetworkException';
  }
}

export class SupabaseBatteryException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseBatteryException';
  }
}

export class SupabaseAuthException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseAuthException';
  }
}

export interface ProvisionResult {
  user?: unknown;
  success?: boolean;
  existing?: boolean;
}

// ALERTA: Se os Secrets (VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY) estiverem presentes na build do GitHub,
// o modo de nuvem com Supabase Auth deve assumir a soberania do fluxo imediatamente.
// As credenciais são lidas do ambiente (API Keys). Se ausentes, caem para placeholders inofensivos.
const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
// SUPABASE_PLUS ativa automaticamente quando as credenciais estão presentes
// (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY via API Keys). Sem chaves → INTERNAL
// (offline-first preservado). `SUPABASE_PLUS` habilita a nuvem com o schema
// multi-tenant padronizado (`tenantid` + `filial`) — ver docs/ARCHITECTURE.md §10/§14.
// Credenciais NUNCA hard-codadas no código-fonte: lidas de VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY (API Keys / env).
export const isInternalMode = !(rawSupabaseUrl && rawSupabaseAnonKey);

const supabaseUrl = rawSupabaseUrl || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = rawSupabaseAnonKey || 'placeholder-anon-key';

// Limpeza robusta do schema para evitar caracteres como [ ] vindos de logs ou envs
const supabaseSchema = (import.meta.env.VITE_SUPABASE_SCHEMA || 'public').replace(/[[]\]/g, '').trim();

// Initialize client only if credentials exist to prevent crash
// Blindagem Dinâmica: O modo é verificado em tempo real para evitar chamadas fantasmas
export const getDatabaseMode = () => {
  if (isInternalMode) return 'INTERNAL';
  return localStorage.getItem('app_database_mode') || 'SUPABASE';
};

// Teste de conexão expandido (REST e AUTH) - Removido auto-run para evitar loops em modo offline
export const testSupabaseConnection = async () => {
  if (getDatabaseMode() === 'INTERNAL') return false;
  if (!rawSupabaseUrl || !rawSupabaseAnonKey) return false;
  
  try {
    const restTest = await fetch(`${supabaseUrl}/rest/v1/`, { headers: { 'apikey': supabaseAnonKey } });
    logger.info(`%c[Supabase] Conectividade REST: ${restTest.status === 200 ? 'OK' : 'ERRO ' + restTest.status}`, restTest.status === 200 ? "color: #3ecf8e;" : "color: #ef4444;");
    
    const authTest = await fetch(`${supabaseUrl}/auth/v1/health`, { headers: { 'apikey': supabaseAnonKey } });
    logger.info(`%c[Supabase] Conectividade AUTH: ${authTest.status === 200 ? 'OK' : 'ERRO ' + authTest.status}`, authTest.status === 200 ? "color: #3ecf8e;" : "color: #ef4444;");
    return true;
  } catch (err) {
    logger.error('[Supabase] Falha crítica de conectividade:', err);
    return false;
  }
};

if (rawSupabaseUrl && rawSupabaseAnonKey) {
  const currentMode = getDatabaseMode();
  if (currentMode !== 'INTERNAL') {
    logger.info(`%c[Supabase] Conectado ao Ambiente: ${import.meta.env.VITE_ENVIRONMENT || 'development'}`, "color: #3ecf8e; font-weight: bold;");
    logger.info(`%c[Supabase] URL: ${supabaseUrl}`, "color: #3ecf8e;");
    logger.info(`%c[Supabase] Schema: [${supabaseSchema}]`, "color: #3ecf8e;");
  } else {
    logger.info(`%c[Supabase] Modo INTERNO detectado. Conexões com a nuvem suspensas para economia de dados e estabilidade.`, "color: #f59e0b; font-weight: bold;");
  }
}

// O cliente Supabase é inicializado com persistência desativada se estivermos em modo interno no momento do load
// No entanto, as funções individuais fazem a blindagem em tempo real

/* eslint-disable @typescript-eslint/no-explicit-any */

interface InterceptResult {
  valid: boolean;
  reason?: string;
  data?: any;
}

const infrastructureTables = ['tenants', 'filial', 'camposAlterados', 'inventory_config', 'unit_gps_data', 'unit_configs'];

const mapColumnName = (col: string, tableName?: string): string => {
  if (!col || typeof col !== 'string' || col.trim() === '') {
    logger.warn(`[Supabase Interceptor] Aviso: Tentativa de mapear coluna vazia na tabela '${tableName}'. Retornando parâmetro intacto para evitar erro PGRST204.`);
    return col;
  }
  
  if (tableName === 'assets' || tableName === 'assets_analytics') {
    const lowA = col.toLowerCase().trim();
    if (lowA === '_unitid' || lowA === 'unit_id' || lowA === 'unitid') {
      return 'filial';
    }
    return col;
  }

  let lower = col.toLowerCase().trim();
  if (lower.startsWith('"') && lower.endsWith('"')) {
    lower = lower.substring(1, lower.length - 1);
  }
  
  if (tableName === 'user_permissions') {
    if (lower === 'tenantid' || lower === 'tenantid' || lower === 'tenantid') {
      return 'tenantid';
    }
    // Migração scripts/migrate-unitid-supabase.sql: user_permissions agora usa 'filial'
    // (coluna legada _unitid foi removida do banco).
    if (lower === 'unitid' || lower === 'unit_id' || lower === '_unitid' || lower === 'filial') {
      return 'filial';
    }
    return col;
  }

  if (tableName === 'inventory_config') {
    if (lower === 'tenantid' || lower === 'tenantid' || lower === 'tenantid') {
      return 'tenantid';
    }
    if (lower === 'unitid' || lower === 'unit_id' || lower === '_unitid' || lower === 'filial') {
      return 'filial';
    }
    return col;
  }

  if (lower === 'tenantid' || lower === 'tenantid' || lower === 'tenantid') {
    return 'tenantid';
  }
  if (lower === '_unitid' || lower === 'unit_id' || lower === 'unitid') {
    return 'filial';
  }
  if (lower === '_camposalterados' || lower === 'camposalterados') {
    return 'camposAlterados';
  }
  return col;
};

const mapPayloadKeysAndValidate = (payload: any, tableName: string): InterceptResult => {
  if (payload === undefined || payload === null) {
    return { valid: true, data: payload };
  }

  if (tableName === 'user_permissions' || tableName === 'assets_analytics') {
    return { valid: true, data: payload };
  }

  if (tableName === 'inventory_config') {
    const isArray = Array.isArray(payload);
    const items = isArray ? [...payload] : [payload];
    const mapped = items.map(item => {
      if (typeof item !== 'object' || item === null) return item;
      const copy = { ...item };
      for (const key of Object.keys(copy)) {
        if (copy[key] === undefined) {
          delete copy[key];
        }
      }
      return copy;
    });
    return { valid: true, data: isArray ? mapped : mapped[0] };
  }

  const isArray = Array.isArray(payload);
  const items = isArray ? [...payload] : [payload];

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    
    const itemKeys = Object.keys(item);
    for (const key of itemKeys) {
      if (item[key] === undefined) {
        delete item[key];
        continue;
      }
      const val = item[key];
      // IF infrastructure table, ANY null or undefined is blocked
      if (val === undefined || val === null) {
        if (infrastructureTables.includes(tableName)) {
          return {
            valid: false,
            reason: `Campo '${key}' contém valor inválido (null ou undefined) para envio à nuvem na tabela de infraestrutura '${tableName}'`
          };
        }
      }
    }
  }

  const mapped = items.map(item => {
    if (typeof item !== 'object' || item === null) return item;
    const copy = { ...item };
    
    // Map tenant keys to the canonical 'tenantid'
    const tenantKeys = ['tenantid', 'tenant_id', '_tenantid', 'tenantId'];
    for (const k of tenantKeys) {
      if (k in copy) {
        if (copy.tenantid === undefined) {
          copy.tenantid = copy[k];
        }
        if (k !== 'tenantid') {
          delete copy[k];
        }
      }
    }

    // Map unit/filial keys to filial
    const unitKeys = ['_unitid', 'unit_id', 'unitid'];
    for (const k of unitKeys) {
      if (k in copy) {
        if (copy.filial === undefined) {
          copy.filial = copy[k];
        }
        delete copy[k];
      }
    }

    // Map camposAlterados
    const caKeys = ['_camposAlterados', 'campos_alterados', 'camposalterados'];
    for (const k of caKeys) {
      if (k in copy) {
        if (copy.camposAlterados === undefined) {
          copy.camposAlterados = copy[k];
        }
        delete copy[k];
      }
    }

    // Remove any undefined fields for any table
    for (const key of Object.keys(copy)) {
      if (copy[key] === undefined) {
        delete copy[key];
      }
    }

    return copy;
  });

  return {
    valid: true,
    data: isArray ? mapped : mapped[0]
  };
};

function createSupabaseInterceptor(originalClient: any) {
  if (!originalClient) return originalClient;

  const createBuilderProxy = (builderPromise: any, tableName: string): any => {
    return new Proxy(builderPromise, {
      get(target, prop, receiver) {
        const val = Reflect.get(target, prop, receiver);

        if (typeof val === 'function') {
          return function (...args: any[]) {
            // 1. Intercept Mutation Methods
            if (prop === 'insert' || prop === 'update' || prop === 'upsert') {
              const payload = args[0];
              const check = mapPayloadKeysAndValidate(payload, tableName);
              
              if (!check.valid) {
                logger.error(`>>> [Supabase Interceptor] Bloqueado preventivamente na tabela '${tableName}':`, check.reason);
                return Promise.resolve({
                  data: null,
                  error: {
                    message: `Requisição abortada preventivamente: ${check.reason}`,
                    code: 'PREVENTED_ABORT_400',
                    details: 'Blindagem do v2.6 impediu o envio de campos nulos ou indefinidos de infraestrutura.'
                  }
                });
              }
              // Replace payload with sanitized/mapped payload
              args[0] = check.data;
            }

            // 2. Intercept Filter Methods
            if (prop === 'eq' || prop === 'neq' || prop === 'like' || prop === 'ilike' || prop === 'gt' || prop === 'lt' || prop === 'gte' || prop === 'lte') {
              if (args[0] && typeof args[0] === 'string') {
                args[0] = mapColumnName(args[0], tableName);
              }
              if (args[1] === undefined || args[1] === null) {
                logger.error(`>>> [Supabase Interceptor] Bloqueado filtro eq/in com nulo para a coluna '${args[0]}' na tabela '${tableName}'.`);
                return Promise.resolve({
                  data: null,
                  error: {
                    message: `Filtro inválido para coluna '${args[0]}': valor é nulo ou indefinido`,
                    code: 'INVALID_FILTER_400',
                    details: 'O filtro de busca não pode conter valores nulos ou indefinidos.'
                  }
                });
              }
            }

            if (prop === 'in' || prop === 'containedBy') {
              if (args[0] && typeof args[0] === 'string') {
                args[0] = mapColumnName(args[0], tableName);
              }
              if (!args[1] || !Array.isArray(args[1]) || args[1].some(v => v === undefined || v === null)) {
                logger.error(`>>> [Supabase Interceptor] Bloqueado filtro 'in' inválido para a coluna '${args[0]}' na tabela '${tableName}'.`);
                return Promise.resolve({
                  data: null,
                  error: {
                    message: `Filtro IN inválido para coluna '${args[0]}'`,
                    code: 'INVALID_FILTER_400',
                    details: 'O array de filtro de busca está vazio ou contém valores nulos/indefinidos.'
                  }
                });
              }
            }

            const result = val.apply(target, args);
            if (result && typeof result === 'object' && (typeof result.then === 'function' || result.from)) {
              return createBuilderProxy(result, tableName);
            }
            return result;
          };
        }
        return val;
      }
    });
  };

  const interceptor = new Proxy(originalClient, {
    get(target, prop, receiver) {
      if (prop === 'from') {
        return function (tableName: string) {
          let targetTable = tableName;
          if (tableName === 'unit_gps_data') {
            targetTable = 'inventory_config';
          }
          const originalBuilder = originalClient.from(targetTable);
          return createBuilderProxy(originalBuilder, targetTable);
        };
      }
      return Reflect.get(target, prop, receiver);
    }
  });

  return interceptor;
}

// Blindagem de Instância (Failsafe Guard): Nunca exportamos nulo para evitar Cannot read properties of null (reading 'auth')
const rawSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: supabaseSchema
  },
  auth: {
    autoRefreshToken: getDatabaseMode() !== 'INTERNAL',
    persistSession: getDatabaseMode() !== 'INTERNAL',
    detectSessionInUrl: getDatabaseMode() !== 'INTERNAL'
  }
});

export const supabase = createSupabaseInterceptor(rawSupabase);

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Realiza o logout completo do sistema, limpando sessões locais e da nuvem
 */
export const signOut = async () => {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      logger.error('[Supabase] Erro ao deslogar da nuvem:', err);
    }
  }
  
  // Limpa o sessionStorage independente do sucesso do Supabase
  sessionStorage.removeItem('app_current_user');
  sessionStorage.clear();
  
// Recarrega para limpar o estado do React
  window.location.href = '/';
};

// Delegate pattern to resolve circular reference with syncService
let campaignSyncQueueDelegate: ((campaignId: string, action: 'DELETE' | 'UPDATE_STATUS', status?: unknown, closedBy?: string) => Promise<string>) | null = null;

export const registerCampaignSyncQueueDelegate = (
  delegate: (campaignId: string, action: 'DELETE' | 'UPDATE_STATUS', status?: unknown, closedBy?: string) => Promise<string>
) => {
  campaignSyncQueueDelegate = delegate;
};

// Função para gerar UUID v4 simples para uso local/offline
export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Registra um evento de auditoria manualmente
 */
export const logAuditEvent = async (entry: {
  user_email: string;
  action: string;
  table_name?: string;
  record_id?: string;
  old_data?: unknown;
  new_data?: unknown;
  details?: string;
  tenantid?: string;
  origin?: string;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).__isImportingBatch) {
    // Ignora silenciosamente durante a carga em lote para isolar o SQLite local
    return;
  }
  const isInternal = localStorage.getItem('app_database_mode') === 'INTERNAL';

  // Se for modo interno, salva no Dexie
  if (isInternal) {
    try {
      await localDb.auditLogs.add({
        ...entry,
        user: entry.user_email,
        timestamp: new Date().toISOString()
      } as AuditLogEntry);
      logger.info('>>> [Persistence] Log de auditoria salvo localmente (Dexie).');
    } catch (dexieErr) {
      logger.warn('>>> [Persistence] Falha ao salvar log no Dexie:', dexieErr);
    }
    return;
  }

  if (!supabase) return;

  try {
    // Sanitiza dados para evitar erros de estrutura circular
    const tenantVal = resolveTenantId(entry as unknown as Record<string, unknown>);
    const dbPayload: Record<string, unknown> = {
      user_email: entry.user_email,
      action: entry.action,
      table_name: entry.table_name || '',
      record_id: entry.record_id || '',
      details: entry.details || '',
      origin: entry.origin || 'WEB',
      tenantid: tenantVal
    };

    if (entry.new_data !== undefined) {
      dbPayload.new_data = sanitizeForSupabase(entry.new_data);
    }
    if (entry.old_data !== undefined) {
      dbPayload.old_data = sanitizeForSupabase(entry.old_data);
    }

    const { error } = await Promise.race([
      supabase.from('audit_logs').insert([dbPayload]),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("LOG_TIMEOUT")), 2000))
    ]).catch(err => ({ error: err })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (error && error.message !== "LOG_TIMEOUT") {
      logger.warn('Erro ao registrar log de auditoria:', error);
    }
  } catch (err) {
    logger.warn('Erro inesperado ao registrar log:', err);
  }
};

/**
 * Registra uma alteração específica de um ativo na tabela asset_logs
 */
export const logAssetChange = async (entry: {
  asset_id: string;
  user_email: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPAIRMENT_TEST';
  old_data?: unknown;
  new_data?: unknown;
  tenantid?: string;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).__isImportingBatch) {
    // Ignora silenciosamente durante a carga em lote para isolar o SQLite local
    return;
  }
  const isInternal = getDatabaseMode() === 'INTERNAL';

  // Se for modo interno, salva no Dexie
  if (isInternal) {
    try {
      await localDb.auditLogs.add({
        ...entry,
        user: entry.user_email,
        record_id: entry.asset_id,
        table_name: 'assets',
        timestamp: new Date().toISOString()
      } as AuditLogEntry);
      logger.info('>>> [Persistence] Log de ativo salvo localmente (Dexie).');
    } catch (dexieErr) {
      logger.warn('>>> [Persistence] Falha ao salvar log de ativo no Dexie:', dexieErr);
    }
    return;
  }

  if (!supabase) return;

  try {
    // Sanitiza dados para evitar erros de estrutura circular
    const sanitizedEntry = {
      ...entry,
      old_data: entry.old_data ? sanitizeForSupabase(entry.old_data) : undefined,
      new_data: entry.new_data ? sanitizeForSupabase(entry.new_data) : undefined,
      timestamp: new Date().toISOString()
    };

    const { error } = await supabase
      .from('asset_logs')
      .insert([sanitizedEntry]);

    if (error) {
      logger.warn('Erro ao registrar log de ativo:', error);
    }
  } catch (err) {
    logger.warn('Erro inesperado ao registrar log de ativo:', err);
  }
};

/**
 * Busca todas as localidades (legendas/metadados) do tenant
 */
export const getLocations = async (tenantid: string) => {
  if (getDatabaseMode() === 'INTERNAL') return [];
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('tenantid', tenantid);
      
    if (error) {
      logger.error('Erro ao buscar localidades:', error);
      return [];
    }
    return data;
  } catch (err) {
    logger.error('Erro inesperado ao buscar localidades:', err);
    return [];
  }
};

/**
 * Salva ou atualiza uma localidade
 */
export const saveLocation = async (location: {
  name: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  tenantid: string;
}) => {
  if (getDatabaseMode() === 'INTERNAL') return null;
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('locations')
      .upsert([location], { onConflict: 'name, tenantid' })
      .select()
      .single();
      
    if (error) {
      logger.error('Erro ao salvar localidade:', error);
      throw error;
    }
    return data;
  } catch (err) {
    logger.error('Erro inesperado ao salvar localidade:', err);
    throw err;
  }
};

export const signUp = async (email: string, password: string, username: string, tenantid: string, role: string = 'ADMIN', name?: string, unitid?: string, units?: string[]) => {
  if (getDatabaseMode() === 'INTERNAL') throw new Error("Modo INTERNO não permite cadastro na nuvem.");
  if (!supabase) throw new Error("Supabase não configurado.");
  
  // 1. Cria o usuário no Supabase Auth
  logger.info(`[Supabase] Cadastrando usuário ${email} com tenant ${tenantid}...`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        name: name || username,
        role,
        tenantid: tenantid,
        filial: unitid || '',
        units: units || (unitid ? [unitid] : []),
      },
    },
  });
  
  if (error) {
    logger.error('[Supabase] Erro no signUp:', error);
    if (error.message.includes('already registered')) {
      throw new Error('Este e-mail já está cadastrado. Tente fazer login ou recupere sua senha.');
    }
    throw error;
  }
  
  logger.info(`[Supabase] Usuário cadastrado com sucesso no Auth:`, data.user?.email);

  // 2. Cria o perfil na tabela user_permissions para garantir sincronia
  if (data.user) {
    logger.info(`[Supabase] Sincronizando perfil na tabela user_permissions para ${email}...`);
    const { error: permError } = await supabase
      .from('user_permissions')
      .upsert([{
        id: data.user.id, // Sincroniza com o ID do Auth
        email: email.toLowerCase(),
        username,
        name: name || username,
        role,
        is_admin: role === 'ADMIN' || role === 'MASTER',
        tenantid: tenantid,
        filial: unitid || '',
        units: units || (unitid ? [unitid] : []),
      }], { onConflict: 'email' });
      
    if (permError) {
      logger.error('[Supabase] Erro ao sincronizar perfil:', permError);
      logger.warn("Erro ao criar permissões, mas usuário foi criado no Auth:", permError);
    } else {
      logger.info(`[Supabase] Perfil sincronizado com sucesso para ${email}.`);
    }

    // 3. Log de Auditoria
    await logAuditEvent({
      user_email: email,
      action: 'SIGN_UP',
      table_name: 'user_permissions',
      record_id: data.user.id,
      details: `Novo usuário cadastrado: ${username} (${role})`,
      tenantid: tenantid
    });
  }

  return data;
};

/**
 * Garante que o usuário tenha um perfil na tabela user_permissions.
 * Se não existir, cria um perfil padrão.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ensureUserProfile = async (email: string, metadata?: Record<string, any>, userId?: string): Promise<any> => {
  if (getDatabaseMode() === 'INTERNAL') {
    const lowerEmail = email.toLowerCase();
    const is_admin_new = isAdminEmail(lowerEmail);
    return {
      email: lowerEmail,
      username: lowerEmail.split('@')[0],
      role: is_admin_new ? 'ADMIN' : 'AUDITOR',
      is_admin: is_admin_new,
      isAdmin: is_admin_new,
      tenantid: (metadata?.tenantid || '').trim(),
      filial: (metadata?.filial || metadata?._unitid || '').trim(),
      units: [],
      };
  }
  if (!supabase) throw new Error("Supabase não configurado.");
  
  const lowerEmail = email.toLowerCase();
  
  // 1. Busca perfil existente com timeout estrito
  logger.info(`[Supabase] Buscando perfil para ${lowerEmail}...`);
  
  const fetchPromise = supabase
    .from('user_permissions')
    .select('*')
    .eq('email', lowerEmail)
    .single();

  const result = await Promise.race([
    fetchPromise,
    new Promise<null>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000))
  ]).catch(err => {
    logger.warn('[Supabase] Timeout ou erro na busca de perfil:', err.message);
    return { data: null, error: { message: err.message } };
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  
  const profile = result.data;
    
  if (profile) {
    logger.info(`[Supabase] Perfil encontrado para ${lowerEmail}:`, profile);
    
    // Sincronização de ID em background (não aguarda)
    if (userId && profile.id !== userId) {
      supabase.from('user_permissions').update({ id: userId }).eq('email', lowerEmail).then();
    }

    const is_admin = (profile.is_admin === true || profile.isadmin === true || 
                     (profile.role && profile.role.trim().toUpperCase() === 'ADMIN') || 
                     (profile.role && profile.role.trim().toUpperCase() === 'MASTER') ||
                     isAdminEmail(lowerEmail));
    
    const finalRole = (profile.role || 'AUDITOR').trim().toUpperCase();
    
    const parseArray = (val: unknown) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            return JSON.parse(trimmed);
          } catch {
            // Se falhar o parse, tenta limpar aspas extras
            const cleaned = trimmed.replace(/^\["|"\]$/g, '').split('","');
            return cleaned.filter(v => v !== '');
          }
        }
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          // Formato nativo Postgres {}
          return trimmed.substring(1, trimmed.length - 1).split(',').map(v => v.replace(/"/g, ''));
        }
        return trimmed ? [trimmed] : [];
      }
      return val ? [val] : [];
    };

    const finalProfile = {
      id: profile.id,
      email: profile.email,
      username: profile.username || lowerEmail.split('@')[0],
      name: profile.name || profile.username || lowerEmail.split('@')[0],
      role: finalRole,
      is_admin: is_admin,
      isAdmin: is_admin,
      tenantid: (profile.tenantid || profile.tenantid || profile.tenantid || profile.tenantid || '').trim(),
      filial: (profile.filial || profile._unitid || profile.unitid || profile.unitId || '').trim(),
      units: parseArray(profile.units || profile.unitid || profile._unitid || profile.filial)
    };

    logger.info(`[Supabase] Perfil final processado para ${lowerEmail}:`, finalProfile);
    return finalProfile;
  }

  // 2. Se não encontrou ou deu timeout, tenta criar/atualizar (Upsert) com timeout
  logger.info('[Supabase] Perfil não encontrado ou lento, tentando upsert...');
  
  const defaultTenant = (metadata?.tenantid || readLocalTenantId() || readSessionTenantId() || '').trim();
  const is_admin_new = isAdminEmail(lowerEmail);
  const fallbackTenant = defaultTenant;
  
  const insertData = {
    email: lowerEmail,
    username: (metadata?.username || lowerEmail.split('@')[0]).trim(),
    name: (metadata?.name || metadata?.username || lowerEmail.split('@')[0]).trim(),
    role: is_admin_new ? 'ADMIN' : 'AUDITOR',
    is_admin: is_admin_new,
    tenantid: fallbackTenant,
    filial: (metadata?.filial || metadata?._unitid || metadata?.unitId || metadata?.unitid || localStorage.getItem('filial') || sessionStorage.getItem('filial') || '').trim(),
    ...(userId ? { id: userId } : {})
  };

  const upsertPromise = supabase
    .from('user_permissions')
    .upsert([insertData], { onConflict: 'email' })
    .select()
    .single();

  const upsertResult = await Promise.race([
    upsertPromise,
    new Promise<null>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 5000))
  ]).catch(() => null) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  if (upsertResult && !upsertResult.error && upsertResult.data) {
    const d = upsertResult.data;
    return {
      ...d,
      isAdmin: d.is_admin,
      tenantid: d.tenantid || d.tenantid || fallbackTenant,
      filial: d.filial || d._unitid || ''
    };
  }

  // 3. Fallback Final: Retorna dados locais para não travar o login
  logger.warn('[Supabase] Usando perfil local (Fallback Total)');
  return {
    email: lowerEmail,
    username: lowerEmail.split('@')[0],
    role: is_admin_new ? 'ADMIN' : 'AUDITOR',
    is_admin: is_admin_new,
    isAdmin: is_admin_new,
    tenantid: fallbackTenant,
    filial: '',
    units: [],
  };
};

export const signIn = async (email: string, password: string) => {
  if (getDatabaseMode() === 'INTERNAL') throw new Error("Modo INTERNO não permite login na nuvem.");
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  
  if (data?.user) {
    logger.info(`[Supabase] Login realizado para ${email}. Metadados:`, data.user.user_metadata);
  }
  
  if (error) throw error;
  return data;
};

export const signInWithMagicLink = async (email: string) => {
  if (getDatabaseMode() === 'INTERNAL') throw new Error("Modo INTERNO não permite login na nuvem.");
  if (!supabase) throw new Error("Supabase não configurado.");
  
  const redirectTo = getAppBaseUrl();
  logger.info('[Supabase] Solicitando Magic Link para:', email, 'Redirect:', redirectTo);

  const { data, error } = await Promise.race([
    supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    }),
    new Promise<null>((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 10000))
  ]).catch(err => ({ data: null, error: err })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  
  if (error) {
    logger.error('[Supabase] Erro ou Timeout no signInWithOtp:', error);
    throw new Error(error.message === "AUTH_TIMEOUT" ? "O servidor de autenticação não respondeu a tempo. Tente novamente." : error.message);
  }
  return data;
};

export const syncAssetsToCloud = async (assets: Asset[], tenantid?: string | string[], onProgress?: (processed: number, total: number) => void): Promise<string[]> => {
  if (!assets || assets.length === 0) {
    logger.error('>>> [Supabase] Fluxo Bloqueado: Ação explícita de sincronia abortada. Array de ativos nulo ou vazio detectado.');
    throw new SupabaseNetworkException('Ação Bloqueada: Não há ativos gravados no disco local para espelhamento Delta.');
  }

  if (!supabase || !navigator.onLine) {
    logger.warn('>>> [Supabase] Sincronização ignorada: Sem conexão ou Supabase não configurado.');
    return [];
  }

  const isBatteryCritical = await sqliteService.isBatteryCritical?.() ?? false;
  if (isBatteryCritical) {
    throw new SupabaseBatteryException("Nível de bateria crítico (< 5%). Sincronização em massa abortada para proteção de hardware do Supabase.");
  }

  const forcedTenantid = Array.isArray(tenantid) ? tenantid[0] : tenantid;
  logger.info(`>>> [Supabase] Iniciando sincronização de ${assets.length} ativos em lotes para o tenant: ${forcedTenantid || 'Global'}`);
  
  const CHUNK_SIZE = 50; // Bloqueio em max 50 para evitar erro 400 (URL Too Long) na Nuvem
  const total = assets.length;
  const successfullySyncedIds: string[] = [];

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = assets.slice(i, i + CHUNK_SIZE);
    
    // Preparação de dados (Sanitização rígida anti-PGRST204)
    const sanitizedAssetsPayload = chunk.map(a => {
      const cleanAsset = { ...a };
      if (cleanAsset._photoUrl && cleanAsset._photoUrl.startsWith('blob:')) {
        delete cleanAsset._photoUrl;
      }
      
      const assetGrupo = (cleanAsset.tenantid || cleanAsset.GRUPO_EMPRESARIAL || '').trim().toUpperCase();
      let finalTenantid = '';
      if (tenantid) {
        if (Array.isArray(tenantid)) {
          const match = tenantid.find(t => t.toUpperCase().trim() === assetGrupo);
          finalTenantid = match || tenantid[0] || '';
        } else {
          finalTenantid = tenantid;
        }
      } else {
        finalTenantid = assetGrupo || (readLocalTenantId() || readSessionTenantId() || '').trim();
      }

      const finalFilial = (cleanAsset.filial || cleanAsset._unitid || localStorage.getItem('filial') || sessionStorage.getItem('filial') || 'GERAL').trim().toUpperCase();

      if (!finalTenantid || finalTenantid === 'undefined' || finalTenantid === 'null') {
        logger.warn(">>> [Session] Falha crítica de isolamento em syncAssetsToCloud: Contrato ausente.");
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gbr_session_expired', {
            detail: { message: "Sua sessão expirou ou o identificador de Contrato foi perdido. Sincronização de ativos abortada." }
          }));
        }
        throw new Error("Sessão Expirada: Contrato ausente para sincronização.");
      }

      const assetPrimaryKey = String(cleanAsset.primarykey !== undefined && cleanAsset.primarykey !== null ? cleanAsset.primarykey : '').trim() || String(cleanAsset.id || '');

      // Projeção estrita de colunas GBR v2.6 sem campos fantasmas, usando tenantid e _unitid direto, preenchendo id com a propriedade primarykey
      return {
        id: assetPrimaryKey,
        tenantid: finalTenantid,
        filial: finalFilial,
        status: (cleanAsset.status || 'PENDENTE').trim().toUpperCase(),
        etiqueta: (cleanAsset.etiqueta || '').trim(),
        qt: (() => {
          const rawQt = cleanAsset.qt !== undefined ? cleanAsset.qt : 1;
          const parsed = Number(rawQt);
          return isNaN(parsed) ? 1 : parsed;
        })(),
        descricaodoativo: (cleanAsset.descricaodoativo || '').trim(),
        serial: (cleanAsset.serial || '').trim(),
        dataaqusic: (cleanAsset.dataaqusic || '').trim(),
        cnpj: (cleanAsset.cnpj || '').trim(),
        nomefornecedor: (cleanAsset.nomefornecedor || '').trim(),
        notafiscal: (cleanAsset.notafiscal || '').trim(),
        endereco: (cleanAsset.endereco || '').trim(),
        registro: (cleanAsset.registro || '').trim(),
        subreg: (cleanAsset.subreg || '').trim(),
        databaixa: (cleanAsset.databaixa || '').trim(),
        contacontabil: (cleanAsset.contacontabil || cleanAsset.conta_contabil || '').trim(),
        primarykey: assetPrimaryKey,
        centrodecusto: (cleanAsset.centrodecusto || '').trim(),
        vlraquisic: (() => {
          const rawVal = cleanAsset.vlraquisic !== undefined ? cleanAsset.vlraquisic : 0;
          const parsed = Number(rawVal);
          return isNaN(parsed) ? 0 : parsed;
        })(),
        sn1_recno: (() => {
          const val = cleanAsset.sn1_recno;
          if (val === undefined || val === null) return null;
          const num = Number(val);
          return isNaN(num) ? null : num;
        })(),
        sn3_recno: (() => {
          const val = cleanAsset.sn3_recno;
          if (val === undefined || val === null) return null;
          const num = Number(val);
          return isNaN(num) ? null : num;
        })()
      };
    });

    try {
      const { error } = await supabase
        .from('assets')
        .upsert(sanitizedAssetsPayload, { onConflict: 'id' });

      if (error) {
        logger.error(`>>> [Supabase] Erro de integridade/esquema no lote ${Math.floor(i / CHUNK_SIZE) + 1}:`, error);
        throw new SupabaseNetworkException(`Falha no upsert: ${error.message || 'Erro de esquema.'}`);
      }

      successfullySyncedIds.push(...chunk.map(a => String(a.id)));
      
      if (onProgress) {
        onProgress(Math.min(i + CHUNK_SIZE, total), total);
      }
      
      // Delay visual para a esteira reativa
      await new Promise(res => setTimeout(res, 40));
    } catch (err: unknown) {
      logger.error(`>>> [Supabase] Erro de rede/esquema no lote ${Math.floor(i / CHUNK_SIZE) + 1}:`, err);
      if (err instanceof SupabaseNetworkException) {
        throw err;
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new SupabaseNetworkException(`Falha estrutural ou de rede: ${rawMsg}`);
    }
  }

  return successfullySyncedIds;
};

export const syncConfigToCloud = async (config: Omit<InventoryState, 'assets'>, tenantid?: string | string[]) => {
  if (getDatabaseMode() === 'INTERNAL') return;
  if (!supabase || !navigator.onLine) return;
  
  // Filtra apenas os campos que sabemos que existem na tabela para evitar erros de coluna inexistente
  // IMPORTANTE: battery_saver é omitido para garantir compatibilidade estrita até que o backend processe a nova estrutura
  const allowedKeys = [
    'id', 
    'companies', 
    'last_updated', 
    'status',
    'editable_fields', 
    'qr_code_fields', 
    'scanner_mode', 
    'scan_feedback_mode', 
    'inventory_search_mode',
    'immersive_mode',
    'dark_mode',
    'protheus_integration_enabled',
    'protheus_api_url',
    'mandatory_photo_on_divergence',
    'mandatory_photo_on_new_item',
    'database_mode',
    'tenantid'
  ];

  const resolvedTenantid = (
    (Array.isArray(tenantid) ? tenantid[0] : tenantid) ||
    (config as Record<string, unknown>).tenantid ||
    (config as Record<string, unknown>).tenantid ||
    readLocalTenantId() ||
    readSessionTenantId() ||
    ''
  ).toString().trim();

  const cleanTenantidRaw = resolvedTenantid !== 'undefined' && resolvedTenantid !== 'null' ? resolvedTenantid : '';

  if (!cleanTenantidRaw) {
    logger.warn(">>> [Session] Falha crítica de isolamento no syncConfigToCloud: tenantid ausente.");
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gbr_session_expired', {
        detail: { message: "Sua sessão expirou ou o identificador de Contrato foi perdido. O envio das configurações foi bloqueado." }
      }));
    }
    return; // Interrompe a operação de sync
  }

  const cleanTenant = encodeURIComponent(cleanTenantidRaw.replace(/[%_\s]+/g, ''));
  if (!cleanTenant || cleanTenant === 'undefined' || cleanTenant === 'null') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gbr_session_expired', {
        detail: { message: "Contrato inválido para sincronização. Por favor, reautentique para carregar a sessão." }
      }));
    }
    return; // Interrompe a operação de sync
  }
  const configId = `config_${cleanTenant}`;

  const payload: Record<string, unknown> = {
    id: configId,
    tenantid: cleanTenant
  };
  
  // Mapeamento de camelCase para snake_case
  const mapping: Record<string, string> = {
    'lastUpdated': 'last_updated',
    'editableFields': 'editable_fields',
    'qrCodeFields': 'qr_code_fields',
    'scannerMode': 'scanner_mode',
    'scanFeedbackMode': 'scan_feedback_mode',
    'inventorySearchMode': 'inventory_search_mode',
    'immersiveMode': 'immersive_mode',
    'darkMode': 'dark_mode',
    'protheusIntegrationEnabled': 'protheus_integration_enabled',
    'protheusApiUrl': 'protheus_api_url',
    'mandatoryPhotoOnDivergence': 'mandatory_photo_on_divergence',
    'mandatoryPhotoOnNewItem': 'mandatory_photo_on_new_item',
    'databaseMode': 'database_mode'
  };

  Object.keys(config).forEach(key => {
    const dbKey = mapping[key] || key;
    // Omitimos explicitamente o batterySaver ou battery_saver para garantir a blindagem do payload
    if (key === 'batterySaver' || key === 'battery_saver' || dbKey === 'battery_saver') {
      return;
    }
    if (allowedKeys.includes(dbKey)) {
      const val = (config as Record<string, unknown>)[key];
      // Impedimos o envio de campos nulos ou indefinidos de infraestrutura para evitar a quebra do interceptor do v2.6
      if (val !== undefined && val !== null) {
        if (dbKey === 'tenantid' && (!val || val === 'undefined' || val === 'null' || String(val).trim() === '')) {
          return; // ignora valores inválidos de tenantid no config
        }
        payload[dbKey] = val;
      }
    }
  });

  const { error } = await supabase
    .from('inventory_config')
    .upsert(payload);

  if (error) {
    logger.error('Error syncing config to Supabase:', error);
    throw error;
  }
};

/**
 * Fetches user permissions/profile from Supabase database
 * This is used after Protheus authentication
 */
export const getUserPermissions = async (email: string) => {
  if (getDatabaseMode() === 'INTERNAL') return { isAdmin: false };
  if (!supabase) return { isAdmin: false };

  try {
    const { data, error } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') { // Record not found
        return { isAdmin: false };
      }
      logger.error('Error fetching permissions:', error);
      return { isAdmin: false };
    }

    return data;
  } catch (err) {
    logger.error('Unexpected error fetching permissions:', err);
    return { isAdmin: false };
  }
};

/**
 * Busca o e-mail de um usuário pelo username na tabela user_permissions
 */
export const getEmailByUsername = async (username: string): Promise<string | null> => {
  if (getDatabaseMode() === 'INTERNAL') return null;
  if (!supabase) return null;

  try {
    const fetchPromise = supabase
      .from('user_permissions')
      .select('email')
      .ilike('username', username)
      .maybeSingle();

    const result = await Promise.race([
      fetchPromise,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000))
    ]).catch(err => {
      logger.warn('[Supabase] Timeout ao buscar e-mail por username:', err.message);
      return { data: null, error: { message: err.message } };
    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (result.error) {
      logger.error('Erro ao buscar e-mail por username:', result.error);
      return null;
    }

    return result.data?.email || null;
  } catch (err) {
    logger.error('Erro inesperado ao buscar e-mail por username:', err);
    return null;
  }
};

/**
 * Provisiona um usuário no Supabase Auth (Cria o login oficial)
 * Nota: Como é um SPA, usamos signUp. Para evitar deslogar o admin,
 * criamos uma instância temporária do cliente.
 */
export const provisionUserInAuth = async (email: string, password?: string, username?: string, role?: string, tenantid?: string, name?: string, unitid?: string, units?: string[]): Promise<ProvisionResult> => {
  if (getDatabaseMode() === 'INTERNAL') throw new Error("Modo INTERNO não permite provisionamento na nuvem.");
  logger.info(`[Supabase] Provisionando usuário ${email}:`, { role, tenantid, unitid, units });
  if (!supabaseUrl || !supabaseAnonKey || !email || !password) {
    throw new Error('Dados insuficientes para provisionamento (E-mail ou Senha ausentes).');
  }

  try {
    // Criamos um cliente temporário para não afetar a sessão do Admin logado
    logger.info(`[Supabase] Criando cliente temporário para signUp de ${email}...`);
    const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false, // Importante: não salvar esta sessão no localStorage
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });

    const { data, error } = await tempClient.auth.signUp({
      email: email.toLowerCase().trim(),
      password: password,
      options: {
        data: {
          username: username || email.split('@')[0],
          name: name || username || email.split('@')[0],
          role: role || 'AUDITOR',
          tenantid: tenantid || '',
          filial: unitid || '',
          units: units || (unitid ? [unitid] : []),
          provisioned_by: 'admin_dashboard'
        }
      }
    });
    
    if (error) {
      logger.warn(`[Supabase] Erro no signUp de provisionamento para ${email}:`, error);
      // Se o usuário já existe, não falhamos o processo inteiro, 
      // tentamos apenas atualizar as permissões na tabela
      if (error.message.includes('already registered') || error.status === 422) {
        logger.info(`[Supabase] Usuário já registrado no Auth. Tentando atualizar permissões para ${email}...`);
        
        if (supabase) {
          const { error: permError } = await supabase
            .from('user_permissions')
            .upsert([{
              email: email.toLowerCase().trim(),
              username: username || email.split('@')[0],
              name: name || username || email.split('@')[0],
              role: role || 'AUDITOR',
              is_admin: role === 'ADMIN' || role === 'MASTER',
              tenantid: tenantid || '',
              filial: unitid || '',
              units: units || (unitid ? [unitid] : []),
            }], { onConflict: 'email' });
            
          if (permError) {
            logger.error('[Supabase] Falha ao sincronizar permissões para usuário existente:', permError);
            throw permError;
          }
          return { user: { email }, existing: true };
        }
      }
      
      logger.error('[Supabase] Erro definitivo no signUp do Supabase:', error);
      throw error;
    }

    logger.info(`[Supabase] Usuário provisionado com sucesso no Auth:`, data.user?.email);

    // 2. Garante que o perfil exista na tabela user_permissions
    // Importante: Usamos o cliente principal (supabase) aqui, pois ele tem as permissões de escrita (se o RLS permitir)
    if (supabase && data.user) {
      logger.info(`[Supabase] Criando perfil na tabela user_permissions para o novo usuário ${email}...`);
      const normalizeValue = (val: string) => {
        if (!val) return '';
        const upper = val.toUpperCase();
        return (upper === 'DEFAULT' || upper === 'NULL' || upper === '0' || upper === 'default') ? '' : val;
      };
      const normalizeArray = (arr: unknown) => {
        if (!arr) return [];
        const array = Array.isArray(arr) ? arr : [arr];
        return array.map(v => String(v)).filter(v => normalizeValue(v) !== '');
      };
      const is_admin = role === 'ADMIN' || role === 'MASTER' || isAdminEmail(email);
      const normTenantid = normalizeValue(tenantid || '');
      const normUnitId = normalizeValue(unitid || '');

      const currentPayload = {
        id: data.user.id, // Sincroniza ID
        email: email.toLowerCase().trim(),
        username: username || email.split('@')[0],
        name: name || username || email.split('@')[0],
        role: role || 'AUDITOR',
        is_admin,
        tenantid: normTenantid,
        filial: normUnitId,
        units: normalizeArray(units || (normUnitId ? [normUnitId] : [])),
      };

      const { error: permError } = await supabase
        .from('user_permissions')
        .upsert([currentPayload], { onConflict: 'email' });
        
      if (permError) {
        logger.warn("⚠️ Usuário criado no Auth, mas erro ao criar permissões:", permError);
      } else {
        logger.info("✅ Perfil de permissões criado/atualizado na nuvem.");
      }
    }

    return data;
  } catch (err) {
    logger.error('Erro inesperado no provisionamento:', err);
    throw err;
  }
};

/**
 * Sincroniza a lista de usuários locais com a tabela de permissões no Supabase
 */
export const syncUsersToCloud = async (users: User[]) => {
  if (getDatabaseMode() === 'INTERNAL') return;
  if (!supabase || !users || users.length === 0) return;

  try {
    const usersToSync = users.map(u => {
      const normalizeValue = (val: string) => {
        if (!val) return '';
        const upper = val.toUpperCase();
        return (upper === 'DEFAULT' || upper === 'NULL' || upper === '0' || upper === 'default') ? '' : val;
      };
      const normalizeArray = (arr: unknown) => {
        if (!arr) return [];
        const array = Array.isArray(arr) ? arr : [arr];
        return array.map(v => String(v)).filter(v => normalizeValue(v) !== '');
      };
      const is_admin = u.is_admin || u.isAdmin || u.role === 'ADMIN' || u.role === 'MASTER' || isAdminEmail(u.email);
      const tenantVal = normalizeValue(u.tenantid || u.tenantid || u.tenantid || '');
      const filialVal = normalizeValue(u.filial || u._unitid || u.unitid || '');
      return {
        email: u.email.toLowerCase().trim(),
        username: u.username,
        name: u.name || u.username,
        role: u.role,
        is_admin,
        tenantid: tenantVal,
        filial: filialVal,
        units: normalizeArray(u.units || (filialVal ? [filialVal] : []))
      };
    });

    const { error } = await supabase
      .from('user_permissions')
      .upsert(usersToSync, { onConflict: 'email' });

    if (error) {
      logger.error('Erro ao sincronizar usuários com Supabase:', error);
      throw error;
    }
    
    logger.info(`[Supabase] Sincronização de ${usersToSync.length} usuários concluída.`);
  } catch (err) {
    logger.error('Erro inesperado na sincronização de usuários:', err);
    throw err;
  }
};

/**
 * Remove um usuário da tabela de permissões na nuvem
 */
export const deleteUserFromCloud = async (email: string) => {
  if (getDatabaseMode() === 'INTERNAL') return;
  if (!supabase) return;
  
  try {
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('email', email.toLowerCase().trim());
      
    if (error) {
      logger.error('Erro ao deletar usuário do Supabase:', error);
      throw error;
    }
  } catch (err) {
    logger.error('Erro inesperado ao deletar usuário:', err);
    throw err;
  }
};

/**
 * Busca todos os usuários da tabela de permissões (apenas para admins)
 */
export const fetchUsersFromCloud = async (tenantid?: string): Promise<User[]> => {
  if (getDatabaseMode() === 'INTERNAL') return [];
  if (!supabase) return [];

  try {
    logger.info(`[Supabase] Buscando usuários da nuvem (Tenant: ${tenantid || 'todos'})...`);
    let query = supabase.from('user_permissions').select('*');
    
    if (tenantid && tenantid !== '') {
      query = query.eq('tenantid', tenantid);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Erro ao buscar usuários do Supabase:', error);
      return [];
    }

    logger.info(`[Supabase] ${data?.length || 0} usuários encontrados na nuvem.`);
    
    if (data && data.length > 0) {
      const felipe = data.find((u: Record<string, unknown>) => String(u.email).toLowerCase() === 'felipe.messias@gmail.com');
      if (felipe) {
        logger.info('>>> [Supabase] Felipe found in cloud:', {
          email: felipe.email,
          tenantid: felipe.tenantid ?? felipe.tenantid ?? felipe.tenantid,
          filial: felipe.filial ?? felipe._unitid,
          units: felipe.units
        });
      }
    }

    return (data || []).map((u: Record<string, unknown>) => {
      const normalizeValue = (val: string) => {
        if (!val) return '';
        const upper = val.toUpperCase();
        return (upper === 'DEFAULT' || upper === 'NULL' || upper === '0' || upper === 'default') ? '' : val;
      };
      const normalizeArray = (arr: unknown) => {
        if (!arr) return [];
        const array = Array.isArray(arr) ? arr : [arr];
        return array.map(v => String(v)).filter(v => normalizeValue(v) !== '');
      };
      const uEmail = String(u.email || '');
      const is_admin = !!(u.is_admin || u.isAdmin || u.role === 'ADMIN' || u.role === 'MASTER' || isAdminEmail(uEmail));
      const tenantVal = normalizeValue(String(u.tenantid || ''));
      const filialVal = normalizeValue(String(u.filial || u._unitid || u.unitid || ''));
      return {
        username: String(u.username || uEmail.split('@')[0]),
        name: String(u.name || u.username || uEmail.split('@')[0]),
        email: uEmail,
        password: '', // Senhas não são expostas
        role: u.role as UserRole,
        is_admin,
        isAdmin: is_admin,
        mustChangePassword: false,
        tenantid: tenantVal,
        filial: filialVal,
        units: normalizeArray(u.units || (filialVal ? [filialVal] : []))
      };
    });
  } catch (err) {
    logger.error('Erro inesperado ao buscar usuários:', err);
    return [];
  }
};

/**
 * Busca um ativo específico pela etiqueta no Supabase (para consulta pública via QR Code)
 */
export const getAssetByTag = async (tag: string, tenantid?: string): Promise<Asset | null> => {
  if (!supabase) return null;

  try {
    let query = supabase
      .from('assets')
      .select('*')
      .eq('etiqueta', tag.toUpperCase().trim());
    
    // Tenta filtrar por _is_deleted se a coluna existir (soft delete)
    // Se falhar, o Supabase retornará erro 42703 (undefined_column)
    query = query.or('_is_deleted.is.null,_is_deleted.eq.false');
    
    if (tenantid) {
      query = query.eq('tenantid', tenantid);
    }

    const { data, error } = await query.single();

    if (error) {
      // Se o erro for coluna inexistente, tentamos sem o filtro de soft delete
      if (error.code === '42703' && error.message?.includes('_is_deleted')) {
        let retryQuery = supabase
          .from('assets')
          .select('*')
          .eq('etiqueta', tag.toUpperCase().trim());
        
        if (tenantid) {
          retryQuery = retryQuery.eq('tenantid', tenantid);
        }
        
        const { data: retryData, error: retryError } = await retryQuery.single();
        if (retryError && retryError.code !== 'PGRST116') {
          logger.error('Erro ao buscar ativo por etiqueta (retry):', retryError);
          return null;
        }
        return retryData as Asset;
      }

      if (error.code !== 'PGRST116') {
        logger.error('Erro ao buscar ativo por etiqueta:', error);
      }
      return null;
    }

    return data as Asset;
  } catch (err) {
    logger.error('Erro inesperado ao buscar ativo:', err);
    return null;
  }
};

export const fetchFullInventory = async (
  tenantid?: string | string[], 
  unitid?: string,
  onProgress?: (processed: number, total: number) => void,
  onComplete?: (config: Partial<InventoryState>) => void
): Promise<{ assets: Asset[], config: Partial<InventoryState> } | null> => {
  if (!supabase || !navigator.onLine) return null;

  let resolvedTenantid: string | string[] | undefined = tenantid;

  // Se resolvedTenantid for undefined, null, string "undefined" ou vazio, resolvemos via estado da sessão/perfil
  if (!resolvedTenantid || resolvedTenantid === 'undefined' || (Array.isArray(resolvedTenantid) && resolvedTenantid.length === 0)) {
    logger.info(">>> [Supabase Param check] tenantid recebido como indefinido ou vazio. Resolvendo via Sessão Suprema do Usuário...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        const profile = await ensureUserProfile(session.user.email, undefined, session.user.id);
        if (profile) {
          resolvedTenantid = profile.tenantid || undefined;
          logger.info(`>>> [Supabase Param resolved] tenantid sanitizado de undefined para perfil real: ${JSON.stringify(resolvedTenantid)}`);
        }
      }
    } catch (authErr) {
      logger.warn(">>> [Supabase Param err] Falha ao resolver tenantid via Auth Check:", authErr);
    }
  }

  logger.info(`>>> [Supabase] fetchFullInventory para tenantid: ${JSON.stringify(resolvedTenantid)}, unitid: ${unitid || 'GERAL'}`);

  try {
    // 1. Busca todos os ativos filtrados por tenantid e opcionalmente unitid (PAGINADO)
    let assets: Asset[] = [];
    const PAGE_SIZE = 200;
    let from = 0;
    let hasMore = true;

    logger.info(`>>> [Supabase] Iniciando busca paginada de ativos...`);

    while (hasMore) {
      let q = supabase
        .from('assets')
        .select('*')
        .range(from, from + PAGE_SIZE - 1);
      
      if (resolvedTenantid) {
        if (Array.isArray(resolvedTenantid)) q = q.in('tenantid', resolvedTenantid);
        else q = q.eq('tenantid', resolvedTenantid);
      }
      
      if (unitid && unitid !== '') {
        const cleanUnitId = unitid.toUpperCase().replace(/_/g, ' ').trim();
        q = q.eq('filial', cleanUnitId);
      }

      const { data: pageData, error: assetsError } = await q;
      
      if (assetsError) {
        logger.error(`[Supabase] Erro em fetchFullInventory (Paginação ${from}): ${assetsError.code} - ${assetsError.message}`, assetsError);
        throw assetsError;
      }

      if (pageData && pageData.length > 0) {
        const mappedPage = pageData.map((a: Record<string, unknown>) => {
          const tId = String(a.tenantid || '').trim().toUpperCase();
          const uId = String(a.filial || a.unit_id || a.unitid || '').trim().toUpperCase();

          return {
            ...a,
            id: a.id as string | number,
            tenantid: tId,
            filial: uId,
            unitid: uId      // Legado
          };
        }) as Asset[];
        
        assets = [...assets, ...mappedPage];
        logger.info(`>>> [Supabase] Carregados ${assets.length} ativos...`);

        if (onProgress) {
          onProgress(assets.length, 12636);
        }
        
        if (pageData.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
          // Yield to main thread to keep UI responsive
          await new Promise(resolve => setTimeout(resolve, 0));
        }
  } else {
    hasMore = false;
  }
}    logger.info(`>>> [Supabase] Busca concluída. Total: ${assets.length} ativos.`);


    // 2. Busca a configuração
    const rawTenantid = resolvedTenantid 
      ? (Array.isArray(resolvedTenantid) ? resolvedTenantid[0] : resolvedTenantid)
      : '';
    // Sanitização rigorosa: envolve em encodeURIComponent, remove espaços em branco extras e símbolos % espúrios
    const cleanTenant = encodeURIComponent(String(rawTenantid).trim().replace(/[%_\s]+/g, ''));
    const configId = cleanTenant ? `config_${cleanTenant}` : 'global_config';
    
    logger.info(`>>> [Supabase] Buscando config para ID: ${configId}`);
    
    let config: Record<string, unknown> = {};
    try {
      const { data: configData, error: configError } = await supabase
        .from('inventory_config')
        .select('*')
        .eq('id', configId)
        .maybeSingle();

      if (configError) {
        throw configError;
      } else if (configData) {
        logger.info('>>> [Supabase] Config encontrada para o tenant.');
        config = configData;
      } else {
        logger.info('>>> [Supabase] Config não encontrada para o tenant. Tentando global_config...');
        const { data: globalConfigData, error: globalError } = await supabase
          .from('inventory_config')
          .select('*')
          .eq('id', 'global_config')
          .maybeSingle();
          
        if (globalError) {
          throw globalError;
        } else if (globalConfigData) {
          logger.info('>>> [Supabase] global_config encontrada.');
          config = globalConfigData;
        } else {
          logger.warn('>>> [Supabase] Nenhuma configuração encontrada (nem tenant nem global). Disparando erro simulado PGRST204.');
          throw new Error('PGRST204');
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn(`>>> [SRE Fail-Safe] Interceptando falha ao ler configs da nuvem (Error: ${errMsg}). Injetando config Fallback...`);
      config = { 
        id: "config_CICOPAL", 
        tenantid: "CICOPAL", 
        status_operacao: "ATIVO", 
        sincronia_automatica: false, 
        geocerca_ativa: false 
      };
    }

    // Mapeamento reverso de snake_case para camelCase
    const reverseMapping: Record<string, string> = {
      'last_updated': 'lastUpdated',
      'editable_fields': 'editableFields',
      'qr_code_fields': 'qrCodeFields',
      'scanner_mode': 'scannerMode',
      'scan_feedback_mode': 'scanFeedbackMode',
      'inventory_search_mode': 'inventorySearchMode',
      'immersive_mode': 'immersiveMode',
      'dark_mode': 'darkMode',
      'battery_saver': 'batterySaver',
      'protheus_integration_enabled': 'protheusIntegrationEnabled',
      'protheus_api_url': 'protheusApiUrl',
      'mandatory_photo_on_divergence': 'mandatoryPhotoOnDivergence',
      'mandatory_photo_on_new_item': 'mandatoryPhotoOnNewItem',
      'database_mode': 'databaseMode'
    };

    const mappedConfig: Record<string, unknown> = {};
    Object.keys(config).forEach(key => {
      const camelKey = reverseMapping[key] || key;
      mappedConfig[camelKey] = (config as Record<string, unknown>)[key];
    });

    if (onComplete) {
      logger.info(`>>> [Supabase] Invocando onComplete() de forma atômica no final da paginação.`);
      await onComplete(mappedConfig);
    }

    return {
      assets: assets,
      config: mappedConfig as Partial<InventoryState>
    };
  } catch (err) {
    logger.error('Erro inesperado ao buscar inventário completo:', err);
    return null;
  }
};

/**
 * Assina mudanças em tempo real na tabela de configuração do inventário
 */
export const subscribeToInventoryChanges = (onUpdate: (payload: Partial<InventoryState>) => void) => {
  if (!supabase) return null;

  const channel = supabase
    .channel('inventory_config_changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'inventory_config',
        filter: 'id=eq.global_config'
      },
      (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => {
        onUpdate(payload.new);
      }
    )
    .subscribe();

  return channel;
};

/**
 * Assina mudanças em tempo real na tabela de ativos
 */
export const subscribeToAssetChanges = (tenantid: string | string[], onUpdate: (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => void) => {
  if (!supabase) return null;

  const channel = supabase
    .channel('asset_changes')
    .on(
      'postgres_changes',
      {
        event: '*', // Listen for INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'assets'
      },
      (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => {
        // Filtra por tenantid no lado do cliente se necessário, 
        // embora o ideal seja o RLS do Supabase já filtrar se o usuário estiver logado.
        // No entanto, para canais de broadcast/realtime, às vezes precisamos de filtros extras.
        const newAsset = payload.new as Asset;
        const oldAsset = payload.old as Asset;
        const targetAsset = newAsset || oldAsset;

        if (targetAsset && tenantid) {
          const assetTenant = targetAsset.tenantid || targetAsset.tenantid;
          const isAllowed = Array.isArray(tenantid) 
            ? tenantid.includes(assetTenant || '')
            : (assetTenant || '') === tenantid;
          
          if (isAllowed) {
            onUpdate(payload);
          }
        }
      }
    )
    .subscribe();

  return channel;
};

/**
 * Limpa todos os ativos e configurações do Supabase (ou apenas de uma empresa específica)
 */
export const clearCloudInventory = async (companyToClear?: string | string[], tenantid?: string): Promise<void> => {
  if (!supabase) return;

  if (!tenantid) {
    logger.warn(">>> [Security Guard] Abortando clearCloudInventory: tenantid nulo ou indefinido para evitar 'DELETE requires a WHERE clause'");
    return;
  }

  const isBatteryCritical = await sqliteService.isBatteryCritical?.() ?? false;
  if (isBatteryCritical) {
    throw new SupabaseBatteryException("Nível de bateria crítico (< 5%). Exclusão em massa abortada para proteção de hardware.");
  }

  try {
    logger.info(`[Supabase] Iniciando limpeza na nuvem. Empresa: ${companyToClear || 'TODAS'}, Tenant: ${tenantid}`);
    
    const executeDelete = async (colName: string) => {
      if (companyToClear) {
        if (Array.isArray(companyToClear)) {
          const normalizedCompanies = companyToClear.map(c => c.toUpperCase().trim());
          if (normalizedCompanies.length > 50) {
            logger.warn(`[Supabase] Array de unidades muito grande (${normalizedCompanies.length}). Dividindo em lotes...`);
            for (let i = 0; i < normalizedCompanies.length; i += 50) {
              const chunk = normalizedCompanies.slice(i, i + 50);
              const chunkQuery = supabase.from('assets').delete({ count: 'exact' }).eq('tenantid', tenantid).in(colName, chunk);
              const { error: chunkError } = await chunkQuery;
              if (chunkError) throw chunkError;
            }
            return { error: null, count: null };
          } else {
            return await supabase.from('assets').delete({ count: 'exact' }).eq('tenantid', tenantid).in(colName, normalizedCompanies);
          }
        } else {
          const normalized = companyToClear.toUpperCase().trim();
          return await supabase.from('assets').delete({ count: 'exact' }).eq('tenantid', tenantid).eq(colName, normalized);
        }
      } else {
         return await supabase.from('assets').delete({ count: 'exact' }).eq('tenantid', tenantid);
      }
    };

    let assetsError, count;
    try {
       const res = await executeDelete('filial');
       assetsError = res.error;
       count = res.count;
    } catch (e: unknown) {
       assetsError = e as Error;
    }

    if (assetsError) {
      // A coluna '_unitid' foi removida do banco (migração scripts/migrate-unitid-supabase.sql).
      // Em erro de coluna inexistente, parte direto para o delete radical (sem filtros de coluna).
      if (assetsError.code === '42703' || assetsError.code === 'PGRST204') {
        logger.warn('[Supabase] Coluna não encontrada na limpeza. Tentando delete radical...');
        const { error: finalError, count: finalCount } = await supabase.from('assets').delete({ count: 'exact' }).eq('tenantid', tenantid).filter('id', 'not.is', null);
        
        if (finalError) throw finalError;
        logger.info(`[Supabase] Limpeza radical concluída. Afetados: ${finalCount}`);
        return;
      }
      
      // Se o erro for de tipo (22P02), tentamos um filtro genérico
      if (assetsError.code === '22P02') {
        logger.warn('[Supabase] Erro de tipo detectado (bigint vs uuid). Tentando filtro genérico...');
        const { error: numError, count: numCount } = await supabase.from('assets').delete({ count: 'exact' }).eq('tenantid', tenantid).filter('id', 'not.is', null);
        if (numError) throw numError;
        logger.info(`[Supabase] Limpeza concluída via filtro genérico. Afetados: ${numCount}`);
        return;
      }

      logger.error('Erro ao limpar ativos na nuvem:', assetsError);
      throw assetsError;
    }
    
    logger.info(`[Supabase] Limpeza de ativos concluída. Registros afetados: ${count || 'desconhecido'}`);

    // 2. Limpa a configuração (apenas se estiver limpando TUDO)
    if (!companyToClear) {
      const rawTenantid = tenantid ? (Array.isArray(tenantid) ? tenantid[0] : tenantid) : '';
      const cleanTenant = encodeURIComponent(String(rawTenantid).trim().replace(/[%_\s]+/g, ''));
      const configId = cleanTenant ? `config_${cleanTenant}` : 'global_config';
      
      // Para o delete, tentamos ser o mais simples possível.
      // Se falhar por causa do cache do schema, ignoramos o erro de configuração
      // pois o objetivo principal (limpar ativos) já foi tentado.
      const { error: configError } = await supabase
        .from('inventory_config')
        .delete()
        .eq('id', configId);

      if (configError) {
        const isCacheError = configError.message?.includes('schema cache');
        if (isCacheError) {
          logger.warn('[Supabase] Erro de cache de schema ao deletar config. Ignorando para permitir conclusão da limpeza.');
        } else {
          logger.warn('Erro ao limpar configuração na nuvem (pode não existir):', configError);
        }
      }
    }
  } catch (err) {
    logger.error('Erro inesperado ao limpar nuvem:', err);
    throw err;
  }
};

/**
 * Verifica se um erro é relacionado ao limite de cota do Supabase (Storage/DB)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isQuotaExceededError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = String(err.code || '');
  return (
    msg.includes('quota exceeded') || 
    msg.includes('storage quota') || 
    msg.includes('payload too large') ||
    msg.includes('insufficient storage') ||
    err.status === 413 ||
    err.status === 507 ||
    code === '507' ||
    code === '413'
  );
};

/**
 * Faz upload de uma foto do ativo para o Supabase Storage com compressão client-side
 */
export const uploadAssetPhoto = async (assetId: string, file: File | Blob, tenantid: string): Promise<string | null> => {
  if (!supabase) return null;

  try {
    // 1. Compressão de Imagem (Escalabilidade de Storage)
    let fileToUpload = file;
    
    // Só comprime se for uma imagem e tiver tamanho considerável
    if (file instanceof File || file instanceof Blob) {
      try {
        logger.info(`[Storage] Aplicando Perfil WhatsApp (${(file.size / 1024 / 1024).toFixed(2)}MB)...`);
        fileToUpload = await compressImage(file);
        logger.info(`[Storage] Imagem otimizada para ${(fileToUpload.size / 1024).toFixed(2)}KB`);
      } catch (compressionError) {
        logger.warn('Erro na compressão, enviando original:', compressionError);
        fileToUpload = file;
      }
    }

    const fileExt = 'jpg'; // Forçamos jpg para consistência
    const fileName = `${tenantid}/${assetId}/${Date.now()}.${fileExt}`;
    const filePath = `photos/${fileName}`;

    // Verificação de Bucket
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      logger.warn('[Storage] Não foi possível verificar buckets:', bucketsError.message);
    } else {
      const bucketExists = buckets?.some((b: { name: string }) => b.name === 'asset-photos');
      if (!bucketExists) {
        const msg = 'Bucket "asset-photos" não encontrado. O administrador deve criá-lo no painel do Supabase via SQL Editor.';
        logger.error(`[Storage] ${msg}`);
        throw new Error(msg);
      }
    }

    const { error: uploadError } = await supabase.storage
      .from('asset-photos')
      .upload(filePath, fileToUpload, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      logger.error('Erro ao fazer upload da foto:', uploadError);
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('asset-photos')
      .getPublicUrl(filePath);

    if (!data || !data.publicUrl) {
      throw new Error('Falha ao gerar URL pública para a foto carregada.');
    }

    return data.publicUrl;
  } catch (err) {
    logger.error('Erro no processo de upload:', err);
    throw err; // Propaga o erro para que o SyncService registre a falha real
  }
};

/**
 * Remove uma foto do Supabase Storage
 */
export const deleteAssetPhoto = async (photoUrl: string): Promise<boolean> => {
  if (!supabase || !photoUrl) return false;

  try {
    // Extrai o caminho do arquivo da URL pública
    // Ex: https://.../storage/v1/object/public/asset-photos/photos/tenant/id/123.jpg
    const urlParts = photoUrl.split('/asset-photos/');
    if (urlParts.length < 2) return false;
    
    const filePath = urlParts[1];

    const { error } = await supabase.storage
      .from('asset-photos')
      .remove([filePath]);

    if (error) {
      logger.error('Erro ao deletar foto do storage:', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Erro inesperado ao deletar foto:', err);
    return false;
  }
};

/**
 * Solicita redefinição de senha por e-mail
 */
export const resetPassword = async (email: string) => {
  if (!supabase) return;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getAppBaseUrl(),
  });
  if (error) throw error;
};

/**
 * Busca os logs de auditoria do Supabase
 */
export const fetchAuditLogs = async (tenantid: string, recordId?: string): Promise<Record<string, unknown>[]> => {
  if (!supabase) return [];

  try {
    let query = supabase
      .from('audit_logs')
      .select('*')
      .eq('tenantid', tenantid)
      .order('timestamp', { ascending: false });

    if (recordId) {
      query = query.eq('record_id', recordId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Erro ao buscar logs de auditoria:', error);
      return [];
    }

    return (data || []) as Record<string, unknown>[];
  } catch (err) {
    logger.error('Erro inesperado ao buscar logs:', err);
    return [];
  }
};

/**
 * Busca os logs específicos de ativos (asset_logs) do Supabase
 */
export const fetchAssetLogs = async (tenantid: string, assetId?: string): Promise<Record<string, unknown>[]> => {
  if (!supabase) return [];

  try {
    let query = supabase
      .from('asset_logs')
      .select('*')
      .eq('tenantid', tenantid)
      .order('timestamp', { ascending: false });

    if (assetId) {
      query = query.eq('asset_id', assetId);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Erro ao buscar logs de ativos:', error);
      return [];
    }

    return (data || []) as Record<string, unknown>[];
  } catch (err) {
    logger.error('Erro inesperado ao buscar logs de ativos:', err);
    return [];
  }
};

/**
 * Busca um ativo globalmente no Supabase (em qualquer unidade/localização)
 */
export const findAssetGlobally = async (etiqueta: string, tenantid: string): Promise<Asset | null> => {
  if (!supabase) return null;
  
  const rawTerm = etiqueta.trim();
  const upperTerm = rawTerm.toUpperCase();
  
  // Tenta variações (original, upper, e com zero-padding se for apenas números)
  const variations = [upperTerm];
  if (/^\d+$/.test(rawTerm) && rawTerm.length < 6) {
    variations.push(rawTerm.padStart(6, '0'));
  }
  
  logger.info(`>>> [Supabase] Busca Global Iniciada: ${variations.join(' | ')} (Tenant: ${tenantid})`);
  
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('tenantid', tenantid)
    .in('etiqueta', variations)
    .maybeSingle();

  if (error) {
    logger.error('Erro na busca global Supabase:', error);
    return null;
  }

  return data as Asset | null;
};

/**
 * Exclui uma campanha
 */
export const deleteCampaign = async (campaignId: string): Promise<boolean> => {
  const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
  const isInternal = mode === 'INTERNAL';

  // Always perform local SQLite deletion first (Soberania Offline-First)
  logger.info('>>> [SQLite] Excluindo campanha do banco físico:', campaignId);
  try {
    await sqliteService.deleteCampaignSql(campaignId);
  } catch (err) {
    logger.error(">>> [SQLite] Falha ao excluir campanha localmente:", err);
    return false;
  }

  if (isInternal) {
    return true;
  }

  if (!supabase) {
    if (campaignSyncQueueDelegate) {
      await campaignSyncQueueDelegate(campaignId, 'DELETE').catch(console.error);
    }
    return true;
  }
  
  try {
    const { error } = await supabase.from('campaigns').delete().eq('id', campaignId);
    if (error) {
      logger.warn('>>> [Supabase] Erro ao excluir campanha na nuvem. Empilhando na fila delta:', error);
      if (campaignSyncQueueDelegate) {
        await campaignSyncQueueDelegate(campaignId, 'DELETE').catch(console.error);
      }
    }
  } catch (err) {
    logger.warn('>>> [Supabase] Falha de conexão ao excluir campanha. Empilhando na fila delta:', err);
    if (campaignSyncQueueDelegate) {
      await campaignSyncQueueDelegate(campaignId, 'DELETE').catch(console.error);
    }
  }
  
  return true;
};

/**
 * Atualiza apenas a URL da foto de um ativo na nuvem
 */
export const updateAssetPhotoUrl = async (assetId: string, photoUrl: string, tenantid: string) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('assets')
    .update({ _photoUrl: photoUrl })
    .eq('id', assetId)
    .eq('tenantid', tenantid);
  if (error) throw error;
};

/**
 * Busca todas as campanhas de um tenant/unidade na tabela única oficial
 */
export const fetchCampaigns = async (tenantid: string, unitid?: string | null): Promise<InventoryCampaign[]> => {
  const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
  const isInternal = mode === 'INTERNAL';
  const cleanTenantid = (tenantid || '').trim();

  // 1. SEMPRE BUSCA NO SQLITE PRIMEIRO (Soberania Local)
  let localCampaigns: InventoryCampaign[] = [];
  try {
    if (sqliteService.getIsInitialized()) {
      const sqlCampaigns = await sqliteService.getCampaigns(cleanTenantid);
      localCampaigns = (sqlCampaigns || []).map(c => ({
        ...c,
        tenantid: c.tenantid || cleanTenantid,
        filial: c.filial || c.unit_id || c._unitid,
        unit_id: c.filial || c.unit_id || c._unitid,
        status: c.status || 'ACTIVE'
      })) as InventoryCampaign[];
    } else {
      logger.warn(">>> [Local-First] SQLite não inicializado ainda. Ignorando consulta de campanhas locais.");
    }
  } catch (err) {
    logger.error(">>> [Local-First] Erro ao ler SQLite:", err);
  }

  // Se for apenas interno, filtramos e retornamos
  if (isInternal) {
    if (unitid) {
      const cleanUnitId = unitid.trim().toUpperCase();
      return localCampaigns.filter(c => {
        const cUnit = (String(c.filial || c.unit_id || c._unitid || '')).trim().toUpperCase();
        return cUnit === cleanUnitId || cUnit === '' || cUnit === 'GLOBAL';
      });
    }
    return localCampaigns;
  }

  // 2. TENTA BUSCAR NA NUVEM (Enriquecimento)
  if (!supabase || !cleanTenantid) return localCampaigns;

  try {
    let query = supabase
      .from('campaigns')
      .select('*')
      .eq('tenantid', cleanTenantid);
    
    if (unitid) {
      query = query.or(`filial.eq.${unitid},filial.is.null`);
    }

    const { data: cloudData, error } = await query.order('start_date', { ascending: false });

    if (error) {
      logger.warn('>>> [Supabase] Falha ao buscar nuvem (mantendo local):', error);
      return localCampaigns;
    }

    // 3. MERGE INTELIGENTE (Prioridade para os dados mais recentes de IDs únicos)
    const cloudCampaigns = (cloudData || []).map((c: Record<string, unknown>) => ({
      ...c,
      filial: (c.filial || c.unit_id || c._unitid) as string,
      tenantid: c.tenantid as string,
      unit_id: (c.filial || c.unit_id || c._unitid) as string
    })) as InventoryCampaign[];

    // Cria um mapa para evitar duplicatas, priorizando Cloud se houver conflito de ID
    const campaignMap = new Map<string, InventoryCampaign>();
    localCampaigns.forEach(c => campaignMap.set(c.id, c));
    cloudCampaigns.forEach(c => campaignMap.set(c.id, c));

    const merged = Array.from(campaignMap.values());
    logger.info(`>>> [Governance] Merge concluído: ${localCampaigns.length} locais, ${cloudCampaigns.length} nuvem. Total: ${merged.length}`);
    return merged;

  } catch (err) {
    logger.warn('>>> [Supabase] Erro de rede ao buscar campanhas. Retornando apenas locais.', err);
    return localCampaigns;
  }
};

/**
 * Cria uma nova campanha na tabela oficial única
 */
export const createCampaign = async (campaign: Partial<InventoryCampaign>): Promise<InventoryCampaign | null> => {
  const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
  const isInternal = mode === 'INTERNAL';

  const tenantVal = campaign.tenantid || campaign.tenantid || campaign.tenantid || '';
  const unitVal = campaign.filial || campaign._unitid || campaign.unit_id || '';

  // 1. DADO LOCAL PRIMEIRO (Soberania SQL)
  const newCampaign = {
    ...campaign,
    id: campaign.id || generateUUID(),
    tenantid: tenantVal,
    unit_id: String(unitVal || '').trim(),
    filial: String(unitVal || '').trim(),
    created_at: new Date().toISOString(),
    status: campaign.status || 'ACTIVE'
  } as InventoryCampaign;

  try {
    logger.info(">>> [Local-First] Persistindo campanha no SQLite antes da nuvem...");
    await sqliteService.saveCampaign(newCampaign as unknown as Record<string, unknown>);
    await sqliteService.persist(); 
  } catch (err) {
    logger.error(">>> [Local-First] Erro ao salvar localmente. Abortando.", err);
    return null;
  }

  // 2. SINCRONIZAÇÃO EM NUVEM (Resiliência Distribuída)
  if (!isInternal && supabase) {
    logger.info(">>> [Hybrid] Tentando subir campanha para nuvem...");
    const payload = {
      id: newCampaign.id,
      name: newCampaign.name,
      description: newCampaign.description,
      status: newCampaign.status,
      tenantid: tenantVal,
      filial: unitVal,
      created_by: campaign.created_by,
      start_date: newCampaign.start_date || new Date().toISOString()
    };

    // Usamos try-catch isolado para que erro de rede não mate o fluxo
    try {
      const { error } = await supabase
        .from('campaigns')
        .insert([payload]);
      
      if (error) {
        logger.warn(">>> [Supabase] Aviso ao inserir campanha na nuvem (será sincronizada depois):", error);
      } else {
        logger.info(">>> [Supabase] Campanha sincronizada com sucesso.");
      }
    } catch (err) {
      logger.warn(">>> [Supabase] Falha de conectividade detectada. O dado permanece seguro no SQLite Local.", err);
    }
  }

  // Retorna o objeto local independente do sucesso da nuvem
  return newCampaign;
};

/**
 * Outlines/Atualiza o status de uma campanha com suporte offline-first hibrido
 */
export const updateCampaignStatus = async (campaignId: string, status: CampaignStatus, closedBy?: string): Promise<boolean> => {
  const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
  const isInternal = mode === 'INTERNAL';

  // Always perform local SQLite update first (Soberania Offline-First)
  logger.info('>>> [SQLite] Atualizando status da campanha:', campaignId, 'para', status);
  let localFound = false;
  try {
    const row = await db.campaigns.get(campaignId);
    
    if (row) {
      const rowExtras = row as unknown as Record<string, unknown>;
      const currentCampaign: InventoryCampaign = {
        id: row.id,
        name: row.name,
        status: row.status as CampaignStatus,
        tenantid: row.tenantid || '',
        created_at: row.created_at,
        start_date: String(rowExtras.start_date || ''),
        created_by: String(rowExtras.created_by || ''),
        unit_id: String(rowExtras.filial || rowExtras._unitid || ''),
        filial: String(rowExtras.filial || rowExtras._unitid || '')
      };

      const updated: InventoryCampaign = { 
        ...currentCampaign, 
        status, 
        end_date: status === CampaignStatus.CLOSED ? new Date().toISOString() : (currentCampaign.end_date || undefined)
      };
      
      await sqliteService.saveCampaign(updated as unknown as Record<string, unknown>);
      await sqliteService.persist();
      localFound = true;
    }
  } catch (err) {
    logger.error(">>> [SQLite] Erro ao atualizar status localmente:", err);
    return false;
  }

  if (isInternal) {
    return localFound;
  }

  if (!supabase) {
    if (campaignSyncQueueDelegate) {
      await campaignSyncQueueDelegate(campaignId, 'UPDATE_STATUS', status, closedBy).catch(console.error);
    }
    return true;
  }

  try {
    const updateData: Partial<InventoryCampaign> = { 
      status, 
      end_date: status === CampaignStatus.CLOSED ? new Date().toISOString() : undefined 
    };

    if (status === CampaignStatus.CLOSED && closedBy) {
        updateData.closure_details = {
            closed_by: closedBy,
            closed_at: new Date().toISOString(),
            snapshot_status: 'PENDING'
        };
    }

    const { error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId);
    
    if (error) {
      logger.warn('>>> [Supabase] Erro ao atualizar status da campanha na nuvem. Empilhando na fila delta:', error);
      if (campaignSyncQueueDelegate) {
        await campaignSyncQueueDelegate(campaignId, 'UPDATE_STATUS', status, closedBy).catch(console.error);
      }
    } else {
      // Se estiver fechando, dispara o snapshot histórico (CPC 27)
      if (status === CampaignStatus.CLOSED) {
          logger.info(`>>> [Audit] Iniciando processamento de Snapshot para Campanha: ${campaignId}`);
          createCampaignSnapshot(campaignId, closedBy || 'admin').catch(console.error);
      }
    }
  } catch (err) {
    logger.warn('>>> [Supabase] Falha de conexão ao atualizar status da campanha. Empilhando na fila delta:', err);
    if (campaignSyncQueueDelegate) {
      await campaignSyncQueueDelegate(campaignId, 'UPDATE_STATUS', status, closedBy).catch(console.error);
    }
  }

  return true;
};

/**
 * Cria um Snapshot (Congelamento) de todos os ativos de uma campanha.
 * Isso garante que o Laudo Final seja imutável conforme CPC 27.
 */
export const createCampaignSnapshot = async (campaignId: string, closedBy: string): Promise<boolean> => {
    const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
    const isInternal = mode === 'INTERNAL';

    if (isInternal) {
      logger.info('>>> [SQLite] Criando Snapshot de Campanha (Encerramento)...');
      try {
        // 1. Localiza a campanha no SQLite
        // Buscamos o tenantid preferencial do localStorage ou um fallback
        const tenantid = (localStorage.getItem('app_last_tenant') || readLocalTenantId() || readSessionTenantId() || '').trim();
        if (!tenantid || tenantid === 'undefined' || tenantid === 'null') {
          logger.error('>>> [SQLite] tenantid ausente para o snapshot da campanha.');
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('gbr_session_expired', {
              detail: { message: "Identificador de Contrato ausente para congelamento de laudo. Sessão encerrada." }
            }));
          }
          return false;
        }
        const allCampaigns = await sqliteService.getCampaigns(tenantid);
        const currentCampaign = allCampaigns.find(c => c.id === campaignId) || null;

        if (!currentCampaign) {
          logger.error('>>> [SQLite] Campanha não encontrada para snapshot:', campaignId);
          return false;
        }

        // 2. Busca ativos vinculados da unidade
        const allAssets = await sqliteService.getAllAssets();
        const unitId = String(currentCampaign.filial || currentCampaign._unitid || currentCampaign.unit_id || '');
        const assets = allAssets.filter((a: Record<string, unknown>) => {
            const aUnit = String(a.filial || a._unitid || '').trim().toUpperCase();
            const cUnit = (unitId || '').trim().toUpperCase();
            return cUnit === '' || aUnit === cUnit;
        });

        if (assets.length === 0) {
          logger.warn('>>> [SQLite] Nenhum ativo encontrado para o snapshot.');
        }

        // 3. Stats
        const stats = {
          total: assets.length,
          inventoried: assets.filter(a => a._conferido || a.status === 'CONFERIDO').length,
          divergences: assets.filter(a => a.TAG_INVENTARIO === 'DIVERGÊNCIA').length,
          generated_at: new Date().toISOString(),
          cpc_compliance: 'CPC 27 / NBC TG 27 (MODO LOCAL)'
        };

        // 4. Salva no SQLite
        const snapshot: CampaignSnapshot = {
          id: `snap_${campaignId}_${Date.now()}`,
          campaign_id: campaignId,
          assets_data: assets as unknown as Asset[],
          metadata: stats,
          snapshot_date: new Date().toISOString(),
          closed_by: closedBy,
          tenantid: tenantid
        };

        await db.campaign_snapshots.put({
          id: snapshot.id,
          campaign_id: snapshot.campaign_id,
          assets_data: JSON.stringify(snapshot.assets_data),
          metadata: JSON.stringify(snapshot.metadata),
          closed_at: snapshot.snapshot_date,
          closed_by: snapshot.closed_by || '',
          tenantid: snapshot.tenantid
        });

        logger.info('>>> [SQLite] Snapshot criado com sucesso.');
        return true;
      } catch (err) {
        logger.error('>>> [SQLite] Erro ao criar snapshot local:', err);
        return false;
      }
    }

    if (!supabase) return false;

    try {
        // 1. Busca os detalhes da campanha
        const { data: campaign } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', campaignId)
            .single();

        if (!campaign) return false;

        const tenantid = campaign.tenantid || '';

        // 2. Busca todos os ativos vinculados a esta unidade (Escopo da Campanha)
        const { data: assets, error: assetError } = await supabase
            .from('assets')
            .select('*')
            .eq('tenantid', tenantid)
            .eq('filial', campaign.filial || campaign.unit_id || campaign._unitid);

        if (assetError) throw assetError;

        if (!assets || assets.length === 0) {
            logger.warn('>>> [Snapshot] Nenhum ativo encontrado para snapshot.');
            return false;
        }

        // 3. Calcula metadados/stats para o laudo consolidado
        const stats = {
            total: assets.length,
            inventoried: assets.filter((a: Record<string, unknown>) => a._conferido).length,
            divergences: assets.filter((a: Record<string, unknown>) => a.TAG_INVENTARIO === 'DIVERGÊNCIA').length,
            generated_at: new Date().toISOString(),
            cpc_compliance: 'CPC 27 / NBC TG 27'
        };

        // 4. Salva o Snapshot em JSONB (Alta eficiência de armazenamento v24.50)
        // Isso evita criar 12k linhas extras no banco, preservando o limite free de 500MB
        const { error: snapshotError } = await supabase
            .from('campaign_snapshots')
            .insert([{
                campaign_id: campaignId,
                assets_data: assets as Asset[],
                metadata: stats as Record<string, unknown>,
                closed_at: new Date().toISOString(),
                closed_by: closedBy,
                tenantid: tenantid
            }]);

        if (snapshotError) throw snapshotError;

        // 5. Atualiza a campanha com o status do snapshot
        await supabase
            .from('campaigns')
            .update({ 
                closure_details: { 
                    ...(campaign.closure_details || {}), 
                    snapshot_status: 'COMPLETED',
                    snapshot_size: assets.length 
                } 
            })
            .eq('id', campaignId);

        logger.info(`>>> [Audit] Snapshot de ${assets.length} ativos finalizado para campanha ${campaignId}`);
        return true;
    } catch (err) {
        logger.error('Erro ao criar snapshot:', err);
        return false;
    }
};

/**
 * Busca o Snapshot histórico de uma campanha encerrada.
 */
export const getCampaignSnapshot = async (campaignId: string): Promise<CampaignSnapshot | null> => {
    const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
    const isInternal = mode === 'INTERNAL';

    if (isInternal) {
      logger.info('>>> [SQLite] Recuperando Snapshot da campanha:', campaignId);
      try {
        const snapshots = await db.campaign_snapshots.where('campaign_id').equals(campaignId).toArray();
        if (snapshots.length === 0) return null;
        
        // Sort by closed_at descending (latest first)
        snapshots.sort((a, b) => b.closed_at.localeCompare(a.closed_at));
        
        const row = snapshots[0];
        return {
          id: row.id,
          campaign_id: row.campaign_id,
          assets_data: JSON.parse(row.assets_data),
          metadata: JSON.parse(row.metadata),
          snapshot_date: row.closed_at,
          closed_by: row.closed_by,
          tenantid: row.tenantid || readLocalTenantId() || readSessionTenantId() || ''
        } as CampaignSnapshot;
      } catch (err) {
        logger.error('>>> [SQLite] Erro ao recuperar snapshot:', err);
        return null;
      }
    }

    if (!supabase) return null;
    
    try {
        const { data, error } = await supabase
            .from('campaign_snapshots')
            .select('*')
            .eq('campaign_id', campaignId)
            .maybeSingle();

        if (error) throw error;
        return data as CampaignSnapshot;
    } catch (err) {
        logger.error('Erro ao buscar snapshot:', err);
        return null;
    }
};

/**
 * Busca estatísticas de uma campanha
 */
export const fetchCampaignStats = async (campaignId: string, tenantid: string) => {
  if (!supabase) return null;
  
  try {
    // Total de ativos no tenant
    const { count: totalCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('tenantid', tenantid);
      
    // Ativos inventariados — contrato public.assets: `currentCampaignId` é
    // runtime LOCAL (coluna inexistente no public → PGRST204; não sincronizada).
    // O marcador sincronizado de conferência é `status = 'CONFERIDO'` (espelha o
    // snapshot local: a._conferido || a.status === 'CONFERIDO').
    const { count: inventoriedCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('tenantid', tenantid)
      .eq('status', 'CONFERIDO');

    // Divergências — contrato public.assets: `TAG_INVENTARIO` é runtime LOCAL
    // (coluna inexistente no public → PGRST204; não sincronizada). A divergência
    // canônica do app (determineTag / regra de ouro) é derivável das colunas
    // sincronizadas: status ≠ *BAIXA* E databaixa presente (isGoldenRuleDivergent).
    const { count: divergenceCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('tenantid', tenantid)
      .not('status', 'ilike', '%BAIXA%')
      .not('databaixa', 'is', null);

    return {
      total: totalCount || 0,
      inventoried: inventoriedCount || 0,
      divergences: divergenceCount || 0
    };
  } catch (err) {
    logger.error('Erro ao buscar estatísticas da campanha:', err);
    return null;
  }
};

/**
 * Salva ou atualiza a configuração de geofencing de uma unidade
 * Estratégia Local-First: Salva no IndexedDB imediatamente e tenta sincronizar com a nuvem em background
 */
export const saveUnitConfig = async (config: UnitConfig): Promise<boolean | string> => {
  try {
    const mode = localStorage.getItem('app_database_mode');
    const isInternal = mode === 'INTERNAL';
    
    // 1. SALVAMENTO SQLITE (Prioritário para Soberania de Dados)
    try {
      const { sqliteService } = await import('./sqliteService');
      await sqliteService.saveUnitConfigToSql(config as unknown as Record<string, unknown>);
      logger.info('>>> [Persistence] GPS persistido no SQLite Físico.');
    } catch (sqlErr) {
      logger.error('>>> [Persistence] Falha ao gravar GPS no SQLite:', sqlErr);
    }

    const tenantidRaw = (config.tenantid || readLocalTenantId() || readSessionTenantId() || '').toString().trim();
    const cleanTenantidRaw = tenantidRaw !== 'undefined' && tenantidRaw !== 'null' ? tenantidRaw : 'CICOPAL';
    
    const unitIdRaw = ((config as unknown as Record<string, unknown>).filial || config.unit_id || config._unitid || localStorage.getItem('filial') || sessionStorage.getItem('filial') || '').toString().trim();
    const cleanUnitIdRaw = unitIdRaw !== 'undefined' && unitIdRaw !== 'null' ? unitIdRaw : 'FEIRA_BOA_BA';

    if (!cleanTenantidRaw || !cleanUnitIdRaw) {
      logger.warn(">>> [Session] Identificador de Contrato ou Filial ausente ao salvar configuração de filial. Fallback injetado.");
    }
    
    const tenantid = cleanTenantidRaw || 'CICOPAL';
    const unitId = cleanUnitIdRaw || 'FEIRA_BOA_BA';
    const unitKey = `${tenantid}_${unitId}`.replace(/\s+/g, '_');
    
    const payload = {
      filial: unitId,
      tenantid: tenantid,
      unit_id: unitId, // Legado
      lat: Number(config.lat),
      lng: Number(config.lng),
      radius_meters: Number(config.radius_meters),
      is_active: Boolean(config.is_active),
      updated_by: String(config.updated_by || 'system'),
      updated_at: new Date().toISOString()
    };

    logger.info('>>> [Persistence] Salvando GPS Local-First (Cache):', unitKey);

    // 2. SALVAMENTO CACHE (LocalStorage + Dexie)
    const localConfigs = JSON.parse(localStorage.getItem('local_unit_configs') || '{}');
    localConfigs[unitKey] = payload;
    localStorage.setItem('local_unit_configs', JSON.stringify(localConfigs));

    try {
      await localDb.unitConfigs.put({
        ...payload,
        unit_id: unitId,
        tenantid: tenantid
      } as UnitConfig);
    } catch (dexieErr) {
      logger.warn('>>> [Persistence] Falha ao espelhar GPS no Dexie:', dexieErr);
    }

    // Se for modo INTERNO, encerramos aqui (Isolamento Total)
    if (isInternal) {
      return true;
    }

    if (!supabase) return false;

  // 2. TENTATIVA DE SINCRONIZAÇÃO EM BACKGROUND (Apenas modo SUPABASE)
  const syncToCloud = async () => {
      try {
        // Tentativa na tabela de configuração (inventory_config) de forma segura conforme v2.6 (tenantid e filial)
        const { error } = await supabase
          .from('inventory_config')
          .upsert({
            tenantid: tenantid,
            filial: unitId,
            data: payload,
            updated_at: new Date().toISOString()
          });

        if (error) {
          logger.warn(`>>> [Supabase] Sincronização de config falhou (Code: ${error.code}): ${error.message}`);
          // Se for erro de RLS ou coluna, tentamos um fallback para log_audit para não perder o rastro
          if (error.code === '42501' || error.code === 'PGRST204') {
             await logAuditEvent({
               user_email: payload.updated_by,
               action: 'GPS_CONFIG_SYNC_FAIL',
               details: `Falha ao sincronizar configuração de unidade ${unitId}. Erro: ${error.message}`,
               tenantid: tenantid
             });
          }
        } else {
          logger.info('>>> [Supabase] Configuração de unidade sincronizada com a nuvem com sucesso!');
        }
      } catch (err) {
        logger.warn('>>> [Supabase] Erro silencioso na sincronização:', err);
      }
    };

    syncToCloud();

    // Retornamos TRUE imediatamente porque o dado já está no localStorage
    return true;
  } catch (err: unknown) {
    const error = err as Error;
    logger.error('Erro no salvamento Local-First:', error);
    return `Erro Local: ${error.message || 'Falha ao gravar no navegador'}`;
  }
};

/**
 * Busca as configurações de geofencing combinando Local e Nuvem
 */
export const fetchUnitConfigs = async (tenantid: string): Promise<UnitConfig[]> => {
  const mode = localStorage.getItem('app_database_mode') || 'INTERNAL';
  const isInternal = mode === 'INTERNAL';
  
  try {
    const configs: Record<string, UnitConfig> = {};

    // 1. Carrega do LocalStorage (Sempre disponível)
    const localData = JSON.parse(localStorage.getItem('local_unit_configs') || '{}');
    
    // Se o localStorage estiver vazio, tenta recuperar do Dexie
    if (Object.keys(localData).length === 0) {
      logger.info('>>> [Persistence] LocalStorage de GPS vazio. Tentando Dexie...');
      const dexieConfigs = await localDb.unitConfigs.toArray();
      if (dexieConfigs.length > 0) {
        dexieConfigs.forEach(c => {
          const key = `${c.tenantid}_${c.unit_id}`.replace(/\s+/g, '_');
          localData[key] = c;
        });
        localStorage.setItem('local_unit_configs', JSON.stringify(localData));
      }
    }

    // 1.1 Carrega do SQLite Físico (Soberania de Dados)
    // ATENÇÃO: a tabela unit_configs guarda flags de política (hasGps/requireNf...) e o
    // saveUnitConfigs mapeia SEM lat/lng/unit_id. Só consideramos âncora GPS registros com
    // filial/unit_id + coordenadas não-zero, e NUNCA retornamos cedo no INTERNAL antes de
    // mesclar o cache rico local (localStorage/Dexie) — senão o botão GPS fica apagado para
    // todas as unidades, mesmo as que têm âncora gravada.
    try {
      const { sqliteService } = await import('./sqliteService');
      if (sqliteService.getIsInitialized()) {
        const sqlConfigs = await sqliteService.getUnitConfigsFromSql();
        if (sqlConfigs && sqlConfigs.length > 0) {
          sqlConfigs.forEach(c => {
            const rec = c as Record<string, unknown>;
            const unitId = String(rec.filial || rec.unit_id || '');
            if (!unitId) return;
            const hasCoords = rec.lat !== undefined && rec.lng !== undefined &&
              !isNaN(Number(rec.lat)) && !isNaN(Number(rec.lng)) &&
              Number(rec.lat) !== 0 && Number(rec.lng) !== 0;
            if (!hasCoords) return; // registro de política sem âncora GPS → ignora
            configs[unitId] = {
              ...(rec as unknown as UnitConfig),
              filial: unitId,
              unit_id: unitId,
              tenantid: String(rec.tenantid || tenantid)
            };
          });
        }
      } else {
        logger.warn('>>> [Persistence] SQLite não inicializado ainda. Ignorando consulta de UnitConfigs locais neste ciclo.');
      }
    } catch (err) {
      logger.warn('>>> [Persistence] Erro ao recuperar UnitConfigs do SQLite:', err);
    }

    // Cache rico (localStorage local_unit_configs + espelho Dexie) — fonte de verdade da
    // ancora GPS. Vence o SQLite para a mesma unidade (mesma chave unitId).
    // O filtro de tenant tolera o fallback 'CICOPAL'/vazio para nunca perder ancoras
    // gravadas com o tenant padrao.
    const tNorm = String(tenantid || '').trim().toUpperCase();
    const tenantIsFallback = !tNorm || tNorm === 'CICOPAL' || tNorm === 'UNDEFINED' || tNorm === 'NULL';
    Object.values(localData).forEach((c: unknown) => {
      const config = c as UnitConfig;
      const cfgTenant = String(config.tenantid || '').trim().toUpperCase();
      if (cfgTenant === tNorm || (tenantIsFallback && (!cfgTenant || cfgTenant === 'CICOPAL'))) {
        configs[config.filial || config.unit_id || ''] = config;
      }
    });

    // FIX(CRITICO): tambem le as ancoras gravadas diretamente pelo UnitConfigurator
    // (localStorage `kardek_gps_ancora_<unidade>` + sessionStorage `gps_lat_/gps_lng_`).
    // Garante que a ancora resolva mesmo se o espelho `local_unit_configs` falhar ou o
    // tenant divergir — o botao GPS nunca mais fica 'SEM ANCORA' depois de salvar.
        // Helper canônico de âncora real — utils/gpsAnchors (coberto por testes).
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kardek_gps_ancora_')) {
          const rec = JSON.parse(localStorage.getItem(key) || 'null') as Record<string, unknown> | null;
          const uId = String(rec?.filial || rec?.unit_id || rec?._unitid || '').trim();
          if (uId && hasRealAnchor(rec?.lat, rec?.lng)) {
            configs[uId] = {
              ...(rec as unknown as UnitConfig),
              filial: uId,
              unit_id: uId,
              tenantid: String(rec?.tenantid || tenantid)
            };
          }
        }
      }
    } catch (err) {
      logger.warn('>>> [Persistence] Falha ao ler ancoras kardek_gps_ancora do localStorage:', err);
    }

    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith('gps_lat_')) {
          const unit = key.slice('gps_lat_'.length);
          const lat = Number(sessionStorage.getItem(key));
          const lng = Number(sessionStorage.getItem('gps_lng_' + unit));
          if (unit && hasRealAnchor(lat, lng)) {
            configs[unit] = {
              filial: unit,
              unit_id: unit,
              tenantid: tenantid || 'CICOPAL',
              lat,
              lng,
              radius_meters: Number(sessionStorage.getItem('unit_gps_radius_' + unit)) || 500,
              is_active: true,
              updated_at: new Date().toISOString()
            } as UnitConfig;
          }
        }
      }
    } catch (err) {
      logger.warn('>>> [Persistence] Falha ao ler ancoras gps_lat do sessionStorage:', err);
    }

    // Se for modo interno, retornamos apenas o que está no local
    if (isInternal) {
      logger.info(`>>> [Local] fetchUnitConfigs retornando ${Object.values(configs).length} configs locais.`);
      return Object.values(configs);
    }

    if (!supabase) return Object.values(configs);
    
    // 2. Tenta carregar da Nuvem (inventory_config) para atualizar o local
    try {
      const { data, error } = await supabase
        .from('inventory_config')
        .select('*')
        .eq('tenantid', tenantid);

      if (data && !error) {
        data.forEach((item: Record<string, unknown>) => {
          const itemData = item.data as Record<string, unknown> | undefined;
          const tenantidResolved = String(item.tenantid || (itemData && resolveTenantId(itemData)) || tenantid);
          const filialUnit = String(item.filial || item._unitid || (itemData && (itemData.filial || itemData._unitid || itemData.unit_id)) || localStorage.getItem('filial') || sessionStorage.getItem('filial') || '');
          
          configs[filialUnit] = {
            ...(itemData || {}),
            filial: filialUnit,
            tenantid: tenantidResolved,
            unit_id: filialUnit,
            lat: Number((itemData && itemData.lat) ?? 0),
            lng: Number((itemData && itemData.lng) ?? 0),
            radius_meters: Number((itemData && itemData.radius_meters) ?? 0),
            is_active: !itemData || itemData.is_active !== false
          } as UnitConfig;
        });
        
        // Atualiza o local com o que veio da nuvem, mas preserva dados locais mais recentes
        const updatedLocal = { ...localData };
        data.forEach((item: Record<string, unknown>) => { 
          const cloudTime = new Date(String(item.updated_at || '') || 0).getTime();
          const itemKey = String(item.filial || item.unit_key || `${item.tenantid || tenantid}_${item.filial || localStorage.getItem('filial') || sessionStorage.getItem('filial') || ''}`);
          const localItem = localData[itemKey];
          const localTime = localItem ? new Date(String(localItem.updated_at || '') || 0).getTime() : 0;
          
          // Só sobrescreve se o dado da nuvem for realmente mais novo
          if (cloudTime >= localTime) {
            updatedLocal[itemKey] = item.data || item; 
          }
        });
        localStorage.setItem('local_unit_configs', JSON.stringify(updatedLocal));
      }
    } catch (err) {
      logger.warn('>>> [Supabase] Falha ao buscar configs da nuvem, usando apenas locais.', err);
    }

    return Object.values(configs);
  } catch (err) {
    logger.error('Erro ao buscar configs Local-First:', err);
    return [];
  }
};
