import localforage from 'localforage';
import { Asset, InventoryState, DatabaseStatus, DatabaseMode } from '../types';
import { syncAssetsToCloud, syncConfigToCloud } from './supabaseService';
import { encryption } from './securityService';
import { localDb } from './localDbService';
import { generateChecksum } from './utils';

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
    
    const suffix = mode === DatabaseMode.INTERNAL ? '.Mobile' : '.Cloud';
    const fileName = customName || `GBR_BACKUP_${new Date().getTime()}${suffix}`;
    link.download = `${fileName}.db`; // Usando .db como extensão padrão com o sufixo solicitado
    
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

/**
 * Salva um único ativo de forma incremental no Dexie (SQLite-like)
 * Isso evita o congelamento da UI ao processar milhares de itens.
 */
/**
 * Salva apenas as configurações (metadata) para evitar processamento pesado de ativos.
 */
export const saveConfigOnly = async (data: Omit<InventoryState, 'assets'>): Promise<void> => {
  try {
    const mode = data.databaseMode || DatabaseMode.INTERNAL;
    const keys = getInventoryKeys(mode);
    const encryptedConfig = await encryption.encrypt(data);
    await localforage.setItem(keys.config, encryptedConfig);
    console.log('>>> [Persistence] Configurações salvas (Fast Path).');
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
  }
};

export const saveAssetIncremental = async (asset: Asset): Promise<void> => {
  try {
    await localDb.assets.put(asset);
    console.log(`>>> [Persistence] Ativo ${asset.ETIQUETA} salvo incrementalmente.`);
  } catch (error) {
    console.error('Erro no salvamento incremental:', error);
  }
};

export const saveInventory = async (data: InventoryState, dirtyAssets?: Asset[], forceCloudSync = false): Promise<void> => {
  try {
    const mode = data.databaseMode || DatabaseMode.INTERNAL;
    const keys = getInventoryKeys(mode);
    
    console.log(`>>> [Persistence] Iniciando salvamento do inventário (Modo: ${mode})...`);
    // 1. Salva localmente primeiro (Offline-First) com Blindagem Técnica (Criptografia)
    const config = { ...data } as Record<string, unknown>;
    const assets = data.assets;
    
    // Remove campos de estado da UI e assets para o hash da config
    delete config.assets;
    delete config._integrity_failed;
    delete config._integrity_hash;

    // 1.1 Cálculo de Checksum (Integridade de Dados - Auditoria)
    console.log('>>> [Persistence] Gerando Checksum de integridade...');
    // Focamos o checksum apenas nos ativos para evitar falhas por mudanças em metadados voláteis
    const integrityHash = await generateChecksum(assets);
    config._integrity_hash = integrityHash;

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

    // Mirroring in Dexie for extra robustness (SQL-like storage)
    try {
      if (mode === DatabaseMode.INTERNAL) {
        // SEGURANÇA: Não usamos clear() para evitar "Update Gaps" se o app fechar durante o processo
        // Usamos bulkPut (Upsert) que é atômico via executeBatch no SQL.js
        await localDb.assets.bulkPut(assets);
        
        // Atualiza o status interno do banco físico para ACTIVE se houver ativos
        if (assets.length > 0) {
          const { sqliteService } = await import('./sqliteService');
          await sqliteService.setSystemStatus('ACTIVE');
        }
        
        console.log('>>> [Persistence] Espelhamento Dexie (Delta/Full) concluído.');
      }
    } catch (dexieErr) {
      console.warn('>>> [Persistence] Falha no espelhamento Dexie:', dexieErr);
    }

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
    
    // PRIORIDADE 1: Em modo INTERNO, o SQL (localDb) é a fonte da verdade para Ativos
    // Isso evita usar dados obsoletos do IndexedDB se o salvamento foi via incremental
    let sqlAssets: Asset[] = [];
    if (mode === DatabaseMode.INTERNAL) {
      try {
        sqlAssets = await localDb.assets.toArray();
        console.log(`>>> [Persistence] ${sqlAssets.length} ativos carregados do SQL (Primary).`);
      } catch (sqlErr) {
        console.warn('>>> [Persistence] Falha ao ler do SQL no init:', sqlErr);
      }
    }

    const [encryptedAssets, encryptedConfig] = await Promise.all([
      localforage.getItem<Uint8Array | string>(keys.assets),
      localforage.getItem<Uint8Array | string>(keys.config)
    ]);

    if (!encryptedConfig && !encryptedAssets && sqlAssets.length === 0) {
      return null;
    }

    // Decriptografamos as configurações
    let config: Record<string, unknown> = {};
    if (encryptedConfig) {
      try {
        config = await encryption.decrypt(encryptedConfig) as Record<string, unknown>;
      } catch (err) {
        console.warn('>>> [Persistence] Falha ao decriptografar config:', err);
      }
    }

    // Decriptografamos ativos apenas se não viermos do SQL ou se o SQL estiver vazio
    let finalAssets = sqlAssets;
    if (finalAssets.length === 0 && encryptedAssets) {
      try {
        finalAssets = await encryption.decrypt(encryptedAssets) as Asset[] || [];
        console.log(`>>> [Persistence] ${finalAssets.length} ativos carregados do IndexedDB (Fallback).`);
      } catch (err) {
        console.warn('>>> [Persistence] Falha ao decriptografar ativos do IndexedDB fallback:', err);
      }
    }

    // 1.2 Validação de Integridade (Checksum) - Apenas para base carregada do cache
    if (finalAssets.length > 0 && (config as Record<string, unknown>)._integrity_hash) {
      const storedHash = (config as Record<string, unknown>)._integrity_hash as string;
      const currentHash = await generateChecksum(finalAssets);
      if (storedHash !== currentHash) {
        console.warn('>>> [Integrity] Checksum divergente (Normal se houve alterações incrementais fora do saveFull).');
      }
    }

    return {
      ...(config as Record<string, unknown> || {}),
      assets: finalAssets,
      databaseMode: mode
    } as InventoryState;
  } catch (error) {
    console.error('Error loading inventory:', error);
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
