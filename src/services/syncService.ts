import localforage from 'localforage';
import { SyncQueueItem } from '../types';
import { uploadAssetPhoto, updateAssetPhotoUrl, isQuotaExceededError, supabase, registerCampaignSyncQueueDelegate } from './supabaseService';
import { deleteLocalPhoto } from './photoService';
import { sqliteService } from './sqliteService';

export interface UserSessionData {
  id: string;
  email: string;
  tenantId: string;
  role: string;
}

export interface SyncResult {
  success: boolean;
  processedCount: number;
  error?: string;
}

const PHOTO_QUEUE_STORE = 'gbr_photo_sync_queue';
const CAMPAIGN_QUEUE_STORE = 'gbr_campaign_sync_queue';

// Configura o store local
const queueStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: PHOTO_QUEUE_STORE
});

const campaignQueueStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: CAMPAIGN_QUEUE_STORE
});

const photoQueueStore = queueStore;

const isStringInvalid = (val: unknown): boolean => {
  if (val === null || val === undefined) return true;
  const s = String(val).trim().toUpperCase();
  return s === '' || s === 'UNDEFINED' || s === 'NULL' || s === 'NULO';
};

const getUserFromLocalStorage = (): UserSessionData | null => {
  try {
    const data = localStorage.getItem('gbr_user_session') || sessionStorage.getItem('app_current_user');
    if (!data) return null;
    const parsed = JSON.parse(data);
    return {
      id: parsed.id || parsed.username || '',
      email: parsed.email || '',
      tenantId: parsed.tenantId || parsed._tenantid || parsed.tenantid || '',
      role: parsed.role || ''
    };
  } catch (e) {
    console.error(">>> [Sync Guard] Erro crítico ao decodificar sessão:", e);
    return null;
  }
};

const executeRawQuerySafe = async (sql: string, params: (string | number | boolean | null)[] = []) => {
  try {
    // Retorna uma estrutura compatível com .values exigido no código do usuário
    const values = await sqliteService.query(sql, params);
    return { values };
  } catch (err) {
    console.error(">>> [Sync SQL Fallback] Erro ao executar query interna:", err);
    return { values: [] };
  }
};

export interface CampaignSyncItem {
  id: string;
  campaignId: string;
  action: 'DELETE' | 'UPDATE_STATUS';
  status?: unknown;
  closedBy?: string;
  timestamp: number;
}

export const addCampaignToSyncQueue = async (
  campaignId: string, 
  action: 'DELETE' | 'UPDATE_STATUS', 
  status?: unknown, 
  closedBy?: string
): Promise<string> => {
  const id = crypto.randomUUID();
  const item: CampaignSyncItem = {
    id,
    campaignId,
    action,
    status,
    closedBy,
    timestamp: Date.now()
  };
  await campaignQueueStore.setItem(id, item);
  console.log(`>>> [Sync Campaign] Campanha ${campaignId} empilhada na fila delta (${action}).`);
  
  if (navigator.onLine) {
    processCampaignSyncQueue().catch(console.error);
  }
  return id;
};

// Registra de forma limpa na carga do modulo de sincronização
registerCampaignSyncQueueDelegate(addCampaignToSyncQueue);

export const getPendingCampaignSyncItems = async (): Promise<CampaignSyncItem[]> => {
  const items: CampaignSyncItem[] = [];
  await campaignQueueStore.iterate((value: CampaignSyncItem) => {
    items.push(value);
  });
  return items.sort((a, b) => a.timestamp - b.timestamp);
};

