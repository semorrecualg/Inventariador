
import { createClient } from '@supabase/supabase-js';
import imageCompression from 'browser-image-compression';
import { Asset, InventoryState, User, UserRole, InventoryCampaign, CampaignStatus, UnitConfig } from '../types';
import { getAppBaseUrl } from '../utils/urlUtils';
import { deduplicateRedundantString } from '../utils/formatUtils';
import { sanitizeForSupabase } from './utils';

export interface ProvisionResult {
  user?: unknown;
  success?: boolean;
  existing?: boolean;
}

// Credenciais fixas para garantir conexão com o projeto correto (MPULMON)
// Isso ignora o cache de variáveis de ambiente do navegador que está causando erros
const CORRECT_URL = 'https://mpulmonxbcpqjxouzvuc.supabase.co';
const CORRECT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wdWxtb254YmNwcWp4b3V6dnVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTExMTUsImV4cCI6MjA4NzEyNzExNX0.itf1-hY2F8L4uwcYhugh_ZZOrKwK1PXm8JHFEMXQQaw';

const supabaseUrl = CORRECT_URL;
const supabaseAnonKey = CORRECT_KEY;
// Limpeza robusta do schema para evitar caracteres como [ ] vindos de logs ou envs
const supabaseSchema = (import.meta.env.VITE_SUPABASE_SCHEMA || 'public').replace(/[[]\]/g, '').trim();

// Initialize client only if credentials exist to prevent crash
// Blindagem Dinâmica: O modo é verificado em tempo real para evitar chamadas fantasmas
const getDatabaseMode = () => localStorage.getItem('app_database_mode') || 'INTERNAL';

// Teste de conexão expandido (REST e AUTH) - Removido auto-run para evitar loops em modo offline
export const testSupabaseConnection = async () => {
  if (getDatabaseMode() === 'INTERNAL') return false;
  if (!supabaseUrl || !supabaseAnonKey) return false;
  
  try {
    const restTest = await fetch(`${supabaseUrl}/rest/v1/`, { headers: { 'apikey': supabaseAnonKey } });
    console.log(`%c[Supabase] Conectividade REST: ${restTest.status === 200 ? 'OK' : 'ERRO ' + restTest.status}`, restTest.status === 200 ? "color: #3ecf8e;" : "color: #ef4444;");
    
    const authTest = await fetch(`${supabaseUrl}/auth/v1/health`, { headers: { 'apikey': supabaseAnonKey } });
    console.log(`%c[Supabase] Conectividade AUTH: ${authTest.status === 200 ? 'OK' : 'ERRO ' + authTest.status}`, authTest.status === 200 ? "color: #3ecf8e;" : "color: #ef4444;");
    return true;
  } catch (err) {
    console.error('[Supabase] Falha crítica de conectividade:', err);
    return false;
  }
};

if (supabaseUrl && supabaseAnonKey) {
  const currentMode = getDatabaseMode();
  if (currentMode !== 'INTERNAL') {
    console.log(`%c[Supabase] Conectado ao Ambiente: ${import.meta.env.VITE_ENVIRONMENT || 'development'}`, "color: #3ecf8e; font-weight: bold;");
    console.log(`%c[Supabase] URL: ${supabaseUrl}`, "color: #3ecf8e;");
    console.log(`%c[Supabase] Schema: [${supabaseSchema}]`, "color: #3ecf8e;");
  } else {
    console.log(`%c[Supabase] Modo INTERNO detectado. Conexões com a nuvem suspensas para economia de dados e estabilidade.`, "color: #f59e0b; font-weight: bold;");
  }
}

// O cliente Supabase é inicializado com persistência desativada se estivermos em modo interno no momento do load
// No entanto, as funções individuais fazem a blindagem em tempo real
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      db: {
        schema: supabaseSchema
      },
      auth: {
        autoRefreshToken: getDatabaseMode() !== 'INTERNAL',
        persistSession: getDatabaseMode() !== 'INTERNAL',
        detectSessionInUrl: getDatabaseMode() !== 'INTERNAL'
      }
    })
  : null;

/**
 * Realiza o logout completo do sistema, limpando sessões locais e da nuvem
 */
export const signOut = async () => {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Supabase] Erro ao deslogar da nuvem:', err);
    }
  }
  
  // Limpa o localStorage independente do sucesso do Supabase
  localStorage.removeItem('app_current_user');
  localStorage.removeItem('app_database_mode');
  localStorage.removeItem('app_selected_unit');
  localStorage.removeItem('app_screen_history');
  
  // Recarrega para limpar o estado do React
  window.location.href = '/';
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
  _tenantid?: string;
  origin?: string;
}) => {
  if (!supabase || localStorage.getItem('app_database_mode') === 'INTERNAL') return;

  try {
    // Sanitiza dados para evitar erros de estrutura circular
    const sanitizedEntry = {
      ...entry,
      new_data: entry.new_data ? sanitizeForSupabase(entry.new_data) : undefined,
      old_data: entry.old_data ? sanitizeForSupabase(entry.old_data) : undefined
    };

    const { error } = await Promise.race([
      supabase.from('audit_logs').insert([sanitizedEntry]),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("LOG_TIMEOUT")), 2000))
    ]).catch(err => ({ error: err })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (error && error.message !== "LOG_TIMEOUT") {
      console.error('Erro ao registrar log de auditoria:', error);
    }
  } catch (err) {
    console.error('Erro inesperado ao registrar log:', err);
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
  _tenantid?: string;
}) => {
  if (getDatabaseMode() === 'INTERNAL') return;
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
      console.error('Erro ao registrar log de ativo:', error);
    }
  } catch (err) {
    console.error('Erro inesperado ao registrar log de ativo:', err);
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
      .eq('_tenantid', tenantid);
      
    if (error) {
      console.error('Erro ao buscar localidades:', error);
      return [];
    }
    return data;
  } catch (err) {
    console.error('Erro inesperado ao buscar localidades:', err);
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
  _tenantid: string;
}) => {
  if (getDatabaseMode() === 'INTERNAL') return null;
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('locations')
      .upsert([location], { onConflict: 'name, _tenantid' })
      .select()
      .single();
      
    if (error) {
      console.error('Erro ao salvar localidade:', error);
      throw error;
    }
    return data;
  } catch (err) {
    console.error('Erro inesperado ao salvar localidade:', err);
    throw err;
  }
};

