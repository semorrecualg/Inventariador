
import { createClient } from '@supabase/supabase-js';
import { Asset, InventoryState, User, UserRole } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize client only if credentials exist to prevent crash
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const signUp = async (email: string, password: string, username: string, tenantId: string, role: string = 'ADMIN') => {
  if (!supabase) throw new Error("Supabase não configurado.");
  
  // 1. Cria o usuário no Supabase Auth
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        role,
        tenantId,
      },
    },
  });
  
  if (error) throw error;

  // 2. Cria o perfil na tabela user_permissions para garantir sincronia
  // Usamos upsert para evitar erros se o trigger já tiver criado (embora não tenhamos trigger no schema)
  if (data.user) {
    const { error: permError } = await supabase
      .from('user_permissions')
      .upsert([{
        email: email.toLowerCase(),
        username,
        role,
        isAdmin: role === 'ADMIN',
        tenantId
      }], { onConflict: 'email' });
      
    if (permError) {
      console.warn("Erro ao criar permissões, mas usuário foi criado no Auth:", permError);
    }
  }

  return data;
};

/**
 * Garante que o usuário tenha um perfil na tabela user_permissions.
 * Se não existir, cria um perfil padrão.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ensureUserProfile = async (email: string, metadata?: Record<string, any>): Promise<any> => {
  if (!supabase) throw new Error("Supabase não configurado.");
  
  const lowerEmail = email.toLowerCase();
  
  // 1. Busca perfil existente
  const { data: profiles, error: fetchError } = await supabase
    .from('user_permissions')
    .select('*')
    .eq('email', lowerEmail);
    
  if (fetchError) throw fetchError;
  
  if (profiles && profiles.length > 0) {
    return profiles[0];
  }
  
  // 2. Se não existir, cria um perfil padrão
  const { data: newProfile, error: createError } = await supabase
    .from('user_permissions')
    .insert([{
      email: lowerEmail,
      username: metadata?.username || lowerEmail.split('@')[0],
      role: metadata?.role || UserRole.AUDITOR,
      isAdmin: metadata?.isAdmin || false,
      tenantId: metadata?.tenantId || 'default'
    }])
    .select()
    .single();
    
  if (createError) {
    console.warn("Não foi possível criar perfil automático:", createError);
    // Fallback para um objeto básico
    return {
      username: metadata?.username || lowerEmail.split('@')[0],
      email: lowerEmail,
      role: UserRole.AUDITOR,
      isAdmin: false,
      tenantId: 'default'
    };
  }
  
  return newProfile;
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
      emailRedirectTo: window.location.origin,
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

export const syncAssetsToCloud = async (assets: Asset[], tenantId?: string) => {
  if (!supabase || !assets || assets.length === 0) return;

  // Garante que todos os ativos tenham o tenantId antes de subir
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

    return {
      ...cleanAsset,
      _lat: lat,
      _lng: lng,
      _conferido: conferido,
      _tenantId: tenantId || a._tenantId || 'default',
      EMPRESA: (cleanAsset.EMPRESA || '').toUpperCase().trim()
    };
  });

  // Tenta fazer upsert dos ativos
  const { error } = await supabase
    .from('assets')
    .upsert(assetsWithTenant, { onConflict: 'id' });

  if (error) {
    // Handle network errors gracefully
    if (error.message === 'Failed to fetch') {
      console.warn('Supabase sync failed: Network error or invalid URL.');
      throw new Error('Erro de conexão');
    }

    console.error('Error syncing assets to Supabase:', error);
    throw error;
  }
};

export const syncConfigToCloud = async (config: Omit<InventoryState, 'assets'>, tenantId?: string) => {
  if (!supabase) return;
  
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
    '_tenantId'
  ];

  const configId = tenantId 
    ? (Array.isArray(tenantId) ? `config_${tenantId[0]}` : `config_${tenantId}`)
    : 'global_config';
  const filteredConfig: Record<string, unknown> = { id: configId };
  if (tenantId) filteredConfig._tenantId = Array.isArray(tenantId) ? tenantId[0] : tenantId;
  
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
    const match = errorMessage.match(/Could not find the '(.+)' column/);
    
    if (match && match[1]) {
      const missingColumn = match[1];
      console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada no cache. Removendo e tentando novamente...`);
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
 * Provisiona um usuário no Supabase Auth (Cria o login oficial)
 * Nota: Como é um SPA, usamos signUp. Para evitar deslogar o admin,
 * criamos uma instância temporária do cliente.
 */
