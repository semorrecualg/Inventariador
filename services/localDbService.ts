
import Dexie, { Table } from 'dexie';
import { Asset, UnitConfig, InventoryCampaign, AuditLogEntry } from '../types';

// Definição do Banco de Dados Local (IndexedDB)
export class LocalDatabase extends Dexie {
  assets!: Table<Asset>;
  unitConfigs!: Table<UnitConfig>;
  campaigns!: Table<InventoryCampaign>;
  auditLogs!: Table<AuditLogEntry>;

  constructor() {
    super('InventarioPatrimonialDB');
    
    // Schema do Banco de Dados
    // O primeiro campo é a chave primária. Campos com ++ são auto-incremento.
    // Campos após o primeiro são indexados para busca rápida.
    this.version(2).stores({
      assets: 'id, ETIQUETA, REGISTRO, _localMaster, _conferido, _tenantid, _unitid, _campaignId',
      unitConfigs: 'unit_id, tenant_id',
      campaigns: 'id, status, tenant_id',
      auditLogs: '++id, timestamp, user_email, action'
    });
  }
}

export const localDb = new LocalDatabase();

/**
 * Solicita ao navegador que a persistência seja durável.
 * Isso impede que o navegador apague o banco de dados em limpezas automáticas de cache.
 */
export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist();
    console.log(`>>> [DBA] Persistência Durável concedida: ${isPersisted}`);
    return isPersisted;
  }
  return false;
}

/**
 * Verifica se o armazenamento já é persistente.
 */
export async function isStoragePersisted() {
  if (navigator.storage && navigator.storage.persisted) {
    return await navigator.storage.persisted();
  }
  return false;
}