export const signUp = async (email: string, password: string, username: string, tenantid: string, role: string = 'ADMIN', name?: string, unitid?: string, units?: string[]) => {
  if (getDatabaseMode() === 'INTERNAL') throw new Error("Modo INTERNO não permite cadastro na nuvem.");
  if (!supabase) throw new Error("Supabase não configurado.");
  
  // 1. Cria o usuário no Supabase Auth
  console.log(`[Supabase] Cadastrando usuário ${email} com tenant ${tenantid}...`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        name: name || username,
        role,
        _tenantid: tenantid,
        _unitid: unitid || '',
        units: units || (unitid ? [unitid] : []),
        tenants: [tenantid] // Legado
      },
    },
  });
  
  if (error) {
    console.error('[Supabase] Erro no signUp:', error);
    if (error.message.includes('already registered')) {
      throw new Error('Este e-mail já está cadastrado. Tente fazer login ou recupere sua senha.');
    }
    throw error;
  }
  
  console.log(`[Supabase] Usuário cadastrado com sucesso no Auth:`, data.user?.email);

  // 2. Cria o perfil na tabela user_permissions para garantir sincronia
  if (data.user) {
    console.log(`[Supabase] Sincronizando perfil na tabela user_permissions para ${email}...`);
    const { error: permError } = await supabase
      .from('user_permissions')
      .upsert([{
        id: data.user.id, // Sincroniza com o ID do Auth
        email: email.toLowerCase(),
        username,
        name: name || username,
        role,
        is_admin: role === 'ADMIN' || role === 'MASTER',
        _tenantid: tenantid,
        _unitid: unitid || '',
        units: units || (unitid ? [unitid] : []),
        tenants: [tenantid]
      }], { onConflict: 'email' });
      
    if (permError) {
      console.error('[Supabase] Erro ao sincronizar perfil:', permError);
      console.warn("Erro ao criar permissões, mas usuário foi criado no Auth:", permError);
    } else {
      console.log(`[Supabase] Perfil sincronizado com sucesso para ${email}.`);
    }

    // 3. Log de Auditoria
    await logAuditEvent({
      user_email: email,
      action: 'SIGN_UP',
      table_name: 'user_permissions',
      record_id: data.user.id,
      details: `Novo usuário cadastrado: ${username} (${role})`,
      _tenantid: tenantid
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
    const is_admin_new = (lowerEmail === 'semorr@gmail.com' || lowerEmail === 'semorr@gmail.com.br');
    return {
      email: lowerEmail,
      username: lowerEmail.split('@')[0],
      role: is_admin_new ? 'ADMIN' : 'AUDITOR',
      is_admin: is_admin_new,
      isAdmin: is_admin_new,
      _tenantid: (metadata?._tenantid || '').trim(),
      _unitid: '',
      units: [],
      tenants: []
    };
  }
  if (!supabase) throw new Error("Supabase não configurado.");
  
  const lowerEmail = email.toLowerCase();
  
  // 1. Busca perfil existente com timeout estrito
  console.log(`[Supabase] Buscando perfil para ${lowerEmail}...`);
  
  const fetchPromise = supabase
    .from('user_permissions')
    .select('*')
    .eq('email', lowerEmail)
    .single();

  const result = await Promise.race([
    fetchPromise,
    new Promise<null>((_, reject) => setTimeout(() => reject(new Error("DB_TIMEOUT")), 3000))
  ]).catch(err => {
    console.warn('[Supabase] Timeout ou erro na busca de perfil:', err.message);
    return { data: null, error: { message: err.message } };
  }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  
  const profile = result.data;
    
  if (profile) {
    console.log(`[Supabase] Perfil encontrado para ${lowerEmail}:`, profile);
    
    // Sincronização de ID em background (não aguarda)
    if (userId && profile.id !== userId) {
      supabase.from('user_permissions').update({ id: userId }).eq('email', lowerEmail).then();
    }

    const is_admin = (profile.is_admin === true || profile.isadmin === true || 
                     (profile.role && profile.role.trim().toUpperCase() === 'ADMIN') || 
                     (profile.role && profile.role.trim().toUpperCase() === 'MASTER') ||
                     (lowerEmail === 'semorr@gmail.com' || lowerEmail === 'semorr@gmail.com.br'));
    
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
      _tenantid: (profile._tenantid || profile.tenantid || profile.tenantId || '').trim(),
      _unitid: (profile._unitid || profile.unitid || profile.unitId || '').trim(),
      units: parseArray(profile.units || profile.unitid || profile._unitid),
      tenants: parseArray(profile.tenants || profile.tenantid || profile._tenantid)
    };

    console.log(`[Supabase] Perfil final processado para ${lowerEmail}:`, finalProfile);
    return finalProfile;
  }

  // 2. Se não encontrou ou deu timeout, tenta criar/atualizar (Upsert) com timeout
  console.log('[Supabase] Perfil não encontrado ou lento, tentando upsert...');
  
  const defaultTenant = (metadata?._tenantid || metadata?.tenantId || metadata?.tenantid || '').trim();
  const is_admin_new = (lowerEmail === 'semorr@gmail.com' || lowerEmail === 'semorr@gmail.com.br');
  const fallbackTenant = defaultTenant || (is_admin_new ? 'CICOPAL' : '');
  
  const insertData = {
    email: lowerEmail,
    username: (metadata?.username || lowerEmail.split('@')[0]).trim(),
    name: (metadata?.name || metadata?.username || lowerEmail.split('@')[0]).trim(),
    role: is_admin_new ? 'ADMIN' : 'AUDITOR',
    is_admin: is_admin_new,
    _tenantid: fallbackTenant,
    _unitid: (metadata?._unitid || metadata?.unitId || metadata?.unitid || '').trim(),
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
      _tenantid: d._tenantid || fallbackTenant,
      _unitid: d._unitid || ''
    };
  }

  // 3. Fallback Final: Retorna dados locais para não travar o login
  console.warn('[Supabase] Usando perfil local (Fallback Total)');
  return {
    email: lowerEmail,
    username: lowerEmail.split('@')[0],
    role: is_admin_new ? 'ADMIN' : 'AUDITOR',
    is_admin: is_admin_new,
    isAdmin: is_admin_new,
    _tenantid: fallbackTenant,
    _unitid: '',
    units: [],
    tenants: [fallbackTenant]
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
    console.log(`[Supabase] Login realizado para ${email}. Metadados:`, data.user.user_metadata);
  }
  
  if (error) throw error;
  return data;
};

export const signInWithMagicLink = async (email: string) => {
  if (getDatabaseMode() === 'INTERNAL') throw new Error("Modo INTERNO não permite login na nuvem.");
  if (!supabase) throw new Error("Supabase não configurado.");
  
  const redirectTo = getAppBaseUrl();
  console.log('[Supabase] Solicitando Magic Link para:', email, 'Redirect:', redirectTo);

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
    console.error('[Supabase] Erro ou Timeout no signInWithOtp:', error);
    throw new Error(error.message === "AUTH_TIMEOUT" ? "O servidor de autenticação não respondeu a tempo. Tente novamente." : error.message);
  }
  return data;
};

