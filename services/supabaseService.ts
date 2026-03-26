
import { createClient } from '@supabase/supabase-js';
import imageCompression from 'browser-image-compression';
import { Asset, InventoryState, User, UserRole, InventoryCampaign, CampaignStatus } from '../types';
import { getAppBaseUrl } from '../utils/urlUtils';

export interface ProvisionResult {
  user: unknown;
  existing?: boolean;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize client only if credentials exist to prevent crash
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
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
    const { error } = await supabase
      .from('audit_logs')
      .insert([entry]);

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
    const { error } = await supabase
      .from('asset_logs')
      .insert([{
        ...entry,
        timestamp: new Date().toISOString()
      }]);

    if (error) {
      console.error('Erro ao registrar log de ativo:', error);
    }
  } catch (err) {
    console.error('Erro inesperado ao registrar log de ativo:', err);
  }
};

export const signUp = async (email: string, password: string, username: string, tenantid: string, role: string = 'ADMIN', name?: string, unitid?: string, units?: string[]) => {
  if (!supabase) throw new Error("Supabase não configurado.");
  
  // 1. Cria o usuário no Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        name: name || username,
        role,
        tenantid,
        unitid: unitid || tenantid,
        units: units || [unitid || tenantid],
        tenants: [tenantid] // Mantido para compatibilidade
      },
    },
  });
  
  if (error) {
    if (error.message.includes('already registered')) {
      throw new Error('Este e-mail já está cadastrado. Tente fazer login ou recupere sua senha.');
    }
    throw error;
  }

  // 2. Cria o perfil na tabela user_permissions para garantir sincronia
  if (data.user) {
    const { error: permError } = await supabase
      .from('user_permissions')
      .upsert([{
        id: data.user.id, // Sincroniza com o ID do Auth
        email: email.toLowerCase(),
        username,
        name: name || username,
        role,
        isAdmin: role === 'ADMIN' || role === 'MASTER',
        tenantid,
        unitid: unitid || tenantid,
        units: units || [unitid || tenantid],
        tenants: [tenantid]
      }], { onConflict: 'email' });
      
    if (permError) {
      console.warn("Erro ao criar permissões, mas usuário foi criado no Auth:", permError);
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
  const { data: profiles, error: fetchError } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('email', lowerEmail);
    
  if (fetchError) throw fetchError;
  
  if (profiles && profiles.length > 0) {
    const profile = profiles[0];
    
    // Se o perfil existe mas não tem o ID (ou o ID é diferente), atualiza para sincronizar
    if (userId && profile.id !== userId) {
      await supabase
        .from('user_permissions')
        .update({ id: userId })
        .eq('email', lowerEmail);
    }

    return {
      ...profile,
      username: metadata?.username || profile.username || lowerEmail.split('@')[0],
      name: metadata?.name || profile.name || metadata?.username || profile.username || lowerEmail.split('@')[0],
      role: metadata?.role || profile.role || (profile.isAdmin ? UserRole.ADMIN : UserRole.AUDITOR),
      tenantid: metadata?.tenantid || profile.tenantid || 'default',
      unitid: metadata?.unitid || profile.unitid || metadata?.tenantid || profile.tenantid || 'default',
      units: metadata?.units || profile.units || metadata?.tenants || profile.tenants || [profile.tenantid || 'default'],
      tenants: metadata?.tenants || profile.tenants || [profile.tenantid || 'default']
    };
  }
  
  // 2. Se não existir, cria um perfil padrão
  const insertData = {
    email: lowerEmail,
    username: metadata?.username || lowerEmail.split('@')[0],
    name: metadata?.name || metadata?.username || lowerEmail.split('@')[0],
    role: metadata?.role || UserRole.AUDITOR,
    isAdmin: metadata?.isAdmin || false,
    tenantid: metadata?.tenantid || 'default',
    unitid: metadata?.unitid || metadata?.tenantid || 'default',
    units: metadata?.units || [metadata?.tenantid || 'default'],
    tenants: metadata?.tenants || [metadata?.tenantid || 'default'],
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
      createdProfile = newProfile;
      error = null;
      break;
    }

    error = createError;
    
    const errorMessage = createError.message || "";
    const match = errorMessage.match(/Could not find the '(.+)' column/) || 
                  errorMessage.match(/column "(.+)" of relation ".+" does not exist/) ||
                  errorMessage.match(/column (.+) does not exist/);
    
    if (match && (match[1] || match[2])) {
      const missingColumn = (match[1] || match[2]).replace(/"/g, '');
      console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada em user_permissions. Removendo do payload e tentando novamente...`);
      delete currentPayload[missingColumn as keyof typeof currentPayload];
      retryCount++;
    } else {
      break;
    }
  }

  if (error) {
    console.warn("Não foi possível criar perfil automático:", error);
    // Fallback para um objeto básico
    return {
      username: metadata?.username || lowerEmail.split('@')[0],
      email: lowerEmail,
      role: metadata?.role || UserRole.AUDITOR,
      isAdmin: metadata?.isAdmin || false,
      tenantid: metadata?.tenantid || 'default',
      tenants: metadata?.tenants || ['default']
    };
  }

  // Log de Auditoria
  await logAuditEvent({
    user_email: email,
    action: 'ENSURE_PROFILE',
    table_name: 'user_permissions',
    record_id: userId || 'unknown',
    details: `Perfil de usuário garantido/criado para ${email}`,
    tenant_id: metadata?.tenantid || 'default'
  });
  
  return createdProfile;
};

export const signIn = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
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

    const assetEmpresa = (cleanAsset.EMPRESA || '').toUpperCase().trim();
    let finalTenantId = 'default';
    
    if (tenantid) {
      if (Array.isArray(tenantid)) {
        // Se for um array (múltiplos tenants), tenta bater com a empresa do ativo
        const match = tenantid.find(t => t.toUpperCase().trim() === assetEmpresa);
        finalTenantId = match || tenantid[0] || 'default';
      } else {
        finalTenantId = tenantid;
      }
    } else {
      finalTenantId = a._tenantid || assetEmpresa || 'default';
    }

    return {
      ...cleanAsset,
      _lat: lat,
      _lng: lng,
      _conferido: conferido,
      _tenantid: finalTenantId,
      _unitid: a._unitid || null,
      EMPRESA: assetEmpresa
    };
  });

  // Tenta fazer upsert dos ativos em lotes para evitar erros de tamanho de payload
  const BATCH_SIZE = 1000;
  for (let i = 0; i < assetsWithTenant.length; i += BATCH_SIZE) {
    const batch = assetsWithTenant.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('assets')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      // Handle network errors gracefully
      if (error.message === 'Failed to fetch') {
        console.warn('Supabase sync failed: Network error or invalid URL.');
        throw new Error('Erro de conexão');
      }

      console.error('Error syncing assets to Supabase:', error);
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
        console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada. Removendo do payload e tentando novamente...`);
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
      .eq('username', username)
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
  if (!supabaseUrl || !supabaseAnonKey || !email || !password) {
    throw new Error('Dados insuficientes para provisionamento (E-mail ou Senha ausentes).');
  }

  try {
    // Criamos um cliente temporário para não afetar a sessão do Admin logado
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
    tenantid: tenantid || 'default',
    unitid: unitid || tenantid || 'default',
    units: units || [unitid || tenantid || 'default'],
    tenants: tenants || [tenantid || 'default'],
          provisioned_by: 'admin_dashboard'
        }
      }
    });

    if (error) {
      // Se o usuário já existe, não falhamos o processo inteiro, 
      // tentamos apenas atualizar as permissões na tabela
      if (error.message.includes('already registered') || error.status === 422) {
        console.log('Usuário já registrado no Auth. Tentando atualizar permissões...');
        
        if (supabase) {
          const currentPayload = {
            email: email.toLowerCase().trim(),
            username: username || email.split('@')[0],
            name: name || username || email.split('@')[0],
            role: role || 'AUDITOR',
            isAdmin: role === 'ADMIN' || role === 'MASTER',
            tenantid: tenantid || 'default',
            unitid: unitid || tenantid || 'default',
            units: units || [unitid || tenantid || 'default'],
            tenants: tenants || [tenantid || 'default']
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
              console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada durante atualização de usuário existente. Removendo...`);
              delete currentPayload[missingColumn as keyof typeof currentPayload];
              retryCount++;
            } else {
              break;
            }
          }
            
          if (permError) throw permError;
          return { user: { email }, existing: true };
        }
      }
      
      console.error('Erro no signUp do Supabase:', error);
      throw error;
    }

    // 2. Garante que o perfil exista na tabela user_permissions
    // Importante: Usamos o cliente principal (supabase) aqui, pois ele tem as permissões de escrita (se o RLS permitir)
    if (supabase && data.user) {
      const currentPayload = {
        id: data.user.id, // Sincroniza ID
        email: email.toLowerCase().trim(),
        username: username || email.split('@')[0],
        name: name || username || email.split('@')[0],
        role: role || 'AUDITOR',
        isAdmin: role === 'ADMIN' || role === 'MASTER',
        tenantid: tenantid || 'default',
        unitid: unitid || tenantid || 'default',
        units: units || [unitid || tenantid || 'default'],
        tenants: tenants || [tenantid || 'default']
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
    const usersToSync = users.map(u => ({
      email: u.email.toLowerCase().trim(),
      username: u.username,
      name: u.name || u.username,
      role: u.role,
      isAdmin: u.isAdmin || u.role === 'ADMIN' || u.role === 'MASTER',
      tenantid: u.tenantid || 'default',
      unitid: u.unitid || u.tenantid || 'default',
      units: u.units || [u.unitid || u.tenantid || 'default'],
      tenants: u.tenants || [u.tenantid || 'default']
    }));

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
        console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada em user_permissions durante sincronização em lote. Removendo...`);
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
    
    if (tenantid && tenantid !== 'default') {
      query = query.eq('tenantid', tenantid);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar usuários do Supabase:', error);
      return [];
    }

    console.log(`[Supabase] ${data?.length || 0} usuários encontrados na nuvem.`);

    return (data || []).map(u => ({
      username: u.username || u.email.split('@')[0],
      name: u.name || u.username || u.email.split('@')[0],
      email: u.email,
      password: '', // Senhas não são expostas
      role: u.role as UserRole,
      isAdmin: u.isAdmin || u.role === 'ADMIN',
      mustChangePassword: false,
      tenantid: u.tenantid || 'default',
      unitid: u.unitid || u.tenantid || 'default',
      units: u.units || [u.unitid || u.tenantid || 'default'],
      tenants: u.tenants || [u.tenantid || 'default']
    }));
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
    
    if (tenantid) {
      query = query.eq('_tenantid', tenantid);
    }

    const { data, error } = await query.single();

    if (error) {
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

/**
 * Busca todo o inventário (ativos e configuração) do Supabase
 */
/**
 * Busca todo o inventário (ativos e configuração) do Supabase
 */
export const fetchFullInventory = async (tenantid?: string | string[], unitid?: string): Promise<{ assets: Asset[], config: Partial<InventoryState> } | null> => {
  if (!supabase || !navigator.onLine) return null;

  try {
    // 1. Busca todos os ativos filtrados por tenantid e opcionalmente unitid
    let assetsQuery = supabase.from('assets').select('*');
    if (tenantid) {
      if (Array.isArray(tenantid)) {
        assetsQuery = assetsQuery.in('_tenantid', tenantid);
      } else {
        assetsQuery = assetsQuery.eq('_tenantid', tenantid);
      }
    }
    
    if (unitid && unitid !== 'default') {
      assetsQuery = assetsQuery.eq('_unitid', unitid);
    }

    const { data: assets, error: assetsError } = await assetsQuery;

    if (assetsError) {
      console.error('Erro ao buscar ativos do Supabase:', assetsError);
      throw assetsError;
    }

    // 2. Busca a configuração (pode ser global ou por tenant)
    const configId = tenantid 
      ? (Array.isArray(tenantid) ? `config_${tenantid[0]}` : `config_${tenantid}`)
      : 'global_config';
    
    let config = {};
    
    // Busca resiliente: tenta select('*')
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
      // Se não achar por ID específico, tenta a global
      const { data: globalData } = await supabase
        .from('inventory_config')
        .select('*')
        .eq('id', 'global_config')
        .maybeSingle();
      if (globalData) config = globalData;
    }

    return {
      assets: (assets as Asset[]) || [],
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
            ? tenantid.includes(assetTenant || 'default')
            : (assetTenant || 'default') === tenantid;
          
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
    
    // Filtro por Tenant (Segurança RLS)
    if (tenantid) {
      query = query.eq('_tenantid', tenantid);
    }
    
    if (companyToClear) {
      if (Array.isArray(companyToClear)) {
        const normalizedCompanies = companyToClear.map(c => c.toUpperCase().trim());
        query = query.in('EMPRESA', normalizedCompanies);
      } else {
        query = query.eq('EMPRESA', companyToClear.toUpperCase().trim());
      }
    } else {
      // Limpeza total (se houver tenantid, o filtro acima já limita ao tenant)
      if (!tenantid) {
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const { error: assetsError, count } = await query;

    if (assetsError) {
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

    return data.publicUrl;
  } catch (err) {
    console.error('Erro inesperado no upload da foto:', err);
    return null;
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
