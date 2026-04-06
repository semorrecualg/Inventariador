import localforage from 'localforage';
import { Asset, InventoryState, DatabaseStatus, DatabaseMode } from '../types';
import { syncAssetsToCloud, syncConfigToCloud } from './supabaseService';
import { encryption } from './securityService';

// Chaves base para o armazenamento
const BASE_ASSETS_KEY = 'inventory_assets_v24';
const BASE_CONFIG_KEY = 'inventory_config_v24';

/**
 * Retorna as chaves de armazenamento específicas para o modo de banco de dados
 */
const getInventoryKeys = (mode: DatabaseMode) => {
  const suffix = mode.startsWith('SUPABASE') ? '_supabase' : '_internal';
  return {
    assets: `${BASE_ASSETS_KEY}${suffix}_secure`,
    config: `${BASE_CONFIG_KEY}${suffix}_secure`
  };
};

// Configure localforage
localforage.config({
  name: 'GBR_Inventory_App',
  storeName: 'inventory_store'
});

/**
 * Gera um backup do inventário atual em formato JSON e inicia o download
 */
export const backupInventory = async (mode: DatabaseMode, customName?: string): Promise<boolean> => {
  try {
    const keys = getInventoryKeys(mode);
    const encryptedAssets = await localforage.getItem<Uint8Array | string>(keys.assets);
    const encryptedConfig = await localforage.getItem<Uint8Array | string>(keys.config);

    if (!encryptedAssets && !encryptedConfig) return false;

    let assets: Asset[] = [];
    let config: Record<string, unknown> = {};

    try {
      assets = encryptedAssets ? await encryption.decrypt(encryptedAssets) as Asset[] : [];
      config = encryptedConfig ? await encryption.decrypt(encryptedConfig) as Record<string, unknown> : {};
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
        console.error('Não é possível gerar backup: Dados locais corrompidos ou chave inválida.');
        return false;
      }
      throw error;
    }

    const backupData = {
      version: 'v24.50',
      mode: mode,
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
export const restoreInventory = async (file: File, mode: DatabaseMode): Promise<InventoryState | null> => {
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
          status: DatabaseStatus.LOADED,
          databaseMode: mode
        };

        // Salva no localforage usando as chaves do modo atual
        const keys = getInventoryKeys(mode);
        const [encryptedConfig, encryptedAssets] = await Promise.all([
          encryption.encrypt(data.config || {}),
          encryption.encrypt(data.assets)
        ]);

        await localforage.setItem(keys.config, encryptedConfig);
        await localforage.setItem(keys.assets, encryptedAssets);

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
    const mode = data.databaseMode || DatabaseMode.INTERNAL;
    const keys = getInventoryKeys(mode);
    
    console.log(`>>> [Persistence] Iniciando salvamento do inventário (Modo: ${mode})...`);
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

    console.log(`>>> [Persistence] Gravando no IndexedDB (Chaves: ${keys.assets})...`);
    await Promise.all([
      localforage.setItem(keys.config, encryptedConfig),
      localforage.setItem(keys.assets, encryptedAssets)
    ]);
    console.log('>>> [Persistence] Gravado com sucesso no IndexedDB.');

    // 2. Tenta sincronizar com a nuvem (Supabase) - Apenas se estiver em modo SUPABASE
    if (mode.startsWith('SUPABASE')) {
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
    }

  } catch (error) {
    console.error('>>> [Persistence] Erro ao salvar inventário no IndexedDB:', error);
    throw error;
  }
};

export const loadInventory = async (mode: DatabaseMode): Promise<InventoryState | null> => {
  try {
    const keys = getInventoryKeys(mode);
    const [encryptedAssets, encryptedConfig] = await Promise.all([
      localforage.getItem<Uint8Array | string>(keys.assets),
      localforage.getItem<Uint8Array | string>(keys.config)
    ]);

    if (!encryptedConfig && !encryptedAssets) return null;

    // Decriptografamos os dados carregados
    try {
      const [assets, config] = await Promise.all([
        encryptedAssets ? encryption.decrypt(encryptedAssets) : Promise.resolve([]),
        encryptedConfig ? encryption.decrypt(encryptedConfig) : Promise.resolve({})
      ]);

      return {
        ...(config || {}),
        assets: assets || [],
        databaseMode: mode // Garante que o modo carregado é o correto
      } as InventoryState;
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
        console.warn('>>> [Persistence] Falha crítica de decriptografia. Limpando cache local corrompido...');
        // Limpa os dados locais que não podem ser lidos para evitar erros persistentes
        await Promise.all([
          localforage.removeItem(keys.assets),
          localforage.removeItem(keys.config)
        ]);
        return null;
      }
      throw error;
    }
  } catch (error) {
    console.error('Error loading inventory from IndexedDB:', error);
    return null;
  }
};

export const clearMultipleInventories = async (companiesToClear: string[], mode: DatabaseMode): Promise<void> => {
  try {
    if (companiesToClear.length === 0) return;
    
    const keys = getInventoryKeys(mode);
    const encryptedAssets = await localforage.getItem<Uint8Array | string>(keys.assets);
    if (!encryptedAssets) return;

    let assets: Asset[] = [];
    try {
      assets = await encryption.decrypt(encryptedAssets) as Asset[] || [];
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
        console.warn('Falha ao decriptografar para limpeza múltipla. Limpando tudo...');
        await localforage.removeItem(keys.assets);
        return;
      }
      throw error;
    }
    const normalizedCompanies = companiesToClear.map(c => c.toUpperCase().trim());
    
    const remainingAssets = assets.filter(a => 
      !normalizedCompanies.includes((a.UNIDADE_OPERACIONAL || a._unitid || '').toUpperCase().trim())
    );
    
    const encryptedRemaining = await encryption.encrypt(remainingAssets);
    await localforage.setItem(keys.assets, encryptedRemaining);
  } catch (error) {
    console.error('Error clearing multiple inventories from IndexedDB:', error);
    throw error;
  }
};

export const clearInventory = async (mode: DatabaseMode, companyToClear?: string): Promise<void> => {
  try {
    const keys = getInventoryKeys(mode);
    if (companyToClear) {
      const encryptedAssets = await localforage.getItem<Uint8Array | string>(keys.assets);
      if (!encryptedAssets) return;

      let assets: Asset[] = [];
      try {
        assets = await encryption.decrypt(encryptedAssets) as Asset[] || [];
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
          console.warn('Falha ao decriptografar para limpeza parcial. Limpando tudo...');
          await localforage.removeItem(keys.assets);
          return;
        }
        throw error;
      }
      const normalizedCompany = companyToClear.toUpperCase().trim();
      const remainingAssets = assets.filter(a => (a.UNIDADE_OPERACIONAL || a._unitid || '').toUpperCase().trim() !== normalizedCompany);
      
      const encryptedRemaining = await encryption.encrypt(remainingAssets);
      await localforage.setItem(keys.assets, encryptedRemaining);
    } else {
      await Promise.all([
        localforage.removeItem(keys.assets),
        localforage.removeItem(keys.config)
      ]);
    }
  } catch (error) {
    console.error('Error clearing inventory from IndexedDB:', error);
    throw error;
  }
};
