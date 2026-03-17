
import { createClient } from '@supabase/supabase-js';
import { Asset, InventoryState, AssetReport } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Initialize client only if credentials exist to prevent crash
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const signUp = async (email: string, password: string, username: string) => {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
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

export const syncAssetsToCloud = async (assets: Asset[]) => {
  if (!supabase || !assets || assets.length === 0) return;

  // Tenta fazer upsert dos ativos
  const { error } = await supabase
    .from('assets')
    .upsert(assets, { onConflict: 'id' });

  if (error) {
    // Se o erro for de coluna inexistente, apenas avisamos no console
    if (error.code === 'PGRST204') {
      console.warn('Coluna inexistente na tabela assets. Sincronização parcial.', error.message);
      return;
    }
    
    // Handle network errors gracefully
    if (error.message === 'Failed to fetch') {
      console.warn('Supabase sync failed: Network error or invalid URL. Check your VITE_SUPABASE_URL.');
      return;
    }

    console.error('Error syncing assets to Supabase:', error);
    throw error;
  }
};

export const syncConfigToCloud = async (config: Omit<InventoryState, 'assets'>) => {
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
    'immersiveMode'
  ];

  const filteredConfig: Record<string, unknown> = { id: 'global_config' };
  
  Object.keys(config).forEach(key => {
    if (allowedKeys.includes(key)) {
      filteredConfig[key] = (config as Record<string, unknown>)[key];
    }
  });

  const { error } = await supabase
    .from('inventory_config')
    .upsert([filteredConfig], { onConflict: 'id' });

  if (error) {
    // Se o erro for de coluna inexistente, logamos mas não travamos o app
    if (error.code === 'PGRST204') {
      console.warn('Coluna inexistente no Supabase (inventory_config). Por favor, atualize o esquema do banco.', error.message);
      return;
    }

    // Handle network errors gracefully
    if (error.message === 'Failed to fetch') {
      console.warn('Supabase sync failed: Network error or invalid URL. Check your VITE_SUPABASE_URL.');
      return;
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
export const getAssetByTag = async (tag: string): Promise<Asset | null> => {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('ETIQUETA', tag.toUpperCase().trim())
      .single();

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
 * Envia um reporte/divergência de um ativo (usado na consulta pública)
 */
export const submitAssetReport = async (report: {
  asset_id: string;
  tag: string;
  reporter_name: string;
  reason: string;
  comment: string;
  location_found: string;
}) => {
  if (!supabase) {
    // Fallback local se não houver Supabase (apenas log para demo)
    console.log('Reporte recebido (Modo Offline):', report);
    return { success: true };
  }

  try {
    const { error } = await supabase
      .from('asset_reports')
      .insert([{
        ...report,
        created_at: new Date().toISOString()
      }]);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.error('Erro ao enviar reporte:', err);
    throw err;
  }
};

/**
 * Busca todos os reportes de ativos (para o admin)
 */
export const getAssetReports = async (): Promise<AssetReport[]> => {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('asset_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as AssetReport[];
  } catch (err) {
    console.error('Erro ao buscar reportes:', err);
    return [];
  }
};

/**
 * Marca um reporte como resolvido
 */
export const resolveAssetReport = async (reportId: string) => {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('asset_reports')
      .update({ resolved: true })
      .eq('id', reportId);

    if (error) throw error;
  } catch (err) {
    console.error('Erro ao resolver reporte:', err);
    throw err;
  }
};
