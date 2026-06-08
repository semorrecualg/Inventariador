import localforage from 'localforage';
import { SyncQueueItem } from '../types';
import { isQuotaExceededError, supabase, registerCampaignSyncQueueDelegate } from './supabaseService';
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
  failedCount?: number;
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

// PREVENÇÃO ABSOLUTA DE TDZ (HOISTING ESTRITO) - Variáveis de Controle no Topo
let isSyncingLoopActive = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

const isStringInvalid = (val: unknown): boolean => {
  if (val === null || val === undefined) return true;
  const s = String(val).trim().toUpperCase();
  return s === '' || s === 'UNDEFINED' || s === 'NULL' || s === 'NULO';
};

const getUserFromLocalStorage = (): UserSessionData | null => {
  try {
    const data = localStorage.getItem('gbr_user_session') || sessionStorage.getItem('app_current_user');
    if (!data) {
      return null;
    }
    const parsed = JSON.parse(data);
    
    if (!parsed || typeof parsed !== 'object' || !parsed.id) {
      return null;
    }
    
    return {
      id: String(parsed.id),
      email: String(parsed.email || ''),
      tenantId: String(parsed.tenantId || 'CICOPAL'),
      role: String(parsed.role || 'AUDITOR')
    };
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(">>> [Sync Guard] Falha catastrófica ao decodificar sessão do operador no LocalStorage:", errorMsg);
    
    sqliteService.logAuditEvent(
      'SYSTEM',
      'LOCAL_STORAGE_DECODE_FAIL',
      'localStorage',
      'gbr_user_session',
      `Erro de decode de sessao: ${errorMsg}`
    ).catch(err => {
      console.error(">>> [Sync Telemetry] Erro ao gravar log de falha de decodificação no SQLite:", err);
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
      console.warn(">>> [Sync Fail-Safe] Identificador de Contrato ou Filial inválido ou ausente na fila de campanhas. Suspendendo processamento.");
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gbr_sync_warning', {
          detail: { message: "Parâmetros voláteis de rede (Tenant ou Filial) ausentes. Sincronização de campanhas postergada." }
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
  processPhotoSyncQueue: async (): Promise<{ success: boolean; uploadCount: number; failedCount: number }> => {
    const user = getUserFromLocalStorage();
    const rawTenant = user ? user.tenantId : null;
    const rawFilial = sessionStorage.getItem('filial');

    if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
      if (user && (isStringInvalid(rawTenant) || isStringInvalid(rawFilial))) {
        console.warn(">>> [Sync Fail-Safe] Identificador de Contrato ou Filial inválido ou ausente na fila de fotos. Suspendendo processamento.");
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gbr_sync_warning', {
            detail: { message: "Parâmetros voláteis de rede (Tenant ou Filial) ausentes. Sincronização de fotos postergada." }
          }));
        }
      }
      return { success: false, uploadCount: 0, failedCount: 0 };
    }
    if (sqliteService.isImportingBatch) {
      console.log('[Sync Photo] Sincronização suspensa: Importação em lote ativa.');
      return { success: false, uploadCount: 0, failedCount: 0 };
    }
    if (!navigator.onLine) return { success: false, uploadCount: 0, failedCount: 0 };

    const currentMode = localStorage.getItem('app_database_mode');
    if (currentMode?.startsWith('INTERNAL')) {
      console.log('[Sync Photo] Sincronização suspensa: Modo OFFLINE/INTERNO ativo.');
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
          console.warn(`>>> [Sync Photo] Item ${item.id} atingiu o limite de tentativas. Expurgação telemetria.`);
          failedCount++;
          
          await sqliteService.logAuditEvent(
            user.id,
            'PHOTO_SYNC_ABORTED_MAX_ATTEMPTS',
            'assets_counting',
            item.assetId,
            `Upload abortado após 3 tentativas. ID: ${item.id}. Último erro: ${item.error || 'Nenhum'}`
          ).catch(console.error);

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
            .upload(filePath, item.photoBlob, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('asset-photos')
            .getPublicUrl(filePath);

          // Atualização na tabela oficial 'assets_counting' com nomenclatura unificada canonical
          const updateAssetQuery = `
            UPDATE assets_counting 
            SET foto_url = ?, sync_status = 'SYNCED' 
            WHERE primarykey = ? OR id = ?
          `;
          await sqliteService.query(updateAssetQuery, [publicUrl, item.assetId, item.assetId]);

          await photoQueueStore.removeItem(key);
          uploadCount++;
          
          console.log(`>>> [Sync Photo Success] Imagem do ativo ${item.assetId} enviada para o Supabase e limpa localmente.`);
        } catch (uploadFail) {
          const uploadFailMsg = uploadFail instanceof Error ? uploadFail.message : String(uploadFail);
          item.error = uploadFailMsg || "Erro desconhecido no Storage";
          await photoQueueStore.setItem(key, item);
          console.error(`>>> [Sync Photo Fail] Tentativa ${item.attempts} falhou para o item ${item.id}:`, uploadFail);
          failedCount++;
          
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
      
      return { success: failedCount === 0, uploadCount, failedCount };
    } catch (globalError) {
      console.error(">>> [Sync Photo Fatal] Falha crítica ao processar fila de imagens:", globalError);
      return { success: false, uploadCount, failedCount: failedCount + 1 };
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
        console.warn(">>> [Sync Fail-Safe] Identificador de Contrato (tenantId) ou Filial inválido na fila. Suspendendo processamento.");
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gbr_sync_warning', {
            detail: { message: "Parâmetros voláteis de rede (Tenant ou Filial) ausentes. Sincronização de dados postergada." }
          }));
        }
      }
      return { success: false, processedCount: 0, error: "Sincronização abortada: Usuário ou filial indisponíveis ou inválidos." };
    }

    if (sqliteService.isImportingBatch) {
      console.warn(">>> [Sync Fail-Safe] Bloqueio imperativo: Operação suspensa por atividade na Carga Expert.");
      return { success: false, processedCount: 0, error: "Sincronização suspensa: Importação em lote activa." };
    }

    if (!navigator.onLine) {
      return { success: false, processedCount: 0, error: "Dispositivo em modo Offline" };
    }

    const tenantIdClean = String(rawTenant).trim();
    const filialClean = String(rawFilial).trim();

    try {
      // Cláusula SELECT parametrizada e estruturada com colunas estritas do dicionário de dados oficial GBR v24.50
      const pendingRecords = await executeRawQuerySafe(
        `SELECT 
          tenantId, 
          filial, 
          status, 
          etiqueta, 
          qt, 
          descricaodoativo, 
          serial, 
          dataaqusic, 
          cnpj, 
          nomefornecedor, 
          notafiscal, 
          endereco, 
          registro, 
          subreg, 
          databaixa, 
          contacontabil, 
          primarykey, 
          centrodecusto, 
          vlraquisic, 
          sn1_recno, 
          sn3_recno, 
          id, 
          sync_status, 
          counter_value, 
          measured_at, 
          gps_lat, 
          gps_lng 
        FROM assets_counting 
        WHERE sync_status = 'PENDING' AND tenantId = ? AND filial = ?;`,
        [tenantIdClean, filialClean]
      );

      const records = pendingRecords?.values || [];
      if (records.length === 0) {
        return { success: true, processedCount: 0, failedCount: 0 };
      }

      const syncedPrimaryKeys: string[] = [];
      const failedPrimaryKeys: string[] = [];

      for (const record of records) {
        const pKey = record.primarykey || record.id || '';
        if (isStringInvalid(pKey) || isStringInvalid(record.filial)) {
          console.warn(`>>> [Sync Audit] Registro corrompido detectado no SQLite local (PrimaryKey: ${pKey}). Ignorando gravação em nuvem.`);
          failedPrimaryKeys.push(String(pKey));
          continue;
        }

        const contaValue = String(record.contacontabil || record.conta_contabil || '').trim();
        // Expurgo preventivo da conta de eliminação '131105001' demandado pela governança
        if (contaValue === '131105001') {
          console.warn(`>>> [Sync Audit] Expurgo preventivo detectado para a conta de eliminação '131105001' no registro ${pKey}.`);
          // Marcar como sincronizado para pular a repetição na fila sem enviar ao Supabase
          syncedPrimaryKeys.push(String(pKey));
          continue;
        }

        try {
          // Payload em nuvem mapeia estritamente as colunas exatas exigidas pelo dicionário consolidado
          const { error: supabaseErr } = await supabase
            .from('assets_analytics')
            .upsert({
              tenantId: tenantIdClean,
              filial: filialClean,
              status: record.status || '',
              etiqueta: record.etiqueta || '',
              qt: Number(record.qt || (record.counter_value !== undefined ? record.counter_value : 1)),
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

          if (!supabaseErr) {
            syncedPrimaryKeys.push(String(pKey));
          } else {
            console.error(`>>> [Sync Network Error] Falha de persistência no Supabase para o registro ${pKey}:`, supabaseErr);
            failedPrimaryKeys.push(String(pKey));

            await sqliteService.logAuditEvent(
              user.id,
              'SYNC_RECORD_FAIL',
              'assets_counting',
              String(pKey),
              `Erro Supabase: ${JSON.stringify(supabaseErr)}`
            ).catch(console.error);
          }
        } catch (individualError) {
          console.error(`>>> [Sync Record Exception] Exceção na chamada de upload para o registro ${pKey}:`, individualError);
          failedPrimaryKeys.push(String(pKey));
        }
      }

      // ACID TRANSACTION: Aplica a atualização em lote atômico local utilizando 'primarykey'
      if (syncedPrimaryKeys.length > 0) {
        console.log(`>>> [Sync ACID Engine] Gravando em lote '${syncedPrimaryKeys.length}' status como SYNCED sob transação...`);
        let inTransaction = false;
        try {
          await sqliteService.query("BEGIN TRANSACTION;");
          inTransaction = true;
          for (const keyToUpdate of syncedPrimaryKeys) {
            await sqliteService.query(
              "UPDATE assets_counting SET sync_status = 'SYNCED' WHERE primarykey = ? OR id = ?;",
              [keyToUpdate, keyToUpdate]
            );
          }
          await sqliteService.query("COMMIT;");
          inTransaction = false;
          console.log(`>>> [Sync ACID Engine] Transação de persistência atômica local concluída para '${syncedPrimaryKeys.length}' registros.`);
        } catch (transError) {
          console.error(">>> [Sync ACID Engine] Falha na gravação do lote local de sincronizados:", transError);
          if (inTransaction) {
            try {
              await sqliteService.query("ROLLBACK;");
              console.log(">>> [Sync ACID Engine] ROLLBACK efetuado com sucesso.");
            } catch (rErr) {
              console.error(">>> [Sync ACID Engine] Erro catastrófico ao reverter transação local:", rErr);
            }
          }

          await sqliteService.logAuditEvent(
            user.id,
            'SYNC_BATCH_TRANSACTION_FAIL',
            'assets_counting',
            'BATCH',
            `Erro transacao local: ${transError instanceof Error ? transError.message : String(transError)}`
          ).catch(console.error);

          throw transError;
        }
      }

      const totalProcessed = syncedPrimaryKeys.length;
      const totalFailed = failedPrimaryKeys.length;

      return {
        success: totalFailed === 0,
        processedCount: totalProcessed,
        failedCount: totalFailed
      };
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
 * Retorna o número de ativos aguardando sincronização com a nuvem (da tabela unificada assets_counting)
 */
export const getUnsyncedAssetsCount = async (): Promise<number> => {
   try {
     const user = getUserFromLocalStorage();
     const rawTenant = user ? user.tenantId : null;
     const rawFilial = sessionStorage.getItem('filial');
     
     let sql = "SELECT COUNT(*) as total FROM assets_counting WHERE sync_status = 'PENDING'";
     const params: (string | number)[] = [];
     
     if (user && !isStringInvalid(rawTenant) && !isStringInvalid(rawFilial)) {
       sql += " AND tenantId = ? AND filial = ?";
       params.push(String(rawTenant).trim(), String(rawFilial).trim());
     }
     
     const result = await sqliteService.query(sql, params);
     return Number(result[0]?.total || 0);
   } catch (e) {
     console.error(">>> [Sync Guard] Erro ao contar ativos pendentes na tabela assets_counting:", e);
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
 * Processa a fila de sincronização de fotos (alias para manter compatibilidade com componentes)
 */
export const processSyncQueue = async (): Promise<void> => {
  if (isSyncingLoopActive) {
    console.warn(">>> [Sync Alias Guard] Concurrency prevented: a sync loop is already running.");
    return;
  }
  isSyncingLoopActive = true;
  try {
    console.log(">>> [Sync Alias] Starting sequential manual synchronization...");
    await syncService.processDataSyncQueue().catch(console.error);
    await photoSyncManager.processPhotoSyncQueue().catch(console.error);
  } finally {
    isSyncingLoopActive = false;
  }
};

/**
 * Executa de forma exposta a sincronização resiliente de fotos das filas
 */
export const processPhotoSyncQueue = async (): Promise<{ success: boolean; uploadCount: number; failedCount: number }> => {
  if (isSyncingLoopActive) return { success: false, uploadCount: 0, failedCount: 0 };
  return await photoSyncManager.processPhotoSyncQueue();
};

const scheduleNextCycle = () => {
  let nextDelay = 30000; // 30 segundos padrão
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    nextDelay = 300000; // 5 minutos de resguardo para poupar bateria
    console.error(`>>> [Sync Loop SRE] Sistema em avaria severa cumulativa. Backoff de segurança (5 minutos) ativado.`);
  }
  setTimeout(runSyncLoopCycle, nextDelay);
};

const runSyncLoopCycle = async () => {
  if (isSyncingLoopActive) return;
  isSyncingLoopActive = true;
  
  let hasFailure = false;
  
  try {
    if (navigator.onLine) {
      console.log(">>> [Sync Loop] Ativando ciclo sequencial de sincronização SRE...");
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(`>>> [Sync Loop Guard] Limite de falhas consecutivas atingido (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}). Prorrogando ciclo para poupar bateria.`);
        hasFailure = true;
        return;
      }

      await syncService.processDataSyncQueue().catch(err => {
        console.error(">>> [Sync Loop] Falha no ciclo de sincronização de dados:", err);
        hasFailure = true;
      });
      await photoSyncManager.processPhotoSyncQueue().catch(err => {
        console.error(">>> [Sync Loop] Falha no ciclo de sincronização de fotos:", err);
        hasFailure = true;
      });
      await processCampaignSyncQueue().catch(err => {
        console.error(">>> [Sync Loop] Falha no ciclo de sincronização de campanhas:", err);
        hasFailure = true;
      });
    }
  } catch (err) {
    console.error(">>> [Sync Loop] Erro fatal no ciclo de sincronização geral:", err);
    hasFailure = true;
  } finally {
    isSyncingLoopActive = false;
    
    if (hasFailure) {
      consecutiveFailures++;
    } else {
      consecutiveFailures = 0;
    }

    scheduleNextCycle();
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // Evita loop infinito e executa somente se não estiver ativo no momento
    if (!isSyncingLoopActive) {
      consecutiveFailures = 0;
      runSyncLoopCycle().catch(console.error);
    }
  });

  // Agenda a primeira execução com delay estratégico após inicialização da WebView
  setTimeout(runSyncLoopCycle, 10000);
}

export default syncService;
