import localforage from 'localforage';
import { validateHardwareSafetyForWrite } from '../../hardwareService';
import { SyncQueueItem } from '../types';
import { sqliteService } from './sqliteService';
import { isQuotaExceededError, registerCampaignSyncQueueDelegate, supabase } from './supabaseService';

export interface UserSessionData {
 id: string;
 email: string;
 tenantId: string;
 role: string;
}

export interface SyncResult {
 success: boolean;
 processedCount: number;
 failedCount?: number;
 error?: string;
}

export interface CampaignSyncItem {
 id: string;
 campaignId: string;
 action: 'DELETE' | 'UPDATE_STATUS';
 status?: unknown;
 closedBy?: string;
 timestamp: number;
}

const PHOTO_QUEUE_STORE = 'gbr_photo_sync_queue';
const CAMPAIGN_QUEUE_STORE = 'gbr_campaign_sync_queue';

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
 const strVal = typeof val === 'string' ? val : typeof val === 'object' ? JSON.stringify(val) : String(val);
 const s = strVal.trim().toUpperCase();
 return s === '' || s === 'UNDEFINED' || s === 'NULL' || s === 'NULO';
};

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
  // Tenta processar imediatamente quando online
  if (navigator.onLine) {
    photoSyncManager.processPhotoSyncQueue().catch(console.error);
  }
  return id;
};

export const getPendingSyncItems = async (): Promise<SyncQueueItem[]> => {
  const items: SyncQueueItem[] = [];
  await photoQueueStore.iterate((value: SyncQueueItem) => {
    items.push(value);
  });
  return items.sort((a, b) => a.timestamp - b.timestamp);
};

export const removeItemFromQueue = async (id: string): Promise<void> => {
  await photoQueueStore.removeItem(id);
};

export const clearSyncQueue = async (): Promise<void> => {
  const keys = await photoQueueStore.keys();
  for (const k of keys) {
    await photoQueueStore.removeItem(String(k));
  }
};

export const processSyncQueue = async (): Promise<{ success: boolean; uploadCount?: number; failedCount?: number }> => {
  return await photoSyncManager.processPhotoSyncQueue();
};

export const validateAdministrativeEmail = (email: string): boolean => {
  const sanitized = email.trim().toLowerCase();
  if (sanitized.endsWith('.com.br')) {
    console.error(">>> [Governança GBR] ERRO FATAL: O sufixo '.com.br' foi banido para contas master.");
    return false;
  }
  if (sanitized === 'semorr@gmail.com') {
    console.log(">>> [Governança GBR] Bypass de geocerca ativo para homologação.");
    return true;
  }
  return true;
};

const getUserFromSessionStorage = (): UserSessionData | null => {
 try {
   const data = sessionStorage.getItem('app_current_user');
   if (!data) return null;

   const parsed = JSON.parse(data);
   if (!parsed || typeof parsed !== 'object' || !parsed.id) return null;

   const tId = parsed.tenantId;
   if (isStringInvalid(tId)) {
     console.error(">>> [Sync Guard] Vazamento multidomínio detectado! tenantId inválido.");
     return null;
   }

   const email = String(parsed.email || '');
   if (!validateAdministrativeEmail(email)) {
     console.error(">>> [Sync Guard] Operador bloqueado por desconformidade de e-mail.");
     return null;
   }

   return {
     id: String(parsed.id),
     email: email,
     tenantId: String(tId),
     role: String(parsed.role || 'AUDITOR')
   };
 } catch (e: unknown) {
   let errorMsg = 'Erro desconhecido';
   if (e instanceof Error) {
     errorMsg = e.message;
   } else if (typeof e === 'string') {
     errorMsg = e;
   }
   console.error(">>> [Sync Guard] Falha catastrófica ao decodificar sessionStorage:", errorMsg);

   sqliteService.logAuditEvent(
     'SYSTEM',
     'SESSION_STORAGE_DECODE_FAIL',
     'sessionStorage',
     'app_current_user',
     `Erro de decode de sessao: ${errorMsg}`
   ).catch(err => {
     console.error(">>> [Sync Telemetry] Erro ao gravar log no SQLite:", err);
   });

   return null;
 }
};

