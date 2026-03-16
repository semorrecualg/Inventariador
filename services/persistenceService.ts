import localforage from 'localforage';
import { InventoryState } from '../types';
import { syncAssetsToCloud, syncConfigToCloud } from './supabaseService';

const INVENTORY_STORE_KEY = 'inventory_data_v24';

// Configure localforage
localforage.config({
  name: 'GBR_Inventory_App',
  storeName: 'inventory_store'
});

export const saveInventory = async (data: InventoryState, dirtyAssets?: Asset[]): Promise<void> => {
  try {
    // 1. Salva localmente primeiro (Offline-First)
    await localforage.setItem(INVENTORY_STORE_KEY, data);

    // 2. Tenta sincronizar com a nuvem (Supabase)
    // Se dirtyAssets for fornecido, sincronizamos apenas eles. 
    // Caso contrário, sincronizamos tudo (apenas em casos excepcionais)
    const assetsToSync = dirtyAssets || data.assets;
    
    if (assetsToSync.length > 0) {
      // Sincroniza ativos de forma assíncrona
      syncAssetsToCloud(assetsToSync).catch(err => console.warn('Cloud sync failed (offline?):', err));
    }
    
    // Sincroniza configurações (apenas o que não é assets)
    const config = { ...data } as Record<string, unknown>;
    delete config.assets;
    syncConfigToCloud(config as unknown as Omit<InventoryState, 'assets'>).catch(err => console.warn('Config sync failed (offline?):', err));

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