export const processCampaignSyncQueue = async (): Promise<{ success: boolean; processedCount: number }> => {
  const user = getUserFromLocalStorage();
  const rawTenant = user ? user.tenantId : null;
  const rawFilial = sessionStorage.getItem('filial');

  if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
    if (user && (isStringInvalid(rawTenant) || isStringInvalid(rawFilial))) {
      console.warn(">>> [Sync Fail-Safe] Identificador de Contrato ou Filial inválido na fila de campanhas. Interrompendo...");
      sessionStorage.clear();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gbr_session_expired', {
          detail: { message: "Identificador de Contrato ou Filial ausente ou inválido no lote. Por favor, reautentique." }
        }));
      }
    }
    return { success: false, processedCount: 0 };
  }
  const currentMode = localStorage.getItem('app_database_mode');
  if (currentMode?.startsWith('INTERNAL')) {
    return { success: false, processedCount: 0 };
  }
  if (!navigator.onLine) return { success: false, processedCount: 0 };

  try {
    const items = await getPendingCampaignSyncItems();
    if (items.length === 0) return { success: true, processedCount: 0 };

    console.log(`>>> [Sync Campaign] Processando ${items.length} campanhas pendentes...`);
    let processedCount = 0;

    for (const item of items) {
      try {
        if (!supabase) continue;
        
        if (item.action === 'DELETE') {
          const { error } = await supabase.from('campaigns').delete().eq('id', item.campaignId);
          if (error) throw error;
        } else if (item.action === 'UPDATE_STATUS') {
          const updateData: Record<string, unknown> = { 
            status: item.status, 
            end_date: item.status === 'CLOSED' ? new Date().toISOString() : undefined 
          };
          if (item.status === 'CLOSED' && item.closedBy) {
            updateData.closure_details = {
              closed_by: item.closedBy,
              closed_at: new Date().toISOString(),
              snapshot_status: 'PENDING'
            };
          }
          const { error } = await supabase
            .from('campaigns')
            .update(updateData)
            .eq('id', item.campaignId);
          if (error) throw error;
        }
        
        await campaignQueueStore.removeItem(item.id);
        processedCount++;
        console.log(`>>> [Sync Campaign Success] Campanha ${item.campaignId} sincronizada com nuvem.`);
      } catch (err) {
        console.error(`>>> [Sync Campaign Fail] Erro ao sincronizar campanha ${item.campaignId}:`, err);
        if (!navigator.onLine) break;
      }
    }

    return { success: true, processedCount };
  } catch (err) {
    console.error(">>> [Sync Campaign Fatal] Falha ao varrer fila de campanhas:", err);
    return { success: false, processedCount: 0 };
  }
};

