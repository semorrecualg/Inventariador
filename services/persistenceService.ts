import localforage from 'localforage';
import { Asset, InventoryState, DatabaseStatus } from '../types';
import { syncAssetsToCloud, syncConfigToCloud } from './supabaseService';
import { encryption } from './securityService';

const INVENTORY_ASSETS_KEY = 'inventory_assets_v24_secure';
const INVENTORY_CONFIG_KEY = 'inventory_config_v24_secure';

// Configure localforage
localforage.config({
  name: 'GBR_Inventory_App',
  storeName: 'inventory_store'
});

/**
 * Gera um backup do inventário atual em formato JSON e inicia o download
 */
export const backupInventory = async (customName?: string): Promise<boolean> => {
  try {
    const assets = await localforage.getItem<Asset[]>(INVENTORY_ASSETS_KEY);
    const config = await localforage.getItem<Omit<InventoryState, 'assets'>>(INVENTORY_CONFIG_KEY);

    if (!assets && !config) return false;

    const backupData = {
      version: 'v24.50',
      timestamp: new Date().toISOString(),
      assets: assets || [],
      config: config || {}
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const fileName = customName || `GBR_BACKUP_${new Date().getTime()}`;
    link.download = `${fileName}.json`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('Erro ao gerar backup:', error);
    return false;
  }
};

/**
 * Restaura o inventário a partir de um arquivo JSON
 */
export const restoreInventory = async (file: File): Promise<InventoryState | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        
        if (!data.assets || !Array.isArray(data.assets)) {
          throw new Error('Formato de backup inválido');
        }

        const newState: InventoryState = {
          ...(data.config || {}),
          assets: data.assets,
          lastUpdated: new Date().toISOString(),
          status: DatabaseStatus.LOADED
        };

        // Salva no localforage
        await localforage.setItem(INVENTORY_CONFIG_KEY, data.config || {});
        await localforage.setItem(INVENTORY_ASSETS_KEY, data.assets);

        resolve(newState);
      } catch (error) {
        console.error('Erro ao restaurar backup:', error);
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
};

export const saveInventory = async (data: InventoryState, dirtyAssets?: Asset[], forceCloudSync = false): Promise<void> => {
  try {
    console.log('>>> [Persistence] Iniciando salvamento do inventário...');
    // 1. Salva localmente primeiro (Offline-First) com Blindagem Técnica (Criptografia)
    const config = { ...data } as Record<string, unknown>;
    const assets = data.assets;
    delete config.assets;

    console.log(`>>> [Persistence] Criptografando ${assets.length} ativos e configurações...`);
    // Criptografamos os dados antes de salvar no IndexedDB
    const [encryptedConfig, encryptedAssets] = await Promise.all([
      encryption.encrypt(config),
      encryption.encrypt(assets)
    ]);

    console.log('>>> [Persistence] Gravando no IndexedDB...');
    await Promise.all([
      localforage.setItem(INVENTORY_CONFIG_KEY, encryptedConfig),
      localforage.setItem(INVENTORY_ASSETS_KEY, encryptedAssets)
    ]);
    console.log('>>> [Persistence] Gravado com sucesso no IndexedDB.');

    // 2. Tenta sincronizar com a nuvem (Supabase) - Apenas se houver ativos sujos ou forçado
    const assetsToSync = dirtyAssets || [];
    
    if (assetsToSync.length > 0) {
      console.log(`>>> [Persistence] Sincronizando ${assetsToSync.length} ativos sujos com a nuvem...`);
      syncAssetsToCloud(assetsToSync).catch(err => console.warn('Cloud sync failed (offline?):', err));
      // Se sincronizou ativos, sincroniza a config também para atualizar o lastUpdated na nuvem
      syncConfigToCloud(config as unknown as Omit<InventoryState, 'assets'>).catch(err => console.warn('Config sync failed (offline?):', err));
    } else if (forceCloudSync) {
      console.log('>>> [Persistence] Sincronizando configurações com a nuvem (forced)...');
      syncConfigToCloud(config as unknown as Omit<InventoryState, 'assets'>).catch(err => console.warn('Config sync failed (offline?):', err));
    }

  } catch (error) {
    console.error('>>> [Persistence] Erro ao salvar inventário no IndexedDB:', error);
    throw error;
  }
};

export const loadInventory = async (): Promise<InventoryState | null> => {
  try {
    const [encryptedAssets, encryptedConfig] = await Promise.all([
      localforage.getItem<Uint8Array | string>(INVENTORY_ASSETS_KEY),
      localforage.getItem<Uint8Array | string>(INVENTORY_CONFIG_KEY)
    ]);

    if (!encryptedConfig && !encryptedAssets) return null;

    // Decriptografamos os dados carregados
    const [assets, config] = await Promise.all([
      encryptedAssets ? encryption.decrypt(encryptedAssets) : Promise.resolve([]),
      encryptedConfig ? encryption.decrypt(encryptedConfig) : Promise.resolve({})
    ]);

    return {
      ...(config || {}),
      assets: assets || []
    } as InventoryState;
  } catch (error) {
    console.error('Error loading inventory from IndexedDB:', error);
    return null;
  }
};

export const clearMultipleInventories = async (companiesToClear: string[]): Promise<void> => {
  try {
    if (companiesToClear.length === 0) return;
    
    const encryptedAssets = await localforage.getItem<Uint8Array | string>(INVENTORY_ASSETS_KEY);
    if (!encryptedAssets) return;

    const assets = await encryption.decrypt(encryptedAssets) as Asset[] || [];
    const normalizedCompanies = companiesToClear.map(c => c.toUpperCase().trim());
    
    const remainingAssets = assets.filter(a => 
      !normalizedCompanies.includes((a.EMPRESA || '').toUpperCase().trim())
    );
    
    const encryptedRemaining = await encryption.encrypt(remainingAssets);
    await localforage.setItem(INVENTORY_ASSETS_KEY, encryptedRemaining);
  } catch (error) {
    console.error('Error clearing multiple inventories from IndexedDB:', error);
    throw error;
  }
};

export const clearInventory = async (companyToClear?: string): Promise<void> => {
  try {
    if (companyToClear) {
      const encryptedAssets = await localforage.getItem<Uint8Array | string>(INVENTORY_ASSETS_KEY);
      if (!encryptedAssets) return;

      const assets = await encryption.decrypt(encryptedAssets) as Asset[] || [];
      const normalizedCompany = companyToClear.toUpperCase().trim();
      const remainingAssets = assets.filter(a => (a.EMPRESA || '').toUpperCase().trim() !== normalizedCompany);
      
      const encryptedRemaining = await encryption.encrypt(remainingAssets);
      await localforage.setItem(INVENTORY_ASSETS_KEY, encryptedRemaining);
    } else {
      await Promise.all([
        localforage.removeItem(INVENTORY_ASSETS_KEY),
        localforage.removeItem(INVENTORY_CONFIG_KEY)
      ]);
    }
  } catch (error) {
    console.error('Error clearing inventory from IndexedDB:', error);
    throw error;
  }
};