export const provisionUserInAuth = async (email: string, password?: string) => {
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
          provisioned_by: 'admin_dashboard'
        }
      }
    });

    if (error) {
      console.error('Erro no signUp do Supabase:', error);
      throw error;
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
export const syncUsersToCloud = async (users: User[], tenantId?: string) => {
  if (!supabase || !users || users.length === 0) return;

  try {
    const usersToSync = users.map(u => ({
      email: u.email.toLowerCase().trim(),
      username: u.username,
      role: u.role,
      isAdmin: u.isAdmin || u.role === 'ADMIN',
      tenantId: u.tenantId || 'default',
      tenants: u.tenants || [u.tenantId || 'default'],
      _tenantId: tenantId || u.tenantId || 'default'
    }));

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
 * Busca um ativo específico pela etiqueta no Supabase (para consulta pública via QR Code)
 */
export const getAssetByTag = async (tag: string, tenantId?: string): Promise<Asset | null> => {
  if (!supabase) return null;

  try {
    let query = supabase
      .from('assets')
      .select('*')
      .eq('ETIQUETA', tag.toUpperCase().trim());
    
    if (tenantId) {
      query = query.eq('_tenantId', tenantId);
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
export const fetchFullInventory = async (tenantId?: string | string[]): Promise<{ assets: Asset[], config: Partial<InventoryState> } | null> => {
  if (!supabase) return null;

  try {
    // 1. Busca todos os ativos filtrados por tenantId
    let assetsQuery = supabase.from('assets').select('*');
    if (tenantId) {
      if (Array.isArray(tenantId)) {
        assetsQuery = assetsQuery.in('_tenantId', tenantId);
      } else {
        assetsQuery = assetsQuery.eq('_tenantId', tenantId);
      }
    }
    const { data: assets, error: assetsError } = await assetsQuery;

    if (assetsError) {
      console.error('Erro ao buscar ativos do Supabase:', assetsError);
      throw assetsError;
    }

    // 2. Busca a configuração (pode ser global ou por tenant)
    const configId = tenantId 
      ? (Array.isArray(tenantId) ? `config_${tenantId[0]}` : `config_${tenantId}`)
      : 'global_config';
    
    // Lista de colunas conhecidas para tentar uma busca resiliente se o select('*') falhar
    const knownConfigColumns = [
      'id', 'companies', 'lastUpdated', 'status', 'editableFields', 
      'qrCodeFields', 'scannerMode', 'autoConfirmOnScan', 'scanFeedbackMode', 
      'inventorySearchMode', 'immersiveMode', 'darkMode', 'batterySaver',
      'protheusIntegrationEnabled', 'protheusApiUrl', 'mandatoryPhotoOnDivergence',
      'mandatoryPhotoOnNewItem', '_tenantId'
    ];

    let config = {};
    let currentColumns = [...knownConfigColumns];
    let configError = null;
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries) {
      const { data: configData, error: err } = await supabase
        .from('inventory_config')
        .select(currentColumns.join(','))
        .eq('id', configId)
        .single();

      if (!err) {
        config = configData;
        configError = null;
        break;
      }

      configError = err;
      const errorMessage = err.message || "";
      const match = errorMessage.match(/Could not find the '(.+)' column/);

      if (match && match[1]) {
        const missingColumn = match[1];
        console.warn(`[Supabase] Coluna '${missingColumn}' não encontrada no cache durante a busca. Removendo e tentando novamente...`);
        currentColumns = currentColumns.filter(col => col !== missingColumn);
        retryCount++;
      } else if (err.code === 'PGRST116') {
        // Registro não encontrado, não é um erro de cache
        configError = null;
        break;
      } else {
        // Outro erro
        break;
      }
    }

    if (configError) {
      console.warn('Erro ao buscar configuração do Supabase:', configError);
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
export const subscribeToAssetChanges = (tenantId: string | string[], onUpdate: (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => void) => {
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
        // Filtra por tenantId no lado do cliente se necessário, 
        // embora o ideal seja o RLS do Supabase já filtrar se o usuário estiver logado.
        // No entanto, para canais de broadcast/realtime, às vezes precisamos de filtros extras.
        const newAsset = payload.new as Asset;
        const oldAsset = payload.old as Asset;
        const targetAsset = newAsset || oldAsset;

        if (targetAsset && tenantId) {
          const assetTenant = targetAsset._tenantId;
          const isAllowed = Array.isArray(tenantId) 
            ? tenantId.includes(assetTenant || 'default')
            : (assetTenant || 'default') === tenantId;
          
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
export const clearCloudInventory = async (companyToClear?: string | string[], tenantId?: string): Promise<void> => {
  if (!supabase) return;

  try {
    console.log(`[Supabase] Iniciando limpeza na nuvem. Empresa: ${companyToClear || 'TODAS'}, Tenant: ${tenantId || 'GLOBAL'}`);
    
    // 1. Limpa os ativos
    let query = supabase.from('assets').delete({ count: 'exact' });
    
    // Filtro por Tenant (Segurança RLS)
    if (tenantId) {
      query = query.eq('_tenantId', tenantId);
    }
    
    if (companyToClear) {
      if (Array.isArray(companyToClear)) {
        const normalizedCompanies = companyToClear.map(c => c.toUpperCase().trim());
        query = query.in('EMPRESA', normalizedCompanies);
      } else {
        query = query.eq('EMPRESA', companyToClear.toUpperCase().trim());
      }
    } else {
      // Limpeza total (se houver tenantId, o filtro acima já limita ao tenant)
      if (!tenantId) {
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
      const configId = tenantId ? `config_${tenantId}` : 'global_config';
      
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
 * Faz upload de uma foto do ativo para o Supabase Storage
 */
export const uploadAssetPhoto = async (assetId: string, file: File | Blob, tenantId: string): Promise<string | null> => {
  if (!supabase) return null;

  try {
    const fileExt = 'jpg'; // Forçamos jpg para consistência
    const fileName = `${tenantId}/${assetId}/${Date.now()}.${fileExt}`;
    const filePath = `photos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('asset-photos')
      .upload(filePath, file, {
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
 * Atualiza apenas a URL da foto de um ativo na nuvem
 */
export const updateAssetPhotoUrl = async (assetId: string, photoUrl: string, tenantId: string) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('assets')
    .update({ _photoUrl: photoUrl })
    .eq('id', assetId)
    .eq('_tenantId', tenantId);
  if (error) throw error;
};