export const photoSyncManager = {
  processPhotoSyncQueue: async (): Promise<{ success: boolean; uploadCount: number }> => {
    const user = getUserFromLocalStorage();
    const rawTenant = user ? user.tenantId : null;
    const rawFilial = sessionStorage.getItem('filial');

    if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
      if (user && (isStringInvalid(rawTenant) || isStringInvalid(rawFilial))) {
        console.warn(">>> [Sync Fail-Safe] Identificador de Contrato ou Filial inválido na fila de fotos. Interrompendo...");
        sessionStorage.clear();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gbr_session_expired', {
            detail: { message: "Identificador de Contrato ou Filial ausente ou inválido no lote. Por favor, reautentique." }
          }));
        }
      }
      return { success: false, uploadCount: 0 };
    }
    if (sqliteService.isImportingBatch) {
      console.log('[Sync Photo] Sincronização suspensa: Importação em lote ativa.');
      return { success: false, uploadCount: 0 };
    }
    if (!navigator.onLine) return { success: false, uploadCount: 0 };

    const currentMode = localStorage.getItem('app_database_mode');
    if (currentMode?.startsWith('INTERNAL')) {
      console.log('[Sync Photo] Sincronização suspensa: Modo OFFLINE/INTERNO ativo.');
      return { success: false, uploadCount: 0 };
    }

    let uploadCount = 0;
    try {
      const keys = await photoQueueStore.keys();
      
      for (const key of keys) {
        const item = await photoQueueStore.getItem<SyncQueueItem>(key);
        if (!item) continue;

        if (item.attempts >= 3) {
          console.warn(`>>> [Sync Photo] Item ${item.id} atingiu o limite de tentativas e foi retido.`);
          continue;
        }

        item.attempts += 1;
        item.lastAttempt = Date.now();

        try {
          const fileExt = 'jpg';
          const tenantIdClean = String(rawTenant).trim();
          const filePath = `${tenantIdClean}/${item.assetId}/${item.id}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('asset-photos')
            .upload(filePath, item.photoBlob, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('asset-photos')
            .getPublicUrl(filePath);

          const updateAssetQuery = `
            UPDATE ativos 
            SET foto_url = ?, _is_synced = 0 
            WHERE id = ?
          `;
          await sqliteService.execute(updateAssetQuery, [publicUrl, item.assetId]);

          await photoQueueStore.removeItem(key);
          uploadCount++;
          
          console.log(`>>> [Sync Photo Success] Imagem do ativo ${item.assetId} enviada e limpa localmente.`);
        } catch (uploadFail) {
          const uploadFailMsg = uploadFail instanceof Error ? uploadFail.message : String(uploadFail);
          item.error = uploadFailMsg || "Erro desconhecido no Storage";
          await photoQueueStore.setItem(key, item);
          console.error(`>>> [Sync Photo Fail] Tentativa ${item.attempts} falhou para o item ${item.id}:`, uploadFail);
          
          if (isQuotaExceededError(uploadFail)) {
            const errorMsg = 'LIMITE DE ARMAZENAMENTO ATINGIDO (Supabase Quota). Sincronização de fotos suspensa para evitar perda de dados. Contate o administrador.';
            console.error(`[Sync Photo] ${errorMsg}`);
            window.dispatchEvent(new CustomEvent('gbr_sync_quota_error', { 
              detail: { message: errorMsg } 
            }));
            break;
          }
        }
      }
      
      return { success: true, uploadCount };
    } catch (globalError) {
      console.error(">>> [Sync Photo Fatal] Falha crítica ao processar fila de imagens:", globalError);
      return { success: false, uploadCount };
    }
  }
};

export const syncService = {
  isStringInvalid,

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  processDataSyncQueue: async (_tenantIdParam?: string | string[]): Promise<SyncResult> => {
    const user = getUserFromLocalStorage();
    const rawTenant = user ? user.tenantId : null;
    const rawFilial = sessionStorage.getItem('filial');

    if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
      if (user && (isStringInvalid(rawTenant) || isStringInvalid(rawFilial))) {
        console.warn(">>> [Sync Fail-Safe] Identificador de Contrato (tenantId) ou Filial inválido na fila. Interrompendo...");
        sessionStorage.clear();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gbr_session_expired', {
            detail: { message: "Identificador de Contrato ou Filial ausente ou inválido no lote. Por favor, reautentique." }
          }));
        }
      }
      return { success: false, processedCount: 0, error: "Sincronização abortada: Usuário ou filial indisponíveis ou inválidos." };
    }

    if (sqliteService.isImportingBatch) {
      console.warn(">>> [Sync Fail-Safe] Bloqueio imperativo: Operação suspensa por atividade na Carga Expert.");
      return { success: false, processedCount: 0, error: "Sincronização suspensa: Importação em lote ativa." };
    }

    if (!navigator.onLine) {
      return { success: false, processedCount: 0, error: "Dispositivo em modo Offline" };
    }

    const tenantIdClean = String(rawTenant).trim();
    const filialClean = String(rawFilial).trim();

    try {
      // Cláusula WHERE atualizada com o padrão rígido unificado da planilha de carga
      const pendingRecords = await executeRawQuerySafe(
        "SELECT * FROM assets_counting WHERE sync_status = 'PENDING' AND tenantId = ? AND filial = ?;",
        [tenantIdClean, filialClean]
      );

      const records = pendingRecords?.values || [];
      if (records.length === 0) {
        return { success: true, processedCount: 0 };
      }

      let successCount = 0;
      for (const record of records) {
        if (isStringInvalid(record.asset_code) || isStringInvalid(record.filial)) {
          console.warn(`>>> [Sync Audit] Registro corrompido detectado no SQLite local (ID: ${record.id}). Ignorando gravação em nuvem.`);
          continue;
        }

        const { error: supabaseErr } = await supabase
          .from('assets_analytics')
          .upsert({
            id: record.id,
            tenant_id: tenantIdClean,
            filial_name: filialClean,
            asset_code: record.asset_code,
            counter_value: record.counter_value,
            measured_at: record.measured_at,
            gps_lat: record.gps_lat,
            gps_lng: record.gps_lng,
            auditor_email: user.email,
            updated_at: new Date().toISOString()
          });

        if (!supabaseErr) {
          await sqliteService.executeRawQuery(
            "UPDATE assets_counting SET sync_status = 'SYNCED' WHERE id = ?;",
            [record.id]
          );
          successCount++;
        } else {
          console.error(`>>> [Sync Network Error] Falha de persistência no Supabase para o registro ${record.id}:`, supabaseErr);
        }
      }

      return { success: true, processedCount: successCount };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(">>> [Sync Service Engine] Falha catastrófica no processamento da fila de dados:", msg);
      return { success: false, processedCount: 0, error: msg };
    }
  },

  backupContingencyLocal: async (): Promise<boolean> => {
    const user = getUserFromLocalStorage();
    const rawTenant = user ? user.tenantId : null;
    const rawFilial = sessionStorage.getItem('filial');

    if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
      return false;
    }

    const tenantIdClean = String(rawTenant).trim();
    const filialClean = String(rawFilial).trim();

    try {
      const activeData = await executeRawQuerySafe(
        "SELECT * FROM assets_counting WHERE tenantId = ? AND filial = ?;",
        [tenantIdClean, filialClean]
      );
      
      const values = activeData?.values || [];
      // Chave de backup do localStorage corrigida para o padrão de contingência oficial
      const backupKey = `gbr_backup_${tenantIdClean}_${filialClean}`;
      localStorage.setItem(backupKey, JSON.stringify(values));
      return true;
    } catch (e) {
      console.error(">>> [Contingency Guard] Erro ao consolidar rascunho físico em localStorage:", e);
      return false;
    }
  }
};

/**
 * Processa a sincronização de dados (registros de ativos) entre SQLite e Supabase
 */
export const processDataSyncQueue = async (): Promise<SyncResult> => {
  return await syncService.processDataSyncQueue();
};

/**
 * Retorna o número de ativos aguardando sincronização com a nuvem
 */
export const getUnsyncedAssetsCount = async (): Promise<number> => {
   try {
     const result = await sqliteService.query("SELECT COUNT(*) as total FROM ativos WHERE _is_synced = 0 AND _is_deleted = 0");
     return Number(result[0]?.total || 0);
   } catch (e) {
     console.error(e);
     return 0;
   }
};

/**
 * Adiciona uma foto à fila de sincronização offline
 */
export const addToSyncQueue = async (assetId: string, photoBlob: Blob, tenantId: string): Promise<string> => {
  const id = crypto.randomUUID();
  const item: SyncQueueItem = {
    id,
    assetId,
    tenantId,
    photoBlob,
    timestamp: Date.now(),
    attempts: 0
  };

  await photoQueueStore.setItem(id, item);
  
  if (navigator.onLine) {
    processSyncQueue().catch(console.error);
  }

  return id;
};

/**
 * Retorna todos os itens pendentes na fila
 */
export const getPendingSyncItems = async (): Promise<SyncQueueItem[]> => {
  const items: SyncQueueItem[] = [];
  await photoQueueStore.iterate((value: SyncQueueItem) => {
    items.push(value);
  });
  return items.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Processa a fila de sincronização de fotos
 */
export const processSyncQueue = async (onProgress?: (pendingCount: number) => void): Promise<void> => {
  const user = getUserFromLocalStorage();
  const rawTenant = user ? user.tenantId : null;
  const rawFilial = sessionStorage.getItem('filial');

  if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
    return;
  }
  const currentMode = localStorage.getItem('app_database_mode');
  if (currentMode?.startsWith('INTERNAL')) {
    console.log('[Sync] Sincronização suspensa: Modo OFFLINE/INTERNO ativo.');
    return;
  }

  if (!navigator.onLine) return;

  const items = await getPendingSyncItems();
  if (items.length === 0) return;

  for (const item of items) {
    try {
      const tenantIdClean = String(rawTenant).trim();
      const photoUrl = await uploadAssetPhoto(item.assetId, item.photoBlob, tenantIdClean);
      
      if (photoUrl) {
        await updateAssetPhotoUrl(item.assetId, photoUrl, tenantIdClean);
        await photoQueueStore.removeItem(item.id);
        await deleteLocalPhoto(item.assetId);
        
        console.log(`[Sync] Foto do ativo ${item.assetId} sincronizada e expurgada localmente.`);
      
        window.dispatchEvent(new CustomEvent('gbr_photo_synced', { 
          detail: { assetId: item.assetId, photoUrl } 
        }));

        if (onProgress) {
          const remaining = await photoQueueStore.length();
          onProgress(remaining);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }
};

/**
 * Retorna o número de itens pendentes na fila
 */
export const getSyncQueueLength = async (): Promise<number> => {
  return await photoQueueStore.length();
};

/**
 * Remove um item específico da fila
 */
export const removeItemFromQueue = async (id: string): Promise<void> => {
  await photoQueueStore.removeItem(id);
};

/**
 * Limpa a fila
 */
export const clearSyncQueue = async (): Promise<void> => {
  await photoQueueStore.clear();
};

/**
 * Executa de forma exposta a sincronização resiliente de fotos das filas
 */
export const processPhotoSyncQueue = async (): Promise<{ success: boolean; uploadCount: number }> => {
  return await photoSyncManager.processPhotoSyncQueue();
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processSyncQueue().catch(console.error);
    processPhotoSyncQueue().catch(console.error);
    processDataSyncQueue().catch(console.error);
    processCampaignSyncQueue().catch(console.error);
  });

  setInterval(() => {
    processDataSyncQueue().catch(console.error);
    processPhotoSyncQueue().catch(console.error);
    processCampaignSyncQueue().catch(console.error);
  }, 30000);
}

export default syncService;
