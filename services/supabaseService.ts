
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

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseSchema = import.meta.env.VITE_SUPABASE_SCHEMA || 'public';

// Initialize client only if credentials exist to prevent crash
if (supabaseUrl && supabaseAnonKey) {
  console.log(`%c[Supabase] Conectado ao Ambiente: ${import.meta.env.VITE_ENVIRONMENT || 'development'}`, "color: #3ecf8e; font-weight: bold;");
  console.log(`%c[Supabase] Schema Ativo: ${supabaseSchema}`, "color: #3ecf8e;");
}

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      db: {
        schema: supabaseSchema
      }
    })
  : null;

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
  tenant_id?: string;
  origin?: string;
}) => {
  if (!supabase) return;

  try {
    // Sanitiza dados para evitar erros de estrutura circular (HTMLButtonElement, FiberNode, etc)
    const sanitizedEntry = {
      ...entry,
      new_data: entry.new_data ? sanitizeForSupabase(entry.new_data) : undefined,
      old_data: entry.old_data ? sanitizeForSupabase(entry.old_data) : undefined
    };

    const { error } = await supabase
      .from('audit_logs')
      .insert([sanitizedEntry]);

    if (error) {
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
  tenant_id?: string;
}) => {
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
        tenantid,
        unitid: unitid || '',
        units: units || (unitid ? [unitid] : []),
        tenants: [tenantid] // Mantido para compatibilidade
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
        tenantid,
        unitid: unitid || '',
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
      tenant_id: tenantid
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
  if (!supabase) throw new Error("Supabase não configurado.");
  
  const lowerEmail = email.toLowerCase();
  
  // 1. Busca perfil existente
  console.log(`[Supabase] Buscando perfil para ${lowerEmail}...`);
  const { data: profiles, error: fetchError } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('email', lowerEmail);
    
  if (fetchError) {
    console.error('[Supabase] Erro ao buscar perfil:', fetchError);
    throw fetchError;
  }
  
  if (profiles && profiles.length > 0) {
    const profile = profiles[0];
    console.log(`[Supabase] Perfil encontrado para ${lowerEmail}:`, profile);
    
    // Se o perfil existe mas não tem o ID (ou o ID é diferente), atualiza para sincronizar
    if (userId && profile.id !== userId) {
      await supabase
        .from('user_permissions')
        .update({ id: userId })
        .eq('email', lowerEmail);
    }

    // Normalização de valores (remove "default"/"DEFAULT")
    const normalizeValue = (val: string) => {
      if (!val) return '';
      const upper = val.toUpperCase();
      return (upper === 'DEFAULT' || upper === 'NULL' || upper === '0' || upper === 'default') ? '' : val;
    };

    // Normalização de arrays
      const normalizeArray = (arr: unknown) => {
        if (!arr) return [];
        const array = Array.isArray(arr) ? arr : [arr];
        return array.map(v => String(v)).filter(v => normalizeValue(v) !== '');
      };

    const is_admin = profile.is_admin || profile.isAdmin || metadata?.isAdmin || (lowerEmail === 'semorr@gmail.com' || lowerEmail === 'semorr@gmail.com.br') || false;
    const tenantid = normalizeValue(profile.tenantid || metadata?.tenantid || '');
    const unitid = normalizeValue(profile.unitid || metadata?.unitid || '');
    
    const units = normalizeArray(profile.units || metadata?.units || (profile.unitid ? [profile.unitid] : (metadata?.unitid ? [metadata.unitid] : [])));
    const tenants = normalizeArray(profile.tenants || metadata?.tenants || (profile.tenantid ? [profile.tenantid] : (metadata?.tenantid ? [metadata.tenantid] : [])));

    // Retornamos um objeto limpo, sem campos legados de case incorreto (como tenantId)
    const finalProfile = {
      id: profile.id,
      email: profile.email,
      username: profile.username || metadata?.username || lowerEmail.split('@')[0],
      name: profile.name || metadata?.name || profile.username || metadata?.username || lowerEmail.split('@')[0],
      role: profile.role || metadata?.role || UserRole.AUDITOR,
      is_admin,
      isAdmin: is_admin,
      tenantid,
      unitid,
      units,
      tenants,
      created_at: profile.created_at
    };
    
    console.log(`[Supabase] Perfil final (existente) para ${lowerEmail}:`, finalProfile);
    return finalProfile;
  }
  
  // 2. Se não existir, cria um perfil padrão
  console.log(`[Supabase] Perfil não encontrado para ${lowerEmail}. Criando novo perfil...`);
  
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

  const defaultTenant = normalizeValue(metadata?.tenantid || '');
  const is_admin = metadata?.isAdmin || (lowerEmail === 'semorr@gmail.com' || lowerEmail === 'semorr@gmail.com.br') || false;
  
  console.log(`[Supabase] Valores iniciais para novo perfil:`, { is_admin, defaultTenant });

  const insertData = {
    email: lowerEmail,
    username: metadata?.username || lowerEmail.split('@')[0],
    name: metadata?.name || metadata?.username || lowerEmail.split('@')[0],
    role: metadata?.role || (is_admin ? UserRole.ADMIN : UserRole.AUDITOR),
    is_admin,
    isAdmin: is_admin, // Mantemos para compatibilidade se a coluna existir
    tenantid: defaultTenant,
    unitid: normalizeValue(metadata?.unitid || ''),
    units: normalizeArray(metadata?.units || (metadata?.unitid ? [metadata.unitid] : [])),
    tenants: normalizeArray(metadata?.tenants || (defaultTenant ? [defaultTenant] : [])),
    ...(userId ? { id: userId } : {})
  };

  // Lógica de tentativa resiliente para lidar com cache de schema desatualizado
  const currentPayload = { ...insertData };
  let error = null;
  let retryCount = 0;
  const maxRetries = 5;

  let createdProfile = null;

  while (retryCount < maxRetries) {
    const { data: newProfile, error: createError } = await supabase
      .from('user_permissions')
      .insert([currentPayload])
      .select()
      .single();
    
    if (!createError) {
      console.log(`[Supabase] Perfil criado com sucesso na tentativa ${retryCount + 1}:`, newProfile);
      createdProfile = newProfile;
      error = null;
      break;
    }

    error = createError;
    console.warn(`[Supabase] Erro na tentativa ${retryCount + 1} de criar perfil:`, createError);
    
    const errorMessage = createError.message || "";
    const match = errorMessage.match(/Could not find the '(.+)' column/) || 
                  errorMessage.match(/column "(.+)" of relation ".+" does not exist/) ||
                  errorMessage.match(/column (.+) does not exist/);
    
    if (match && (match[1] || match[2])) {
      const missingColumn = (match[1] || match[2]).replace(/"/g, '');
      // Silencioso para colunas opcionais conhecidas
      if (!['is_admin', 'isAdmin', 'name', 'role', 'unitid', 'units', 'tenants'].includes(missingColumn)) {
        console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada em user_permissions. Removendo do payload...`);
      }
      delete currentPayload[missingColumn as keyof typeof currentPayload];
      retryCount++;
    } else {
      break;
    }
  }

  if (error) {
    console.warn("Não foi possível criar perfil automático:", error);
    // Fallback para um objeto básico
    console.warn(`[Supabase] Falha ao criar perfil após ${maxRetries} tentativas. Usando fallback básico.`);
    return {
      username: metadata?.username || lowerEmail.split('@')[0],
      email: lowerEmail,
      role: metadata?.role || UserRole.AUDITOR,
      isAdmin: metadata?.isAdmin || false,
      tenantid: metadata?.tenantid || '',
      tenants: metadata?.tenants || []
    };
  }

  // Log de Auditoria
  await logAuditEvent({
    user_email: email,
    action: 'ENSURE_PROFILE',
    table_name: 'user_permissions',
    record_id: userId || 'unknown',
    details: `Perfil de usuário garantido/criado para ${email}`,
    tenant_id: metadata?.tenantid || ''
  });
  
  console.log(`[Supabase] Perfil final para ${email}:`, createdProfile);
  return createdProfile;
};

export const signIn = async (email: string, password: string) => {
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
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getAppBaseUrl(),
    },
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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
  
  // Tenta fazer upsert dos ativos em lotes para evitar erros de tamanho de payload
  const BATCH_SIZE = 1000;
  for (let i = 0; i < assetsWithTenant.length; i += BATCH_SIZE) {
    const batch = assetsWithTenant.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('assets')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      // Se o erro for coluna inexistente (42703), tentamos identificar e remover a coluna
      if (error.code === '42703') {
        // Regex mais flexível para capturar o nome da coluna em diferentes formatos de erro (com ou sem schema)
        const missingColumnMatch = error.message?.match(/column "(.+)" of relation ".+" does not exist/);
        const missingColumn = missingColumnMatch ? missingColumnMatch[1] : null;
        
        if (missingColumn) {
          console.warn(`[Supabase] Coluna "${missingColumn}" não encontrada no banco. Tentando upsert sem ela...`);
          const batchWithoutColumn = batch.map((a) => {
            const rest = { ...a as Record<string, unknown> };
            delete rest[missingColumn];
            return rest;
          });
          
          const { error: retryError } = await supabase
            .from('assets')
            .upsert(batchWithoutColumn, { onConflict: 'id' });
            
          if (retryError) {
            // Se falhar de novo, pode ser outra coluna. Recursividade simples ou log de erro.
            console.error(`[Supabase] Falha no retry de sincronização (coluna ${missingColumn}):`, retryError);
            throw retryError;
          }
          continue; // Sucesso no retry, vai para o próximo lote
        } else if (error.message?.includes('_is_deleted')) {
          // Fallback para _is_deleted se o match do regex falhar
          console.warn('[Supabase] Coluna _is_deleted não encontrada. Tentando upsert sem ela...');
          const batchWithoutDeletedFlag = batch.map((a) => {
            const rest = { ...a as Record<string, unknown> };
            delete rest._is_deleted;
            return rest;
          });
          const { error: retryError } = await supabase
            .from('assets')
            .upsert(batchWithoutDeletedFlag, { onConflict: 'id' });
          if (retryError) throw retryError;
          continue;
        }
      }
      
      console.error('Erro ao sincronizar ativos com o Supabase:', error);
      
      // Handle network errors gracefully
      if (error.message === 'Failed to fetch') {
        console.warn('Supabase sync failed: Network error or invalid URL.');
        throw new Error('Erro de conexão');
      }
      
      throw error;
    }
  }
};

export const syncConfigToCloud = async (config: Omit<InventoryState, 'assets'>, tenantid?: string | string[]) => {
  if (!supabase || !navigator.onLine) return;
  
  // Filtra apenas os campos que sabemos que existem na tabela para evitar erros de coluna inexistente
  const allowedKeys = [
    'id', 
    'companies', 
    'lastUpdated', 
    'status',
    'editableFields', 
    'qrCodeFields', 
    'scannerMode', 
    'autoConfirmOnScan', 
    'scanFeedbackMode', 
    'inventorySearchMode',
    'immersiveMode',
    'darkMode',
    'batterySaver',
    'protheusIntegrationEnabled',
    'protheusApiUrl',
    'mandatoryPhotoOnDivergence',
    'mandatoryPhotoOnNewItem',
    'databaseMode',
    '_tenantid'
  ];

  const configId = tenantid 
    ? (Array.isArray(tenantid) ? `config_${tenantid[0]}` : `config_${tenantid}`)
    : 'global_config';
  const filteredConfig: Record<string, unknown> = { id: configId };
  if (tenantid) filteredConfig._tenantid = Array.isArray(tenantid) ? tenantid[0] : tenantid;
  
  Object.keys(config).forEach(key => {
    if (allowedKeys.includes(key)) {
      filteredConfig[key] = (config as Record<string, unknown>)[key];
    }
  });

  // Lógica de tentativa resiliente para lidar com cache de schema desatualizado
  const currentPayload = { ...filteredConfig };
  let error = null;
  let retryCount = 0;
  const maxRetries = 5;

  while (retryCount < maxRetries) {
    const { error: syncError } = await supabase
      .from('inventory_config')
      .upsert([currentPayload], { onConflict: 'id' });
    
    if (!syncError) {
      error = null;
      break;
    }

    error = syncError;
    
    // Se o erro for de coluna não encontrada no cache do schema, 
    // removemos a coluna específica e tentamos novamente o restante
      const errorMessage = syncError.message || "";
      // Captura tanto erro de cache (PGRST204) quanto erro de coluna indefinida (42703)
      const match = errorMessage.match(/Could not find the '(.+)' column/) || 
                    errorMessage.match(/column "(.+)" of relation ".+" does not exist/) ||
                    errorMessage.match(/column (.+) does not exist/);
      
      if (match && (match[1] || match[2])) {
        const missingColumn = match[1] || match[2];
        // Silencioso para colunas opcionais conhecidas
        if (!['darkMode', 'databaseMode', 'batterySaver', 'immersiveMode'].includes(missingColumn)) {
          console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada em inventory_config. Removendo do payload...`);
        }
        delete currentPayload[missingColumn];
        retryCount++;
      } else {
      // Outro tipo de erro, não adianta tentar remover colunas
      break;
    }
  }

  if (error) {
    // Handle network errors gracefully
    if (error.message === 'Failed to fetch') {
      console.warn('Supabase sync failed: Network error or invalid URL.');
      throw new Error('Erro de conexão');
    }

    console.error('Error syncing config to Supabase:', error);
    throw error;
  }
};

/**
 * Fetches user permissions/profile from Supabase database
 * This is used after Protheus authentication
 */
export const getUserPermissions = async (email: string) => {
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
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('user_permissions')
      .select('email')
      .ilike('username', username)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar e-mail por username:', error);
      return null;
    }

    return data?.email || null;
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
          const currentPayload = {
            email: email.toLowerCase().trim(),
            username: username || email.split('@')[0],
            name: name || username || email.split('@')[0],
            role: role || 'AUDITOR',
            isAdmin: role === 'ADMIN' || role === 'MASTER',
            tenantid: tenantid || '',
            unitid: unitid || '',
            units: units || (unitid ? [unitid] : []),
            tenants: tenants || (tenantid ? [tenantid] : [])
          };

          let retryCount = 0;
          const maxRetries = 5;
          let permError = null;

          while (retryCount < maxRetries) {
            const { error: syncError } = await supabase
              .from('user_permissions')
              .upsert([currentPayload], { onConflict: 'email' });
              
            if (!syncError) {
              console.log(`[Supabase] Permissões sincronizadas para usuário existente ${email}.`);
              return { success: true, existing: true, user: { email } };
            }

            permError = syncError;
            const errorMessage = syncError.message || "";
            const match = errorMessage.match(/Could not find the '(.+)' column/) || 
                          errorMessage.match(/column "(.+)" of relation ".+" does not exist/) ||
                          errorMessage.match(/column (.+) does not exist/);
            
            if (match && (match[1] || match[2])) {
              const missingColumn = (match[1] || match[2]).replace(/"/g, '');
              console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada durante atualização de usuário existente. Removendo...`);
              delete (currentPayload as Record<string, unknown>)[missingColumn];
              retryCount++;
            } else {
              break;
            }
          }
            
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
        isAdmin: is_admin,
        tenantid: normTenantId,
        unitid: normUnitId,
        units: normalizeArray(units || (normUnitId ? [normUnitId] : [])),
        tenants: normalizeArray(tenants || (normTenantId ? [normTenantId] : []))
      };

      let retryCount = 0;
      const maxRetries = 5;
      let permError = null;

      while (retryCount < maxRetries) {
        const { error: syncError } = await supabase
          .from('user_permissions')
          .upsert([currentPayload], { onConflict: 'email' });
        
        if (!syncError) {
          permError = null;
          break;
        }

        permError = syncError;
        const errorMessage = syncError.message || "";
        const match = errorMessage.match(/Could not find the '(.+)' column/) || 
                      errorMessage.match(/column "(.+)" of relation ".+" does not exist/) ||
                      errorMessage.match(/column (.+) does not exist/);
        
        if (match && (match[1] || match[2])) {
          const missingColumn = (match[1] || match[2]).replace(/"/g, '');
          console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada em user_permissions durante provisionamento. Removendo...`);
          delete currentPayload[missingColumn as keyof typeof currentPayload];
          retryCount++;
        } else {
          break;
        }
      }
        
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
      return {
        email: u.email.toLowerCase().trim(),
        username: u.username,
        name: u.name || u.username,
        role: u.role,
        is_admin,
        isAdmin: is_admin,
        tenantid: normalizeValue(u.tenantid || ''),
        unitid: normalizeValue(u.unitid || ''),
        units: normalizeArray(u.units || (u.unitid ? [u.unitid] : [])),
        tenants: normalizeArray(u.tenants || (u.tenantid ? [u.tenantid] : []))
      };
    });

    // Lógica de tentativa resiliente
    let currentBatch = [...usersToSync];
    let error = null;
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries) {
      const { error: syncError } = await supabase
        .from('user_permissions')
        .upsert(currentBatch, { onConflict: 'email' });
      
      if (!syncError) {
        error = null;
        break;
      }

      error = syncError;
      const errorMessage = syncError.message || "";
      const match = errorMessage.match(/Could not find the '(.+)' column/) || 
                    errorMessage.match(/column "(.+)" of relation ".+" does not exist/) ||
                    errorMessage.match(/column (.+) does not exist/);
      
      if (match && (match[1] || match[2])) {
        const missingColumn = (match[1] || match[2]).replace(/"/g, '');
        // Silencioso para colunas opcionais conhecidas
        if (!['is_admin', 'isAdmin', 'name', 'role', 'unitid', 'units', 'tenants'].includes(missingColumn)) {
          console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada em user_permissions durante sincronização em lote. Removendo...`);
        }
        currentBatch = currentBatch.map(u => {
          const newU = { ...u };
          delete newU[missingColumn as keyof typeof newU];
          return newU;
        });
        retryCount++;
      } else {
        break;
      }
    }

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
  if (!supabase) return [];

  try {
    console.log(`[Supabase] Buscando usuários da nuvem (Tenant: ${tenantid || 'todos'})...`);
    let query = supabase.from('user_permissions').select('*');
    
    if (tenantid && tenantid !== '') {
      query = query.eq('tenantid', tenantid);
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
          tenantid: felipe.tenantid,
          unitid: felipe.unitid,
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
      const tenantid = normalizeValue(u.tenantid || '');
      const unitid = normalizeValue(u.unitid || '');
      return {
        username: u.username || u.email.split('@')[0],
        name: u.name || u.username || u.email.split('@')[0],
        email: u.email,
        password: '', // Senhas não são expostas
        role: u.role as UserRole,
        is_admin,
        isAdmin: is_admin,
        mustChangePassword: false,
        tenantid,
        unitid,
        units: normalizeArray(u.units || (unitid ? [unitid] : [])),
        tenants: normalizeArray(u.tenants || (tenantid ? [tenantid] : []))
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

    const { data: initialAssets, error: assetsError } = await assetsQuery;
    
    if (!assetsError) {
      assets = (initialAssets as unknown as Asset[]) || [];
    } else {
      // Tratamento de erros de schema ou colunas
      if (assetsError.code === '3F000' || assetsError.code === '42P01') {
        const errorMsg = `[CRÍTICO] O ambiente "${supabaseSchema}" não está configurado no Supabase. Execute o script de provisionamento de schema.`;
        console.error(errorMsg, assetsError);
        throw new Error(errorMsg);
      }

      if (assetsError.code === '42703') {
        console.warn(`[Supabase] Erro de coluna em fetchFullInventory (schema "${supabaseSchema}"). Tentando fallbacks...`);
        
        // Fallback 1: Tenta UNIDADE_OPERACIONAL
        let fallbackQuery = supabase.from('assets').select('*');
        if (tenantid) {
          if (Array.isArray(tenantid)) fallbackQuery = fallbackQuery.in('_tenantid', tenantid);
          else fallbackQuery = fallbackQuery.eq('_tenantid', tenantid);
        }
        if (unitid && unitid !== '') {
          const cleanUnitId = unitid.toUpperCase().replace(/_/g, ' ').trim();
          fallbackQuery = fallbackQuery.eq('UNIDADE_OPERACIONAL', cleanUnitId);
        }
        
        const { data: fallbackData, error: fallbackError } = await fallbackQuery;
        
        if (!fallbackError) {
          assets = (fallbackData as unknown as Asset[]) || [];
        } else if (fallbackError.code === '42703') {
          // Fallback 2: Tenta unidade_operacional (lowercase)
          console.warn('[Supabase] Tentando unidade_operacional (lowercase)...');
          let finalQuery = supabase.from('assets').select('*');
          if (tenantid) {
            if (Array.isArray(tenantid)) finalQuery = finalQuery.in('_tenantid', tenantid);
            else finalQuery = finalQuery.eq('_tenantid', tenantid);
          }
          if (unitid && unitid !== '') {
            const cleanUnitId = unitid.toUpperCase().replace(/_/g, ' ').trim();
            finalQuery = finalQuery.eq('unidade_operacional', cleanUnitId);
          }
          const { data: finalData, error: finalError } = await finalQuery;
          
          if (!finalError) {
            assets = (finalData as unknown as Asset[]) || [];
          } else if (finalError.code === '42703') {
            // Fallback 3: Busca tudo sem filtro de unidade
            console.warn('[Supabase] Fallback final: buscando tudo sem filtros de unidade...');
            let allQuery = supabase.from('assets').select('*');
            if (tenantid) {
              if (Array.isArray(tenantid)) allQuery = allQuery.in('_tenantid', tenantid);
              else allQuery = allQuery.eq('_tenantid', tenantid);
            }
            const { data: allData, error: allError } = await allQuery;
            if (allError) throw allError;
            assets = (allData as unknown as Asset[]) || [];
          } else {
            throw finalError;
          }
        } else {
          throw fallbackError;
        }
      } else {
        console.error('Erro ao buscar ativos do Supabase:', assetsError);
        throw assetsError;
      }
    }

    // 2. Busca a configuração
    const configId = tenantid 
      ? (Array.isArray(tenantid) ? `config_${tenantid[0]}` : `config_${tenantid}`)
      : 'global_config';
    
    let config = {};
    const { data: configData, error: configError } = await supabase
      .from('inventory_config')
      .select('*')
      .eq('id', configId)
      .maybeSingle();

    if (configError) {
      console.warn('Erro ao buscar configuração do Supabase:', configError);
    } else if (configData) {
      config = configData;
    } else {
      const { data: globalConfigData } = await supabase
        .from('inventory_config')
        .select('*')
        .eq('id', 'global_config')
        .maybeSingle();
      if (globalConfigData) config = globalConfigData;
    }

    return {
      assets: assets,
      config: config as Partial<InventoryState>
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
        if (!tenantid) {
          query = query.neq('id', '00000000-0000-0000-0000-000000000000');
        }
      }
    } catch (e) {
      console.warn('[Supabase] Erro ao construir query de limpeza:', e);
    }

    const { error: assetsError, count } = await query;

    if (assetsError) {
      // Se o erro for coluna inexistente (_unitid ou _tenantid), tentamos fallbacks
      if (assetsError.code === '42703') {
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
           retryQuery = retryQuery.neq('id', '00000000-0000-0000-0000-000000000000');
        }
        
        const { error: retryError, count: retryCount } = await retryQuery;
        if (retryError) {
          // Se ainda falhar, tenta o delete mais radical (sem filtros de coluna)
          console.warn('[Supabase] Fallback falhou. Tentando delete radical...');
          const { error: finalError, count: finalCount } = await supabase.from('assets').delete({ count: 'exact' }).neq('id', '00000000-0000-0000-0000-000000000000');
          if (finalError) throw finalError;
          console.log(`[Supabase] Limpeza radical concluída. Afetados: ${finalCount}`);
          return;
        }
        console.log(`[Supabase] Limpeza concluída via fallback. Afetados: ${retryCount}`);
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
      .eq('tenantid', tenantid)
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
      .eq('tenant_id', tenantid)
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
 * Busca todas as campanhas de um tenant
 */
export const fetchCampaigns = async (tenantid: string): Promise<InventoryCampaign[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('inventory_campaigns')
    .select('*')
    .eq('tenantid', tenantid)
    .order('start_date', { ascending: false });
  
  if (error) {
    console.error('Erro ao buscar campanhas:', error);
    return [];
  }
  return (data || []) as InventoryCampaign[];
};

/**
 * Cria uma nova campanha
 */
export const createCampaign = async (campaign: Partial<InventoryCampaign>): Promise<InventoryCampaign | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('inventory_campaigns')
    .insert([campaign])
    .select();
  
  if (error) {
    console.error('Erro ao criar campanha:', error);
    return null;
  }
  return data ? data[0] as InventoryCampaign : null;
};

/**
 * Atualiza o status de uma campanha
 */
export const updateCampaignStatus = async (campaignId: string, status: CampaignStatus): Promise<boolean> => {
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
 * Busca as configurações de geofencing das unidades de um tenant
 */
export const fetchUnitConfigs = async (tenantid: string): Promise<UnitConfig[]> => {
  if (!supabase) return [];
  
  try {
    const { data, error } = await supabase
      .from('unit_configs')
      .select('*')
      .eq('tenant_id', tenantid);
    
    if (error) {
      // Se a tabela não existir ainda ou não estiver no cache, retorna vazio silenciosamente
      if (error.code === '42P01' || error.code === 'PGRST205') return [];
      console.error('Erro ao buscar configurações de unidades:', error);
      return [];
    }
    
    return (data || []) as UnitConfig[];
  } catch (err) {
    console.error('Erro inesperado ao buscar configurações de unidades:', err);
    return [];
  }
};

/**
 * Salva ou atualiza a configuração de geofencing de uma unidade
 */
export const saveUnitConfig = async (config: UnitConfig): Promise<boolean> => {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('unit_configs')
      .upsert([config], { onConflict: 'tenant_id,unit_id' });
    
    if (error) {
      console.error('Erro ao salvar configuração de unidade:', error);
      return false;
    }
    
    // Log de Auditoria
    await logAuditEvent({
      user_email: config.updated_by || 'system',
      action: 'UPDATE_UNIT_GEOFENCING',
      table_name: 'unit_configs',
      details: `Configuração de geofencing atualizada para unidade: ${config.unit_id}`,
      tenant_id: config.tenant_id
    });
    
    return true;
  } catch (err) {
    console.error('Erro inesperado ao salvar configuração de unidade:', err);
    return false;
  }
};