const executeRawQuerySafe = async (sql: string, params: (string | number | boolean | null)[] = []) => {
 try {
   const values = await sqliteService.query(sql, params);
   return { values };
 } catch (err) {
   console.error(">>> [Sync SQL Fallback] Erro ao executar query interna:", err);
   return { values: [] };
 }
};

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

registerCampaignSyncQueueDelegate(addCampaignToSyncQueue);

export const getPendingCampaignSyncItems = async (): Promise<CampaignSyncItem[]> => {
 const items: CampaignSyncItem[] = [];
 await campaignQueueStore.iterate((value: CampaignSyncItem) => {
   items.push(value);
 });
 return items.sort((a, b) => a.timestamp - b.timestamp);
};

export const processCampaignSyncQueue = async (): Promise<{ success: boolean; processedCount: number }> => {
 try {
   await validateHardwareSafetyForWrite();
 } catch {
   console.warn(">>> [Sync Campaign] Cancelado por restrição rígida de hardware.");
   return { success: false, processedCount: 0 };
 }

 const user = getUserFromSessionStorage();
 const rawTenant = user ? user.tenantId : null;
 const rawFilial = sessionStorage.getItem('filial');

 if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
   return { success: false, processedCount: 0 };
 }

 const currentMode = localStorage.getItem('app_database_mode');
 if (currentMode?.startsWith('INTERNAL')) return { success: false, processedCount: 0 };
 if (!navigator.onLine) return { success: false, processedCount: 0 };

 try {
   const items = await getPendingCampaignSyncItems();
   if (items.length === 0) return { success: true, processedCount: 0 };

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
         const { error } = await supabase.from('campaigns').update(updateData).eq('id', item.campaignId);
         if (error) throw error;
       }

       await campaignQueueStore.removeItem(item.id);
       processedCount++;
     } catch (err) {
       console.error(`>>> [Sync Campaign Fail] Erro na campanha ${item.campaignId}:`, err);
       if (!navigator.onLine) break;
     }
   }
   return { success: true, processedCount };
 } catch (err) {
   console.error(">>> [Sync Campaign Fatal] Falha na fila de campanhas:", err);
   return { success: false, processedCount: 0 };
 }
};
export const photoSyncManager = {
 processPhotoSyncQueue: async (): Promise<{ success: boolean; uploadCount: number; failedCount: number }> => {
   try {
     await validateHardwareSafetyForWrite();
   } catch {
     console.warn(">>> [Sync Photo] Cancelado por restrição rígida de hardware.");
     return { success: false, uploadCount: 0, failedCount: 0 };
   }

   const user = getUserFromSessionStorage();
   const rawTenant = user ? user.tenantId : null;
   const rawFilial = sessionStorage.getItem('filial');

   if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
     return { success: false, uploadCount: 0, failedCount: 0 };
   }

   if (sqliteService.isImportingBatch) {
     console.log('[Sync Photo] Bloqueado: Exclusividade de disco activa (isImportingBatch).');
     return { success: false, uploadCount: 0, failedCount: 0 };
   }

   if (!navigator.onLine) {
     return { success: false, uploadCount: 0, failedCount: 0 };
   }
   const currentMode = localStorage.getItem('app_database_mode');
   if (currentMode?.startsWith('INTERNAL')) {
     return { success: false, uploadCount: 0, failedCount: 0 };
   }

   let uploadCount = 0;
   let failedCount = 0;

   try {
     const keys = await photoQueueStore.keys();
     for (const key of keys) {
       const item = await photoQueueStore.getItem<SyncQueueItem>(key);
       if (!item) continue;

       if (item.attempts >= 3) {
         failedCount++;
         await sqliteService.logAuditEvent(user.id, 'PHOTO_SYNC_ABORTED_MAX_ATTEMPTS', 'assets_counting', item.assetId, `Upload abortado após 3 tentativas. ID: ${item.id}.`).catch(console.error);
         await photoQueueStore.removeItem(key);
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
           .upload(filePath, item.photoBlob, { contentType: 'image/jpeg', upsert: true });

         if (uploadError) throw uploadError;

         const { data: { publicUrl } } = supabase.storage.from('asset-photos').getPublicUrl(filePath);

         const updateAssetQuery = `
           UPDATE assets_counting
           SET foto_url = ?, sync_status = 'SYNCED'
           WHERE primarykey = ? OR id = ?
         `;
         await sqliteService.query(updateAssetQuery, [publicUrl, item.assetId, item.assetId]);
         await photoQueueStore.removeItem(key);
         uploadCount++;
       } catch (error_) {
         const uploadFailMsg = error_ instanceof Error ? error_.message : String(error_);
         item.error = uploadFailMsg || "Erro no Storage";
         await photoQueueStore.setItem(key, item);
         failedCount++;

         if (isQuotaExceededError(error_)) {
           window.dispatchEvent(new CustomEvent('gbr_sync_quota_error', { detail: { message: "Quota excedida no Supabase." } }));
           break;
         }
       }
     }
     return { success: failedCount === 0, uploadCount, failedCount };
   } catch (globalError) {
     console.error(">>> [Sync Photo Fatal] Falha crítica de mídias:", globalError);
     return { success: false, uploadCount, failedCount: failedCount + 1 };
   }
 }
};

