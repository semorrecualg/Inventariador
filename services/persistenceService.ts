import localforage from 'localforage';
import { InventoryState } from '../types';
import { syncAssetsToCloud, syncConfigToCloud } from './supabaseService';

const INVENTORY_STORE_KEY = 'inventory_data_v24';

// Configure localforage
localforage.config({
  name: 'GBR_Inventory_App',
  storeName: 'inventory_store'
});

export const saveInventory = async (data: InventoryState): Promise<void> => {
  try {
    // 1. Salva localmente primeiro (Offline-First)
    await localforage.setItem(INVENTORY_STORE_KEY, data);

    // 2. Tenta sincronizar com a nuvem (Supabase)
    // Fazemos isso de forma assíncrona para não bloquear a UI
    const { assets, ...config } = data;
    
    // Sincroniza ativos
    syncAssetsToCloud(assets).catch(err => console.warn('Cloud sync failed (offline?):', err));
    
    // Sincroniza configurações
    syncConfigToCloud(config).catch(err => console.warn('Config sync failed (offline?):', err));

  } catch (error) {
    console.error('Error saving inventory to IndexedDB:', error);
    throw error;
  }
};

export const loadInventory = async (): Promise<InventoryState | null> => {
  try {
    return await localforage.getItem<InventoryState>(INVENTORY_STORE_KEY);
  } catch (error) {
    console.error('Error loading inventory from IndexedDB:', error);
    return null;
  }
};

export const clearInventory = async (): Promise<void> => {
  try {
    await localforage.removeItem(INVENTORY_STORE_KEY);
  } catch (error) {
    console.error('Error clearing inventory from IndexedDB:', error);
    throw error;
  }
};
