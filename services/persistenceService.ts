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

export const saveInventory = async (data: InventoryState, dirtyAssets?: Asset[]): Promise<void> => {
  try {
    // 1. Salva localmente primeiro (Offline-First) com Blindagem Técnica (Criptografia)
    const config = { ...data } as Record<string, unknown>;
    const assets = data.assets;
    delete config.assets;

    // Criptografamos os dados antes de salvar no IndexedDB
    const [encryptedConfig, encryptedAssets] = await Promise.all([
      encryption.encrypt(config),
      encryption.encrypt(assets)
    ]);

    await localforage.setItem(INVENTORY_CONFIG_KEY, encryptedConfig);
    await localforage.setItem(INVENTORY_ASSETS_KEY, encryptedAssets);

    // 2. Tenta sincronizar com a nuvem (Supabase) - Os dados na nuvem já são protegidos por TLS e RLS
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
    const [encryptedAssets, encryptedConfig] = await Promise.all([
      localforage.getItem<string>(INVENTORY_ASSETS_KEY),
      localforage.getItem<string>(INVENTORY_CONFIG_KEY)
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
    
    const assets = await localforage.getItem<Asset[]>(INVENTORY_ASSETS_KEY) || [];
    const normalizedCompanies = companiesToClear.map(c => c.toUpperCase().trim());
    
    const remainingAssets = assets.filter(a => 
      !normalizedCompanies.includes((a.EMPRESA || '').toUpperCase().trim())
    );
    
    await localforage.setItem(INVENTORY_ASSETS_KEY, remainingAssets);
  } catch (error) {
    console.error('Error clearing multiple inventories from IndexedDB:', error);
    throw error;
  }
};

export const clearInventory = async (companyToClear?: string): Promise<void> => {
  try {
    if (companyToClear) {
      const assets = await localforage.getItem<Asset[]>(INVENTORY_ASSETS_KEY) || [];
      const normalizedCompany = companyToClear.toUpperCase().trim();
      const remainingAssets = assets.filter(a => (a.EMPRESA || '').toUpperCase().trim() !== normalizedCompany);
      
      await localforage.setItem(INVENTORY_ASSETS_KEY, remainingAssets);
      
      // Se não sobrar nenhum ativo, podemos limpar as configs também ou manter?
      // Geralmente mantemos as configs globais.
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