export const syncService = {
 isStringInvalid,
 processDataSyncQueue: async (): Promise<SyncResult> => {
   try {
     await validateHardwareSafetyForWrite();
   } catch {
     return { success: false, processedCount: 0, error: "Bloqueio preventivo de bateria móvel ativo (< 5%)." };
   }

   const user = getUserFromSessionStorage();
   const rawTenant = user ? user.tenantId : null;
   const rawFilial = sessionStorage.getItem('filial');

   if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
     return { success: false, processedCount: 0, error: "Sincronização abortada: Usuário ou filial indisponíveis." };
   }

   if (sqliteService.isImportingBatch) {
     return { success: false, processedCount: 0, error: "Sincronização suspensa: Isolação de Carga ativa." };
   }

   if (!navigator.onLine) return { success: false, processedCount: 0, error: "Dispositivo em modo Offline" };

   const tenantIdClean = String(rawTenant).trim();
   const filialClean = String(rawFilial).trim();

   try {
     const pendingRecords = await executeRawQuerySafe(
       `SELECT
         tenantId, filial, status, etiqueta, qt, descricaodoativo, serial,
         dataaqusic, cnpj, nomefornecedor, notafiscal, endereco, registro,
         subreg, databaixa, contacontabil, primarykey, centrodecusto,
         vlraquisic, sn1_recno, sn3_recno, id, sync_status, counter_value,
         measured_at, gps_lat, gps_lng
        FROM assets_counting
        WHERE sync_status = 'PENDING' AND tenantId = ? AND filial = ?;`,
       [tenantIdClean, filialClean]
     );

     const records = pendingRecords?.values || [];
     if (records.length === 0) return { success: true, processedCount: 0, failedCount: 0 };

     const syncedPrimaryKeys: string[] = [];
     const failedPrimaryKeys: string[] = [];

     for (const record of records) {
       const pKey = record.primarykey || record.id || '';
       if (isStringInvalid(pKey) || isStringInvalid(record.filial)) {
         failedPrimaryKeys.push(String(pKey));
         continue;
       }

       const contaValue = String(record.contacontabil || record.conta_contabil || '').trim();
       if (contaValue === '131105001') {
         syncedPrimaryKeys.push(String(pKey));
         continue;
       }

       try {
         const { error: supabaseErr } = await supabase
           .from('assets_analytics')
           .upsert({
             tenantId: tenantIdClean,
             filial: filialClean,
             status: record.status ?? '',
             etiqueta: record.etiqueta || '',
             qt: Number(record.counter_value !== undefined && record.counter_value !== null ? record.counter_value : record.qt ?? 1),
             descricaodoativo: record.descricaodoativo || '',
             serial: record.serial || '',
             dataaqusic: record.dataaqusic || '',
             cnpj: record.cnpj || '',
             nomefornecedor: record.nomefornecedor || '',
             notafiscal: record.notafiscal || '',
             endereco: record.endereco || '',
             registro: record.registro || '',
             subreg: record.subreg || '',
             databaixa: record.databaixa || '',
             contacontabil: contaValue,
             primarykey: pKey,
             centrodecusto: record.centrodecusto || '',
             vlraquisic: Number(record.vlraquisic || 0),
             sn1_recno: record.sn1_recno !== undefined && record.sn1_recno !== null ? Number(record.sn1_recno) : null,
             sn3_recno: record.sn3_recno !== undefined && record.sn3_recno !== null ? Number(record.sn3_recno) : null,
             id: record.id || pKey,
             measured_at: record.measured_at || new Date().toISOString(),
             gps_lat: record.gps_lat || null,
             gps_lng: record.gps_lng || null,
             auditor_email: user.email,
             updated_at: new Date().toISOString()
           });

         if (supabaseErr) {
           failedPrimaryKeys.push(String(pKey));
           await sqliteService.logAuditEvent(user.id, 'SYNC_RECORD_FAIL', 'assets_counting', String(pKey), `Erro: ${JSON.stringify(supabaseErr)}`).catch(console.error);
         } else {
           syncedPrimaryKeys.push(String(pKey));
           failedPrimaryKeys.push(String(pKey));
           await sqliteService.logAuditEvent(user.id, 'SYNC_RECORD_FAIL', 'assets_counting', String(pKey), `Erro: ${JSON.stringify(supabaseErr)}`).catch(console.error);
         }
       } catch {
         failedPrimaryKeys.push(String(pKey));
       }
     }

     if (syncedPrimaryKeys.length > 0) {
       for (const keyToUpdate of syncedPrimaryKeys) {
         await sqliteService.query(
           "UPDATE assets_counting SET sync_status = 'SYNCED' WHERE primarykey = ? OR id = ?;",
           [keyToUpdate, keyToUpdate]
         );
       }
     }

     return {
       success: failedPrimaryKeys.length === 0,
       processedCount: syncedPrimaryKeys.length,
       failedCount: failedPrimaryKeys.length
     };
   } catch (err: unknown) {
     return { success: false, processedCount: 0, error: err instanceof Error ? err.message : String(err) };
   }
 },

 backupContingencyLocal: async (): Promise<boolean> => {
   const user = getUserFromSessionStorage();
   const rawTenant = user ? user.tenantId : null;
   const rawFilial = sessionStorage.getItem('filial');

   if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) return false;

   const tenantIdClean = String(rawTenant).trim();
   const filialClean = String(rawFilial).trim();

   try {
     const activeData = await executeRawQuerySafe("SELECT * FROM assets_counting WHERE tenantId = ? AND filial = ?;", [tenantIdClean, filialClean]);
     const values = activeData?.values || [];
     const backupKey = `gbr_backup_${tenantIdClean}_${filialClean}`;
     localStorage.setItem(backupKey, JSON.stringify(values));
     return true;
   } catch (e) {
     console.error(">>> [Contingency Guard] Erro ao salvar rascunho de contingência:", e);
     return false;
   }
 }
};

export const processDataSyncQueue = async (): Promise<SyncResult> => {
 return await syncService.processDataSyncQueue();
};

export const getUnsyncedAssetsCount = async (): Promise<number> => {
  try {
    const user = getUserFromSessionStorage();
    const rawTenant = user ? user.tenantId : null;
    const rawFilial = sessionStorage.getItem('filial');

    let sql = "SELECT COUNT(*) as total FROM assets_counting WHERE sync_status = 'PENDING'";
    const params: (string | number)[] = [];

    if (user && !isStringInvalid(rawTenant) && !isStringInvalid(rawFilial)) {
      const tenantIdClean = String(rawTenant).trim();
      const filialClean = String(rawFilial).trim();
      sql += " AND tenantId = ? AND filial = ?";
      params.push(tenantIdClean, filialClean);
    }

    const result = await executeRawQuerySafe(sql, params);
    const rows = result?.values || [];
    const first = rows[0] || {};
    const total = Number(first.total || first.TOTAL || first.count || 0);
    return total;
  } catch (err: unknown) {
    console.error('>>> [Sync Count] Falha ao obter contagem:', err);
    return 0;
  }
};