export const syncAssetsToCloud = async (assets: Asset[], tenantid?: string | string[]) => {
  if (!supabase || !assets || assets.length === 0 || !navigator.onLine) return;

  const forcedTenantId = Array.isArray(tenantid) ? tenantid[0] : tenantid;
  console.log(`>>> [Supabase] Iniciando sincronização de ${assets.length} ativos para o tenant: ${forcedTenantId || 'Global'}`);
  
  // Garante que todos os ativos tenham o tenantid antes de subir
  // E remove URLs de blob locais que não devem ir para a nuvem
  const assetsWithTenant = assets.map(a => {
    const cleanAsset = { ...a };
    // Remove URLs de blob locais e garante tipos corretos para o banco
    if (cleanAsset._photoUrl && cleanAsset._photoUrl.startsWith('blob:')) {
      delete cleanAsset._photoUrl;
    }
    
    // Garante que coordenadas sejam números ou null (evita strings vazias)
    const lat = typeof cleanAsset._lat === 'number' ? cleanAsset._lat : null;
    const lng = typeof cleanAsset._lng === 'number' ? cleanAsset._lng : null;
    const conferido = Boolean(cleanAsset._conferido);

    const assetEmpresa = (cleanAsset.UNIDADE_OPERACIONAL || '').toUpperCase().replace(/_/g, ' ').trim();
    const assetGrupo = (cleanAsset.GRUPO_EMPRESARIAL || cleanAsset._tenantid || '').trim().toUpperCase();

    let finalTenantId = '';
    if (tenantid) {
      if (Array.isArray(tenantid)) {
        // Se for um array (múltiplos tenants), tenta bater com a empresa do ativo
        const match = tenantid.find(t => t.toUpperCase().replace(/_/g, ' ').trim() === assetGrupo);
        finalTenantId = match || tenantid[0] || '';
      } else {
        finalTenantId = tenantid;
      }
    } else {
      finalTenantId = assetGrupo || assetEmpresa || '';
    }

    return {
      ...cleanAsset,
      _lat: lat,
      _lng: lng,
      _conferido: conferido,
      _tenantid: finalTenantId,
      _unitid: (cleanAsset._unitid || assetEmpresa || '').toUpperCase().replace(/_/g, ' ').trim() || null,
      _version: cleanAsset._version || 1,
      _is_deleted: cleanAsset._is_deleted || false,
      UNIDADE_OPERACIONAL: assetEmpresa,
      GRUPO_EMPRESARIAL: deduplicateRedundantString(finalTenantId)
    };
  });

  console.log(`>>> [Supabase] Exemplo de _tenantid atribuído: ${assetsWithTenant[0]?._tenantid || 'Nenhum'}`);
  
    const { error } = await supabase
      .from('assets')
      .upsert(assetsWithTenant, { onConflict: 'id' });

    if (error) {
      console.error('>>> [Supabase] Erro fatal na sincronização de ativos:', error);
      throw error;
    }
  console.log('>>> [Supabase] Sincronização de ativos concluída com sucesso.');
};

export const syncConfigToCloud = async (config: Omit<InventoryState, 'assets'>, tenantid?: string | string[]) => {
  if (getDatabaseMode() === 'INTERNAL') return;
  if (!supabase || !navigator.onLine) return;
  
  // Filtra apenas os campos que sabemos que existem na tabela para evitar erros de coluna inexistente
  const allowedKeys = [
    'id', 
    'companies', 
    'last_updated', 
    'status',
    'editable_fields', 
    'qr_code_fields', 
    'scanner_mode', 
    'auto_confirm_on_scan', 
    'scan_feedback_mode', 
    'inventory_search_mode',
    'immersive_mode',
    'dark_mode',
    'battery_saver',
    'protheus_integration_enabled',
    'protheus_api_url',
    'mandatory_photo_on_divergence',
    'mandatory_photo_on_new_item',
    'database_mode',
    '_tenantid'
  ];

  const configId = tenantid 
    ? (Array.isArray(tenantid) ? `config_${tenantid[0]}` : `config_${tenantid}`)
    : 'global_config';
  
  const payload: Record<string, unknown> = { id: configId };
  if (tenantid) payload._tenantid = Array.isArray(tenantid) ? tenantid[0] : tenantid;
  
  // Mapeamento de camelCase para snake_case
  const mapping: Record<string, string> = {
    'lastUpdated': 'last_updated',
    'editableFields': 'editable_fields',
    'qrCodeFields': 'qr_code_fields',
    'scannerMode': 'scanner_mode',
    'autoConfirmOnScan': 'auto_confirm_on_scan',
    'scanFeedbackMode': 'scan_feedback_mode',
    'inventorySearchMode': 'inventory_search_mode',
    'immersiveMode': 'immersive_mode',
    'darkMode': 'dark_mode',
    'batterySaver': 'battery_saver',
    'protheusIntegrationEnabled': 'protheus_integration_enabled',
    'protheusApiUrl': 'protheus_api_url',
    'mandatoryPhotoOnDivergence': 'mandatory_photo_on_divergence',
    'mandatoryPhotoOnNewItem': 'mandatory_photo_on_new_item',
    'databaseMode': 'database_mode'
  };

  Object.keys(config).forEach(key => {
    const dbKey = mapping[key] || key;
    if (allowedKeys.includes(dbKey)) {
      payload[dbKey] = (config as Record<string, unknown>)[key];
    }
  });

  const { error } = await supabase
    .from('inventory_config')
    .upsert(payload);

  if (error) {
    console.error('Error syncing config to Supabase:', error);
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
      console.error('Error fetching permissions:', error);
      return { isAdmin: false };
    }

    return data;
  } catch (err) {
    console.error('Unexpected error fetching permissions:', err);
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
      console.warn('[Supabase] Timeout ao buscar e-mail por username:', err.message);
      return { data: null, error: { message: err.message } };
    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (result.error) {
      console.error('Erro ao buscar e-mail por username:', result.error);
      return null;
    }

    return result.data?.email || null;
  } catch (err) {
    console.error('Erro inesperado ao buscar e-mail por username:', err);
    return null;
  }
};

/**
 * Provisiona um usuário no Supabase Auth (Cria o login oficial)
 * Nota: Como é um SPA, usamos signUp. Para evitar deslogar o admin,
 * criamos uma instância temporária do cliente.
 */
