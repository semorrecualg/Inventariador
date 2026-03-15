import { createClient } from '@supabase/supabase-js';
import { Asset, InventoryState, User } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isConfigured = !!supabaseUrl && !!supabaseAnonKey;

// Initialize with a safe dummy if not configured to prevent crashes in the library
export const supabase = createClient(
  isConfigured ? supabaseUrl : 'https://xyz.supabase.co', 
  isConfigured ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5eiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNTkxMjA0MzUzLCJleHAiOjE5MDY3ODAzNTN9.placeholder'
);

// --- AUTH FUNCTIONS ---

export const signUp = async (email: string, password: string, username: string) => {
  if (!isConfigured) {
    throw new Error('Supabase não configurado. Por favor, configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas configurações do projeto.');
  }
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
      }
    }
  });

  if (error) throw error;
  
  // Create profile entry
  if (data.user) {
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      username,
      email,
      is_admin: email.toLowerCase() === 'semorr@gmail.com' // Default admin
    });
    
    if (profileError) {
      console.error('Erro ao criar perfil:', profileError);
      // Não lançamos erro aqui para não travar o cadastro se o Auth funcionou
    }
  }
  
  return data;
};

export const signIn = async (email: string, password: string) => {
  if (!isConfigured) {
    throw new Error('Supabase não configurado. Por favor, configure as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas configurações do projeto.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    if (error.message === 'Invalid login credentials') {
      throw new Error('E-mail ou senha incorretos. Se você acabou de se cadastrar, verifique se confirmou seu e-mail.');
    }
    throw error;
  }
  return data;
};

export const signInWithMagicLink = async (email: string) => {
  if (!isConfigured) throw new Error('Supabase não configurado.');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
};

export const signOut = async () => {
  if (!isConfigured) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getUserProfile = async (userId: string): Promise<User | null> => {
  if (!isConfigured) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return {
    username: data.username,
    email: data.email,
    isAdmin: data.is_admin,
    mustChangePassword: false
  };
};

// --- DATA SYNC FUNCTIONS ---

export const syncAssetsToCloud = async (assets: Asset[]) => {
  if (!isConfigured) return;

  // Transform assets for Supabase
  // We use upsert to handle updates and inserts
  const { error } = await supabase
    .from('assets')
    .upsert(
      assets.map(asset => ({
        id: String(asset.id),
        data: asset,
        updated_at: new Date().toISOString()
      })),
      { onConflict: 'id' }
    );

  if (error) {
    console.error('Error syncing assets to Supabase:', error);
    throw error;
  }
};

export const fetchAssetsFromCloud = async (): Promise<Asset[]> => {
  if (!isConfigured) return [];

  const { data, error } = await supabase
    .from('assets')
    .select('data');

  if (error) {
    console.error('Error fetching assets from Supabase:', error);
    return [];
  }

  return data.map(row => row.data as Asset);
};

export const syncConfigToCloud = async (config: Partial<InventoryState>) => {
  if (!isConfigured) return;

  const { error } = await supabase
    .from('inventory_config')
    .upsert({
      id: 'main_config',
      config: config,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Error syncing config to Supabase:', error);
  }
};

export const fetchConfigFromCloud = async (): Promise<Partial<InventoryState> | null> => {
  if (!isConfigured) return null;

  const { data, error } = await supabase
    .from('inventory_config')
    .select('config')
    .eq('id', 'main_config')
    .single();

  if (error) {
    console.error('Error fetching config from Supabase:', error);
    return null;
  }

  return data.config as Partial<InventoryState>;
};
