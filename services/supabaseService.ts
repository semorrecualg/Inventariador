
import { createClient } from '@supabase/supabase-js';
import { Asset, InventoryState } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize client only if credentials exist to prevent crash
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const signUp = async (email: string, password: string, username: string, tenantId: string, role: string = 'ADMIN') => {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        role,
        tenantId, // Este campo é lido pela função public.get_tenant_id() no SQL
      },
    },
  });
  if (error) throw error;
  return data;
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
      _tenantId: tenantId || a._tenantId || 'default'
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

  const configId = tenantId ? `config_${tenantId}` : 'global_config';
  const filteredConfig: Record<string, unknown> = { id: configId };
  if (tenantId) filteredConfig._tenantId = tenantId;
  
  Object.keys(config).forEach(key => {
    if (allowedKeys.includes(key)) {
      filteredConfig[key] = (config as Record<string, unknown>)[key];
    }
  });

  const { error } = await supabase
    .from('inventory_config')
    .upsert([filteredConfig], { onConflict: 'id' });

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
export const fetchFullInventory = async (tenantId?: string): Promise<{ assets: Asset[], config: Partial<InventoryState> } | null> => {
  if (!supabase) return null;

  try {
    // 1. Busca todos os ativos filtrados por tenantId
    let assetsQuery = supabase.from('assets').select('*');
    if (tenantId) {
      assetsQuery = assetsQuery.eq('_tenantId', tenantId);
    }
    const { data: assets, error: assetsError } = await assetsQuery;

    if (assetsError) {
      console.error('Erro ao buscar ativos do Supabase:', assetsError);
      throw assetsError;
    }

    // 2. Busca a configuração (pode ser global ou por tenant)
    let configQuery = supabase.from('inventory_config').select('*');
    if (tenantId) {
      configQuery = configQuery.eq('id', `config_${tenantId}`);
    } else {
      configQuery = configQuery.eq('id', 'global_config');
    }
    
    const { data: configData, error: configError } = await configQuery.single();

    let config = {};
    if (configError) {
      if (configError.code !== 'PGRST116') { // Se não for apenas "não encontrado"
        console.warn('Erro ao buscar configuração do Supabase:', configError);
      }
    } else {
      config = configData;
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
 * Limpa todos os ativos e configurações do Supabase (ou apenas de uma empresa específica)
 */
export const clearCloudInventory = async (companyToClear?: string | string[], tenantId?: string): Promise<void> => {
  if (!supabase) return;

  try {
    // 1. Limpa os ativos
    let query = supabase.from('assets').delete();
    
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

    const { error: assetsError } = await query;

    if (assetsError) {
      console.error('Erro ao limpar ativos na nuvem:', assetsError);
      throw assetsError;
    }

    // 2. Limpa a configuração (apenas se estiver limpando TUDO)
    if (!companyToClear) {
      const configId = tenantId ? `config_${tenantId}` : 'global_config';
      const { error: configError } = await supabase
        .from('inventory_config')
        .delete()
        .eq('id', configId);

      if (configError) {
        console.warn('Erro ao limpar configuração na nuvem (pode não existir):', configError);
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