export const provisionUserInAuth = async (email: string, password?: string, username?: string, role?: string, tenantid?: string, tenants?: string[], name?: string, unitid?: string, units?: string[]): Promise<ProvisionResult> => {
  if (getDatabaseMode() === 'INTERNAL') throw new Error("Modo INTERNO não permite provisionamento na nuvem.");
  console.log(`[Supabase] Provisionando usuário ${email}:`, { role, tenantid, unitid, units });
  if (!supabaseUrl || !supabaseAnonKey || !email || !password) {
    throw new Error('Dados insuficientes para provisionamento (E-mail ou Senha ausentes).');
  }

  try {
    // Criamos um cliente temporário para não afetar a sessão do Admin logado
    console.log(`[Supabase] Criando cliente temporário para signUp de ${email}...`);
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
          unitid: unitid || '',
          units: units || (unitid ? [unitid] : []),
          tenants: tenants || (tenantid ? [tenantid] : []),
          provisioned_by: 'admin_dashboard'
        }
      }
    });
    
    if (error) {
      console.warn(`[Supabase] Erro no signUp de provisionamento para ${email}:`, error);
      // Se o usuário já existe, não falhamos o processo inteiro, 
      // tentamos apenas atualizar as permissões na tabela
      if (error.message.includes('already registered') || error.status === 422) {
        console.log(`[Supabase] Usuário já registrado no Auth. Tentando atualizar permissões para ${email}...`);
        
        if (supabase) {
          const { error: permError } = await supabase
            .from('user_permissions')
            .upsert([{
              email: email.toLowerCase().trim(),
              username: username || email.split('@')[0],
              name: name || username || email.split('@')[0],
              role: role || 'AUDITOR',
              is_admin: role === 'ADMIN' || role === 'MASTER',
              _tenantid: tenantid || '',
              _unitid: unitid || '',
              units: units || (unitid ? [unitid] : []),
              tenants: tenants || (tenantid ? [tenantid] : [])
            }], { onConflict: 'email' });
            
          if (permError) {
            console.error('[Supabase] Falha ao sincronizar permissões para usuário existente:', permError);
            throw permError;
          }
          return { user: { email }, existing: true };
        }
      }
      
      console.error('[Supabase] Erro definitivo no signUp do Supabase:', error);
      throw error;
    }

    console.log(`[Supabase] Usuário provisionado com sucesso no Auth:`, data.user?.email);

    // 2. Garante que o perfil exista na tabela user_permissions
    // Importante: Usamos o cliente principal (supabase) aqui, pois ele tem as permissões de escrita (se o RLS permitir)
    if (supabase && data.user) {
      console.log(`[Supabase] Criando perfil na tabela user_permissions para o novo usuário ${email}...`);
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
      const is_admin = role === 'ADMIN' || role === 'MASTER' || (email.toLowerCase() === 'semorr@gmail.com' || email.toLowerCase() === 'semorr@gmail.com.br');
      const normTenantId = normalizeValue(tenantid || '');
      const normUnitId = normalizeValue(unitid || '');

      const currentPayload = {
        id: data.user.id, // Sincroniza ID
        email: email.toLowerCase().trim(),
        username: username || email.split('@')[0],
        name: name || username || email.split('@')[0],
        role: role || 'AUDITOR',
        is_admin,
        _tenantid: normTenantId,
        _unitid: normUnitId,
        units: normalizeArray(units || (normUnitId ? [normUnitId] : [])),
        tenants: normalizeArray(tenants || (normTenantId ? [normTenantId] : []))
      };

      const { error: permError } = await supabase
        .from('user_permissions')
        .upsert([currentPayload], { onConflict: 'email' });
        
      if (permError) {
        console.warn("⚠️ Usuário criado no Auth, mas erro ao criar permissões:", permError);
      } else {
        console.log("✅ Perfil de permissões criado/atualizado na nuvem.");
      }
    }

    return data;
  } catch (err) {
    console.error('Erro inesperado no provisionamento:', err);
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
      const is_admin = u.is_admin || u.isAdmin || u.role === 'ADMIN' || u.role === 'MASTER' || (u.email.toLowerCase() === 'semorr@gmail.com');
      const _tenantid = normalizeValue(u._tenantid || u.tenantid || '');
      const _unitid = normalizeValue(u._unitid || u.unitid || '');
      return {
        email: u.email.toLowerCase().trim(),
        username: u.username,
        name: u.name || u.username,
        role: u.role,
        is_admin,
        _tenantid,
        _unitid,
        units: normalizeArray(u.units || (_unitid ? [_unitid] : [])),
        tenants: normalizeArray(u.tenants || (_tenantid ? [_tenantid] : []))
      };
    });

    const { error } = await supabase
      .from('user_permissions')
      .upsert(usersToSync, { onConflict: 'email' });

    if (error) {
      console.error('Erro ao sincronizar usuários com Supabase:', error);
      throw error;
    }
    
    console.log(`[Supabase] Sincronização de ${usersToSync.length} usuários concluída.`);
  } catch (err) {
    console.error('Erro inesperado na sincronização de usuários:', err);
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
      console.error('Erro ao deletar usuário do Supabase:', error);
      throw error;
    }
  } catch (err) {
    console.error('Erro inesperado ao deletar usuário:', err);
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
    console.log(`[Supabase] Buscando usuários da nuvem (Tenant: ${tenantid || 'todos'})...`);
    let query = supabase.from('user_permissions').select('*');
    
    if (tenantid && tenantid !== '') {
      query = query.eq('_tenantid', tenantid);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar usuários do Supabase:', error);
      return [];
    }

    console.log(`[Supabase] ${data?.length || 0} usuários encontrados na nuvem.`);
    
    if (data && data.length > 0) {
      const felipe = data.find(u => u.email.toLowerCase() === 'felipe.messias@gmail.com');
      if (felipe) {
        console.log('>>> [Supabase] Felipe found in cloud:', {
          email: felipe.email,
          _tenantid: felipe._tenantid,
          _unitid: felipe._unitid,
          units: felipe.units
        });
      }
    }

    return (data || []).map(u => {
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
      const is_admin = u.is_admin || u.isAdmin || u.role === 'ADMIN' || u.role === 'MASTER' || (u.email.toLowerCase() === 'semorr@gmail.com');
      const _tenantid = normalizeValue(u._tenantid || u.tenantid || '');
      const _unitid = normalizeValue(u._unitid || u.unitid || '');
      return {
        username: u.username || u.email.split('@')[0],
        name: u.name || u.username || u.email.split('@')[0],
        email: u.email,
        password: '', // Senhas não são expostas
        role: u.role as UserRole,
        is_admin,
        isAdmin: is_admin,
        mustChangePassword: false,
        _tenantid,
        _unitid,
        tenantid: _tenantid,
        unitid: _unitid,
        units: normalizeArray(u.units || (_unitid ? [_unitid] : [])),
        tenants: normalizeArray(u.tenants || (_tenantid ? [_tenantid] : []))
      };
    });
  } catch (err) {
    console.error('Erro inesperado ao buscar usuários:', err);
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
      .eq('ETIQUETA', tag.toUpperCase().trim());
    
    // Tenta filtrar por _is_deleted se a coluna existir (soft delete)
    // Se falhar, o Supabase retornará erro 42703 (undefined_column)
    query = query.or('_is_deleted.is.null,_is_deleted.eq.false');
    
    if (tenantid) {
      query = query.eq('_tenantid', tenantid);
    }

    const { data, error } = await query.single();

    if (error) {
      // Se o erro for coluna inexistente, tentamos sem o filtro de soft delete
      if (error.code === '42703' && error.message?.includes('_is_deleted')) {
        let retryQuery = supabase
          .from('assets')
          .select('*')
          .eq('ETIQUETA', tag.toUpperCase().trim());
        
        if (tenantid) {
          retryQuery = retryQuery.eq('_tenantid', tenantid);
        }
        
        const { data: retryData, error: retryError } = await retryQuery.single();
        if (retryError && retryError.code !== 'PGRST116') {
          console.error('Erro ao buscar ativo por etiqueta (retry):', retryError);
          return null;
        }
        return retryData as Asset;
      }

      if (error.code !== 'PGRST116') {
        console.error('Erro ao buscar ativo por etiqueta:', error);
      }
      return null;
    }

    return data as Asset;
  } catch (err) {
    console.error('Erro inesperado ao buscar ativo:', err);
    return null;
  }
};

