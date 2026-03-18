import localforage from 'localforage';
import { Asset, InventoryState } from '../types';
import { syncAssetsToCloud, syncConfigToCloud } from './supabaseService';

const INVENTORY_ASSETS_KEY = 'inventory_assets_v24';
const INVENTORY_CONFIG_KEY = 'inventory_config_v24';

// Configure localforage
localforage.config({
  name: 'GBR_Inventory_App',
  storeName: 'inventory_store'
});

export const saveInventory = async (data: InventoryState, dirtyAssets?: Asset[]): Promise<void> => {
  try {
    // 1. Salva localmente primeiro (Offline-First)
    // Separamos assets de config para evitar re-escrever milhares de itens se apenas uma config mudou
    const config = { ...data } as Record<string, unknown>;
    const assets = data.assets;
    delete config.assets;

    // Salvamos a config imediatamente (é pequena)
    await localforage.setItem(INVENTORY_CONFIG_KEY, config);

    // Salvamos os assets (pode ser grande, mas o App.tsx já faz debounce)
    await localforage.setItem(INVENTORY_ASSETS_KEY, assets);

    // 2. Tenta sincronizar com a nuvem (Supabase)
    const assetsToSync = dirtyAssets || [];
    
    if (assetsToSync.length > 0) {
      syncAssetsToCloud(assetsToSync).catch(err => console.warn('Cloud sync failed (offline?):', err));
    }
    
    syncConfigToCloud(config as unknown as Omit<InventoryState, 'assets'>).catch(err => console.warn('Config sync failed (offline?):', err));

  } catch (error) {
    console.error('Error saving inventory to IndexedDB:', error);
    throw error;
  }
};

export const loadInventory = async (): Promise<InventoryState | null> => {
  try {
    const [assets, config] = await Promise.all([
      localforage.getItem<Asset[]>(INVENTORY_ASSETS_KEY),
      localforage.getItem<Omit<InventoryState, 'assets'>>(INVENTORY_CONFIG_KEY)
    ]);

    if (!config && !assets) return null;

    return {
      ...(config || {}),
      assets: assets || []
    } as InventoryState;
  } catch (error) {
    console.error('Error loading inventory from IndexedDB:', error);
    return null;
  }
};

export const clearInventory = async (): Promise<void> => {
  try {
    await Promise.all([
      localforage.removeItem(INVENTORY_ASSETS_KEY),
      localforage.removeItem(INVENTORY_CONFIG_KEY)
    ]);
  } catch (error) {
    console.error('Error clearing inventory from IndexedDB:', error);
    throw error;
  }
};