export const fetchFullInventory = async (tenantid?: string | string[], unitid?: string): Promise<{ assets: Asset[], config: Partial<InventoryState> } | null> => {
  if (!supabase || !navigator.onLine) return null;

  console.log(`>>> [Supabase] fetchFullInventory para tenantid: ${JSON.stringify(tenantid)}, unitid: ${unitid || 'GERAL'}`);

  try {
    // 1. Busca todos os ativos filtrados por tenantid e opcionalmente unitid
    let assets: Asset[] = [];
    let assetsQuery = supabase.from('assets').select('*');
    
    if (tenantid) {
      if (Array.isArray(tenantid)) assetsQuery = assetsQuery.in('_tenantid', tenantid);
      else assetsQuery = assetsQuery.eq('_tenantid', tenantid);
    }
    
    if (unitid && unitid !== '') {
      const cleanUnitId = unitid.toUpperCase().replace(/_/g, ' ').trim();
      assetsQuery = assetsQuery.eq('_unitid', cleanUnitId);
    }

    const { data: initialAssets, error: assetsError } = await Promise.race([
      assetsQuery,
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error("FETCH_TIMEOUT")), 10000))
    ]).catch(err => ({ data: null, error: err })) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    
    if (!assetsError) {
      const initialData = (initialAssets as unknown as Record<string, unknown>[]) || [];
      assets = initialData.map(a => ({
        ...a,
        id: a.id as string | number,
        _tenantid: a._tenantid as string,
        _unitid: a._unitid as string,
        tenantid: a._tenantid as string, // Legado
        unitid: a._unitid as string      // Legado
      })) as Asset[];
    } else {
      console.error(`[Supabase] Erro em fetchFullInventory (Assets): ${assetsError.code} - ${assetsError.message}`, assetsError);
      throw assetsError;
    }

    // 2. Busca a configuração
    const configId = tenantid 
      ? (Array.isArray(tenantid) ? `config_${tenantid[0]}` : `config_${tenantid}`)
      : 'global_config';
    
    console.log(`>>> [Supabase] Buscando config para ID: ${configId}`);
    
    let config = {};
    const { data: configData, error: configError } = await supabase
      .from('inventory_config')
      .select('*')
      .eq('id', configId)
      .maybeSingle();

    if (configError) {
      console.warn('Erro ao buscar configuração do Supabase:', configError);
    } else if (configData) {
      console.log('>>> [Supabase] Config encontrada para o tenant.');
      config = configData;
    } else {
      console.log('>>> [Supabase] Config não encontrada para o tenant. Tentando global_config...');
      const { data: globalConfigData } = await supabase
        .from('inventory_config')
        .select('*')
        .eq('id', 'global_config')
        .maybeSingle();
      if (globalConfigData) {
        console.log('>>> [Supabase] global_config encontrada.');
        config = globalConfigData;
      } else {
        console.warn('>>> [Supabase] Nenhuma configuração encontrada (nem tenant nem global).');
      }
    }

    // Mapeamento reverso de snake_case para camelCase
    const reverseMapping: Record<string, string> = {
      'last_updated': 'lastUpdated',
      'editable_fields': 'editableFields',
      'qr_code_fields': 'qrCodeFields',
      'scanner_mode': 'scannerMode',
      'auto_confirm_on_scan': 'autoConfirmOnScan',
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

    return {
      assets: assets,
      config: mappedConfig as Partial<InventoryState>
    };
  } catch (err) {
    console.error('Erro inesperado ao buscar inventário completo:', err);
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
      (payload) => {
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
      (payload) => {
        // Filtra por tenantid no lado do cliente se necessário, 
        // embora o ideal seja o RLS do Supabase já filtrar se o usuário estiver logado.
        // No entanto, para canais de broadcast/realtime, às vezes precisamos de filtros extras.
        const newAsset = payload.new as Asset;
        const oldAsset = payload.old as Asset;
        const targetAsset = newAsset || oldAsset;

        if (targetAsset && tenantid) {
          const assetTenant = targetAsset._tenantid;
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

  try {
    console.log(`[Supabase] Iniciando limpeza na nuvem. Empresa: ${companyToClear || 'TODAS'}, Tenant: ${tenantid || 'GLOBAL'}`);
    
    // 1. Limpa os ativos
    let query = supabase.from('assets').delete({ count: 'exact' });
    
    try {
      if (tenantid) query = query.eq('_tenantid', tenantid);
      
      if (companyToClear) {
        if (Array.isArray(companyToClear)) {
          const normalizedCompanies = companyToClear.map(c => c.toUpperCase().trim());
          query = query.in('_unitid', normalizedCompanies);
        } else {
          const normalized = companyToClear.toUpperCase().trim();
          query = query.eq('_unitid', normalized);
        }
      } else {
        // Se não houver empresa específica, garante que não deletamos tudo acidentalmente se não houver tenantid
        // Removido o filtro de ID fixo que causava erro de bigint/uuid
        if (!tenantid) {
          console.warn('[Supabase] Tentativa de limpeza global sem tenantid. Abortando por segurança.');
          return;
        }
      }
    } catch (e) {
      console.warn('[Supabase] Erro ao construir query de limpeza:', e);
    }

    const { error: assetsError, count } = await query;

    if (assetsError) {
      // Se o erro for coluna inexistente (_unitid ou _tenantid), tentamos fallbacks
      if (assetsError.code === '42703' || assetsError.code === 'PGRST204') {
        console.warn('[Supabase] Coluna não encontrada na limpeza. Tentando fallbacks...');
        let retryQuery = supabase.from('assets').delete({ count: 'exact' });
        
        // Se houver empresa, tenta UNIDADE_OPERACIONAL
        if (companyToClear) {
          if (Array.isArray(companyToClear)) {
            const normalizedCompanies = companyToClear.map(c => c.toUpperCase().trim());
            retryQuery = retryQuery.or(`UNIDADE_OPERACIONAL.in.(${normalizedCompanies.join(',')}),unidade_operacional.in.(${normalizedCompanies.join(',')})`);
          } else {
            const normalized = companyToClear.toUpperCase().trim();
            retryQuery = retryQuery.or(`UNIDADE_OPERACIONAL.eq.${normalized},unidade_operacional.eq.${normalized}`);
          }
        } else if (!tenantid) {
           // Removido o filtro de ID fixo que causava erro de bigint/uuid
           console.warn('[Supabase] Fallback de limpeza global sem tenantid. Abortando por segurança.');
           return;
        }
        
        const { error: retryError, count: retryCount } = await retryQuery;
        if (retryError) {
          // Se ainda falhar, tenta o delete mais radical (sem filtros de coluna)
          console.warn('[Supabase] Fallback falhou. Tentando delete radical...');
          // Tenta filtrar por algo que funcione tanto para UUID quanto para BigInt
          const { error: finalError, count: finalCount } = await supabase.from('assets').delete({ count: 'exact' }).filter('id', 'not.is', null);
          
          if (finalError) throw finalError;
          console.log(`[Supabase] Limpeza radical concluída. Afetados: ${finalCount}`);
          return;
        }
        console.log(`[Supabase] Limpeza concluída via fallback. Afetados: ${retryCount}`);
        return;
      }
      
      // Se o erro for de tipo (22P02), tentamos um filtro genérico
      if (assetsError.code === '22P02') {
        console.warn('[Supabase] Erro de tipo detectado (bigint vs uuid). Tentando filtro genérico...');
        const { error: numError, count: numCount } = await supabase.from('assets').delete({ count: 'exact' }).filter('id', 'not.is', null);
        if (numError) throw numError;
        console.log(`[Supabase] Limpeza concluída via filtro genérico. Afetados: ${numCount}`);
        return;
      }

      console.error('Erro ao limpar ativos na nuvem:', assetsError);
      throw assetsError;
    }
    
    console.log(`[Supabase] Limpeza de ativos concluída. Registros afetados: ${count || 'desconhecido'}`);

    // 2. Limpa a configuração (apenas se estiver limpando TUDO)
    if (!companyToClear) {
      const configId = tenantid ? `config_${tenantid}` : 'global_config';
      
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
          console.warn('[Supabase] Erro de cache de schema ao deletar config. Ignorando para permitir conclusão da limpeza.');
        } else {
          console.warn('Erro ao limpar configuração na nuvem (pode não existir):', configError);
        }
      }
    }
  } catch (err) {
    console.error('Erro inesperado ao limpar nuvem:', err);
    throw err;
  }
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
        const options = {
          maxSizeMB: 0.15, // Perfil WhatsApp: ~150KB (Máxima escalabilidade)
          maxWidthOrHeight: 1024, // Resolução otimizada para mobile
          useWebWorker: true,
          initialQuality: 0.6,
          fileType: 'image/jpeg'
        };
        
        console.log(`[Storage] Aplicando Perfil WhatsApp (${(file.size / 1024 / 1024).toFixed(2)}MB)...`);
        fileToUpload = await imageCompression(file as File, options);
        console.log(`[Storage] Imagem otimizada para ${(fileToUpload.size / 1024).toFixed(2)}KB`);
      } catch (compressionError) {
        console.warn('Erro na compressão, enviando original:', compressionError);
        fileToUpload = file;
      }
    }

    const fileExt = 'jpg'; // Forçamos jpg para consistência
    const fileName = `${tenantid}/${assetId}/${Date.now()}.${fileExt}`;
    const filePath = `photos/${fileName}`;

    // Verificação de Bucket
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.warn('[Storage] Não foi possível verificar buckets:', bucketsError.message);
    } else {
      const bucketExists = buckets?.some(b => b.name === 'asset-photos');
      if (!bucketExists) {
        const msg = 'Bucket "asset-photos" não encontrado. O administrador deve criá-lo no painel do Supabase via SQL Editor.';
        console.error(`[Storage] ${msg}`);
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
      console.error('Erro ao fazer upload da foto:', uploadError);
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
    console.error('Erro no processo de upload:', err);
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
      console.error('Erro ao deletar foto do storage:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Erro inesperado ao deletar foto:', err);
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
      .eq('_tenantid', tenantid)
      .order('timestamp', { ascending: false });

    if (recordId) {
      query = query.eq('record_id', recordId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar logs de auditoria:', error);
      return [];
    }

    return (data || []) as Record<string, unknown>[];
  } catch (err) {
    console.error('Erro inesperado ao buscar logs:', err);
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
      .eq('_tenantid', tenantid)
      .order('timestamp', { ascending: false });

    if (assetId) {
      query = query.eq('asset_id', assetId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar logs de ativos:', error);
      return [];
    }

    return (data || []) as Record<string, unknown>[];
  } catch (err) {
    console.error('Erro inesperado ao buscar logs de ativos:', err);
    return [];
  }
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
    .eq('_tenantid', tenantid);
  if (error) throw error;
};

/**
 * Busca todas as campanhas de um tenant com resiliência total
 */
export const fetchCampaigns = async (tenantid: string): Promise<InventoryCampaign[]> => {
  const mode = localStorage.getItem('app_database_mode');
  const isInternal = mode === 'INTERNAL';

  if (isInternal) {
    console.log('>>> [Local] Buscando campanhas locais (Modo Mobile Puro)...');
    const cached = localStorage.getItem('inventory_campaigns_cache');
    return cached ? JSON.parse(cached) : [];
  }

  if (!supabase) {
    console.warn('[Supabase] fetchCampaigns abortado: Cliente Supabase não inicializado.');
    return [];
  }
  
  const cleanTenantId = (tenantid || '').trim();
  
  // Debug de Autenticação
  const { data: { user: sbUser } } = await supabase.auth.getUser();
  console.log(`>>> [Supabase] fetchCampaigns INICIADO. Tenant: "${cleanTenantId}", Auth: ${sbUser?.email || 'ANÔNIMO'}`);
  
  if (!cleanTenantId) {
    console.warn('[Supabase] fetchCampaigns cancelado: tenantId vazio.');
    return [];
  }

  // Tenta buscar usando _tenantid primeiro na nova tabela campaigns_v2
  console.log(`>>> [Supabase] Tentando campaigns_v2 (eq _tenantid: ${cleanTenantId})...`);
  let { data, error } = await supabase
    .from('campaigns_v2')
    .select('*')
    .eq('_tenantid', cleanTenantId)
    .order('start_date', { ascending: false });
  
  if (error) {
    console.warn(`>>> [Supabase] Falha na campaigns_v2 (Code: ${error.code}): ${error.message}`);
  } else {
    console.log(`>>> [Supabase] Sucesso na campaigns_v2: ${data?.length || 0} registros encontrados.`);
  }

  // Fallback para a tabela antiga se a nova ainda não estiver pronta ou se houver erro de cache
  if ((error && (error.code === 'PGRST204' || error.code === '42P01')) || (!data || data.length === 0)) {
    console.warn('[Supabase] Tentando fallback para inventory_campaigns...');
    const oldTable = await supabase
      .from('inventory_campaigns')
      .select('*')
      .eq('_tenantid', cleanTenantId)
      .order('start_date', { ascending: false });
    
    if (!oldTable.error && oldTable.data && oldTable.data.length > 0) {
      console.log(`>>> [Supabase] Sucesso na inventory_campaigns: ${oldTable.data.length} registros.`);
      data = oldTable.data;
      error = null;
    }
  }
  
  // Se ainda falhar ou estiver vazio, tenta tenant_id (legado/alternativo)
  if ((error || !data || data.length === 0)) {
    console.warn('[Supabase] Tentando fallback com tenant_id...');
    const fallback = await supabase
      .from('inventory_campaigns')
      .select('*')
      .eq('tenant_id', cleanTenantId)
      .order('start_date', { ascending: false });
    
    if (!fallback.error && fallback.data && fallback.data.length > 0) {
      data = fallback.data;
      error = null;
    }
  }

  // Se ainda falhar ou estiver vazio e for o usuário master, tenta uma busca sem filtro de tenant como último recurso
  const isMaster = cleanTenantId === 'CICOPAL' || cleanTenantId.includes('semorr') || (sbUser?.email?.toLowerCase() === 'semorr@gmail.com');
  if (isMaster && (!data || data.length === 0)) {
    console.warn('[Supabase] Emergency Fallback: Buscando TODAS as campanhas para o Master...');
    const emergency = await supabase
      .from('campaigns_v2')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(20);
    
    if (!emergency.error && emergency.data && emergency.data.length > 0) {
      console.log(`>>> [Supabase] Sucesso no Emergency Fallback (v2): ${emergency.data.length} registros.`);
      data = emergency.data;
      error = null;
    } else {
      const emergencyOld = await supabase
        .from('inventory_campaigns')
        .select('*')
        .order('start_date', { ascending: false })
        .limit(20);
      if (!emergencyOld.error && emergencyOld.data) {
        console.log(`>>> [Supabase] Sucesso no Emergency Fallback (Old): ${emergencyOld.data.length} registros.`);
        data = emergencyOld.data;
        error = null;
      }
    }
  }

  if (error) {
    console.error('>>> [Supabase] Erro final ao buscar campanhas:', error);
    return [];
  }

  const result = (data || []).map((c: Record<string, unknown>) => ({
    ...c,
    _unitid: (c._unitid || c.unit_id || c.unitid) as string,
    _tenantid: (c._tenantid || c.tenant_id || c.tenantid) as string,
    unit_id: (c._unitid || c.unit_id || c.unitid) as string,
    tenantid: (c._tenantid || c.tenant_id || c.tenantid) as string
  })) as InventoryCampaign[];

  console.log(`>>> [Supabase] Retornando ${result.length} campanhas processadas.`);
  return result;
};

/**
 * Cria uma nova campanha com resiliência a nomes de colunas
 */
export const createCampaign = async (campaign: Partial<InventoryCampaign>): Promise<InventoryCampaign | null> => {
  const mode = localStorage.getItem('app_database_mode');
  const isInternal = mode === 'INTERNAL';

  if (isInternal) {
    console.log('>>> [Local] Criando campanha local (Modo Mobile Puro)...');
    const newCampaign = {
      ...campaign,
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString()
    } as InventoryCampaign;

    const cached = localStorage.getItem('inventory_campaigns_cache');
    const campaigns = cached ? JSON.parse(cached) : [];
    const updatedCampaigns = [newCampaign, ...campaigns];
    localStorage.setItem('inventory_campaigns_cache', JSON.stringify(updatedCampaigns));
    
    return newCampaign;
  }

  if (!supabase) return null;
  
  const tenantVal = campaign._tenantid || campaign.tenantid;
  const unitVal = campaign._unitid || campaign.unit_id;

  const payload: Record<string, unknown> = {
    name: campaign.name,
    description: campaign.description,
    status: campaign.status,
    _tenantid: tenantVal,
    _unitid: unitVal,
    created_by: campaign.created_by,
    start_date: campaign.start_date || new Date().toISOString()
  };

  console.log('[Supabase] Tentando criar campanha com payload:', payload);

  // Tenta via RPC v5 (JSONB) na nova tabela campaigns_v2
  const rpcResult = await supabase.rpc('create_campaign_v5', {
    p_payload: payload
  });

  let data = null;
  let error = null;

  if (!rpcResult.error) {
    data = rpcResult.data;
  } else {
    console.warn('[Supabase] Falha via RPC v5, tentando inserção direta na campaigns_v2...');
    const directInsert = await supabase
      .from('campaigns_v2')
      .insert([payload])
      .select()
      .single();
    
    if (!directInsert.error) {
      data = directInsert.data;
    } else {
      error = directInsert.error;
    }
  }

  if (error) {
    const err = error as { code: string, message: string };
    if (err.code === 'PGRST204') {
      console.error('[Supabase] Erro de Cache de Schema (PGRST204). A coluna _tenantid não foi encontrada no cache da API.');
    }
    console.error('Erro ao criar campanha:', err);
    throw err;
  }

  if (data) {
    return {
      ...data,
      _unitid: (data._unitid || data.unit_id) as string,
      _tenantid: (data._tenantid || data.tenant_id || data.tenantid) as string,
      unit_id: (data._unitid || data.unit_id) as string,
      tenantid: (data._tenantid || data.tenant_id || data.tenantid) as string
    } as InventoryCampaign;
  }
  
  return null;
};

/**
 * Atualiza o status de uma campanha
 */
export const updateCampaignStatus = async (campaignId: string, status: CampaignStatus): Promise<boolean> => {
  const mode = localStorage.getItem('app_database_mode');
  const isInternal = mode === 'INTERNAL';

  if (isInternal) {
    console.log('>>> [Local] Atualizando status da campanha local:', campaignId);
    const cached = localStorage.getItem('inventory_campaigns_cache');
    if (cached) {
      const campaigns = JSON.parse(cached) as InventoryCampaign[];
      const updated = campaigns.map(c => 
        c.id === campaignId ? { ...c, status, end_date: status === CampaignStatus.CLOSED ? new Date().toISOString() : null } : c
      );
      localStorage.setItem('inventory_campaigns_cache', JSON.stringify(updated));
      return true;
    }
    return false;
  }

  if (!supabase) return false;
  const { error } = await supabase
    .from('inventory_campaigns')
    .update({ 
      status, 
      end_date: status === CampaignStatus.CLOSED ? new Date().toISOString() : null 
    })
    .eq('id', campaignId);
  
  if (error) {
    console.error('Erro ao atualizar status da campanha:', error);
    return false;
  }
  return true;
};

/**
 * Exclui uma campanha (apenas para administradores)
 */
export const deleteCampaign = async (campaignId: string): Promise<boolean> => {
  const mode = localStorage.getItem('app_database_mode');
  const isInternal = mode === 'INTERNAL';

  if (isInternal) {
    console.log('>>> [Local] Excluindo campanha local:', campaignId);
    const cached = localStorage.getItem('inventory_campaigns_cache');
    if (cached) {
      const campaigns = JSON.parse(cached) as InventoryCampaign[];
      const updated = campaigns.filter(c => c.id !== campaignId);
      localStorage.setItem('inventory_campaigns_cache', JSON.stringify(updated));
      return true;
    }
    return false;
  }

  if (!supabase) return false;
  const { error } = await supabase
    .from('inventory_campaigns')
    .delete()
    .eq('id', campaignId);
  
  if (error) {
    console.error('Erro ao excluir campanha:', error);
    return false;
  }
  return true;
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
      .eq('_tenantid', tenantid);
      
    // Ativos inventariados nesta campanha
    const { count: inventoriedCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('_tenantid', tenantid)
      .eq('_campaignId', campaignId);

    // Divergências nesta campanha
    const { count: divergenceCount } = await supabase
      .from('assets')
      .select('*', { count: 'exact', head: true })
      .eq('_tenantid', tenantid)
      .eq('_campaignId', campaignId)
      .eq('TAG_INVENTARIO', 'DIVERGÊNCIA');

    return {
      total: totalCount || 0,
      inventoried: inventoriedCount || 0,
      divergences: divergenceCount || 0
    };
  } catch (err) {
    console.error('Erro ao buscar estatísticas da campanha:', err);
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
  
  const tenantId = config._tenantid || config.tenant_id || 'CICOPAL';
  const unitId = config._unitid || config.unit_id;
  const unitKey = `${tenantId}_${unitId}`.replace(/\s+/g, '_');
  
  const payload = {
    _unitid: unitId,
    _tenantid: tenantId,
    unit_id: unitId, // Legado
    tenant_id: tenantId, // Legado
    lat: Number(config.lat),
    lng: Number(config.lng),
    radius_meters: Number(config.radius_meters),
    is_active: Boolean(config.is_active),
    updated_by: String(config.updated_by || 'system'),
    updated_at: new Date().toISOString()
  };

  console.log('>>> [Persistence] Salvando GPS Local-First:', unitKey);

  // 1. SALVAMENTO LOCAL (Obrigatório em ambos os modos para offline-first)
  const localConfigs = JSON.parse(localStorage.getItem('local_unit_configs') || '{}');
  localConfigs[unitKey] = payload;
  localStorage.setItem('local_unit_configs', JSON.stringify(localConfigs));

  // Se for modo INTERNO, encerramos aqui (Isolamento Total)
  if (isInternal) {
    console.log('>>> [Local] GPS salvo localmente. Modo Mobile Puro ativo.');
    return true;
  }

  if (!supabase) return false;

  // 2. TENTATIVA DE SINCRONIZAÇÃO EM BACKGROUND (Apenas modo SUPABASE)
  const syncToCloud = async () => {
      try {
        // Tentativa na tabela FINAL (unit_gps_data)
        // Adicionamos _tenantid e _unitid como colunas de topo para satisfazer políticas de RLS
        const { error } = await supabase
          .from('unit_gps_data')
          .upsert({
            unit_key: unitKey,
            _tenantid: tenantId,
            _unitid: unitId,
            data: payload,
            updated_at: new Date().toISOString()
          });

        if (error) {
          console.warn(`>>> [Supabase] Sincronização de GPS falhou (Code: ${error.code}): ${error.message}`);
          // Se for erro de RLS ou coluna, tentamos um fallback para log_audit para não perder o rastro
          if (error.code === '42501' || error.code === 'PGRST204') {
             await logAuditEvent({
               user_email: payload.updated_by,
               action: 'GPS_CONFIG_SYNC_FAIL',
               details: `Falha ao sincronizar GPS da unidade ${unitId}. Erro: ${error.message}`,
               _tenantid: tenantId
             });
          }
        } else {
          console.log('>>> [Supabase] GPS sincronizado com a nuvem com sucesso!');
        }
      } catch (err) {
        console.warn('>>> [Supabase] Erro silencioso na sincronização:', err);
      }
    };

    syncToCloud();

    // Retornamos TRUE imediatamente porque o dado já está no localStorage
    return true;
  } catch (err: unknown) {
    const error = err as Error;
    console.error('Erro no salvamento Local-First:', error);
    return `Erro Local: ${error.message || 'Falha ao gravar no navegador'}`;
  }
};

/**
 * Busca as configurações de geofencing combinando Local e Nuvem
 */
export const fetchUnitConfigs = async (tenantid: string): Promise<UnitConfig[]> => {
  if (!supabase) return [];
  
  try {
    const configs: Record<string, UnitConfig> = {};

    // 1. Carrega do LocalStorage (Sempre disponível)
    const localData = JSON.parse(localStorage.getItem('local_unit_configs') || '{}');
    Object.values(localData).forEach((c: unknown) => {
      const config = c as UnitConfig;
      if (config.tenant_id === tenantid) configs[config.unit_id] = config;
    });

    // 2. Tenta carregar da Nuvem (unit_gps_data) para atualizar o local
    try {
      const { data, error } = await supabase
        .from('unit_gps_data')
        .select('*')
        .like('unit_key', `${tenantid}_%`);

      if (data && !error) {
        data.forEach(item => {
          const _tenantid = item.data._tenantid || item.data.tenant_id || tenantid;
          const _unitid = item.data._unitid || item.data.unit_id;
          
          configs[_unitid] = {
            ...item.data,
            _tenantid,
            _unitid,
            tenant_id: _tenantid,
            unit_id: _unitid
          };
        });
        
        // Atualiza o local com o que veio da nuvem, mas preserva dados locais mais recentes
        const updatedLocal = { ...localData };
        data.forEach(item => { 
          const cloudTime = new Date(item.updated_at || 0).getTime();
          const localItem = localData[item.unit_key];
          const localTime = localItem ? new Date(localItem.updated_at || 0).getTime() : 0;
          
          // Só sobrescreve se o dado da nuvem for realmente mais novo
          if (cloudTime >= localTime) {
            updatedLocal[item.unit_key] = item.data; 
          }
        });
        localStorage.setItem('local_unit_configs', JSON.stringify(updatedLocal));
      }
    } catch {
      console.warn('>>> [Supabase] Falha ao buscar configs da nuvem, usando apenas locais.');
    }

    return Object.values(configs);
  } catch (err) {
    console.error('Erro ao buscar configs Local-First:', err);
    return [];
  }
};
