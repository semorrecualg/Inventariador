import { Capacitor } from '@capacitor/core';
import localforage from 'localforage';
import { SyncQueueItem } from '../types';
import { isQuotaExceededError, supabase, registerCampaignSyncQueueDelegate } from './supabaseService';
import { sqliteService, db } from './sqliteService';

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

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// PREVENÇÃO ABSOLUTA DE TDZ (HOISTING ESTRITO) - Variáveis de Controle no Topo
let isSyncingLoopActive = false;
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

const isStringInvalid = (val: unknown): boolean => {
  if (val === null || val === undefined) return true;
  const s = String(val).trim().toUpperCase();
  return s === '' || s === 'UNDEFINED' || s === 'NULL' || s === 'NULO';
};

/**
 * Verifica condições de segurança física de hardware (trava preventiva de bateria baixa < 5%)
 */
export const checkHardwareSafety = async (): Promise<boolean> => {
  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const battery: any = await (navigator as any).getBattery();
      if (battery && battery.level <= 0.05 && !battery.charging) {
        console.warn(`>>> [Hardware Safety Check] BLOQUEIO DE BATERIA ATIVO: Carga atual de ${Math.round(battery.level * 100)}% sem fonte externa conectada. Sincronização e gravações físicas suspensas.`);
        return false;
      }
    }
  } catch (err) {
    console.error(">>> [Hardware Safety Check] Erro de verificação do subsistema de energia:", err);
  }
  return true;
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

    const tId = parsed.tenantId || 
                parsed._tenantid || 
                parsed.tenantid || 
                parsed.tenant_id || 
                localStorage.getItem('tenantId') || 
                sessionStorage.getItem('tenantId') || 
                localStorage.getItem('_tenantid') || 
                sessionStorage.getItem('_tenantid') ||
                'CICOPAL';

    if (isStringInvalid(tId)) {
      console.error(">>> [Sync Guard] Vazamento multidomínio detectado! tenantId é inválido ou ausente.");
      return null;
    }
    
    console.log(">>> [Sync Guard] Identificador de contrato (tenantId) resolvido com sucesso:", tId);
    
    return {
      id: String(parsed.id),
      email: String(parsed.email || ''),
      tenantId: String(tId),
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

// REQUISITO 1: 'query(sql, params)' já retorna Record<string, unknown>[] bruto.
const fallbackStore = localforage.createInstance({
  name: 'gbr_sqlite_fallback',
  storeName: 'assets_fallback'
});



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
  const id = generateUUID();
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
  const IS_OFFLINE_FIRST_PHASE = true;
  if (IS_OFFLINE_FIRST_PHASE || !Capacitor.isNativePlatform()) {
    return { success: true, processedCount: 0 };
  }
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
    const IS_OFFLINE_FIRST_PHASE = true;
    if (IS_OFFLINE_FIRST_PHASE || !Capacitor.isNativePlatform()) {
      return { success: true, uploadCount: 0, failedCount: 0 };
    }
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

          // Atualização nas tabelas oficiais via Dexie (IndexedDB) sem usar SQL puro
          const assetKey = String(item.assetId).trim();
          await db.ativos.update(assetKey, { _photoUrl: publicUrl, _is_synced: 1 });
          await db.local_assets.update(assetKey, { _photoUrl: publicUrl, _is_synced: 1 });
          await db.assets.update(assetKey, { _photoUrl: publicUrl, _is_synced: 1 });

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

const _syncService = {
  isStringInvalid,

  processDataSyncQueue: async (): Promise<SyncResult> => {
    const IS_OFFLINE_FIRST_PHASE = true;
    if (IS_OFFLINE_FIRST_PHASE || !Capacitor.isNativePlatform()) {
      return { success: true, processedCount: 0 };
    }
    const user = getUserFromLocalStorage();
    const rawTenant = user ? user.tenantId : null;
    const rawFilial = sessionStorage.getItem('filial');

    if (!user || isStringInvalid(rawTenant) || isStringInvalid(rawFilial)) {
      return { success: false, processedCount: 0, error: "Sincronização abortada: Usuário ou filial indisponíveis." };
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
      // 1. ANTI-DUPLICATION FILTER: Ler única e exclusivamente a tabela 'local_assets' buscando registros onde '_is_synced = 0' via Dexie API
      const pendingRecords = await db.local_assets.where('_is_synced').equals(0).toArray();

      // Filtro de Multi-Tenancy e Unidade com custo documentado para campos não indexados (apenas filial e _is_synced são indexados no store da v1)
      const records = (pendingRecords || []).filter(record => {
        const isTenantMatch = String(record.tenantId || record._tenantid || '').trim().toUpperCase() === tenantIdClean.toUpperCase();
        const isFilialMatch = String(record.filial || record._unitid || '').trim().toUpperCase() === filialClean.toUpperCase();
        return isTenantMatch && isFilialMatch;
      });

      if (records.length === 0) {
        return { success: true, processedCount: 0, failedCount: 0 };
      }

      const syncedPrimaryKeys: string[] = [];
      const failedPrimaryKeys: string[] = [];

      for (const record of records) {
        // GUARDA DE CONECTIVIDADE EM TEMPO REAL: Evita enchentes de erros caso o sinal caia no meio do laço
        if (!navigator.onLine) {
          console.warn(">>> [Sync Guard] Conectividade perdida no meio do laço de processamento. Abortando ciclo.");
          break;
        }

        const pKey = record.primarykey || record.id || '';
        if (isStringInvalid(pKey)) {
          failedPrimaryKeys.push(String(pKey));
          continue;
        }

        const contaValue = String(record.contacontabil || record.conta_contabil || '').trim();
        if (contaValue === '131105001') {
          // Marcar como sincronizado para pular a repetição na fila sem enviar ao Supabase (Regra Fiscal)
          syncedPrimaryKeys.push(String(pKey));
          continue;
        }

        // 3. ISOLAMENTO EM CASO DE FALHA DE REDE OU RLS (401/403) COM TRATAMENTO RESILIENTE
        try {
          if (!supabase) throw new Error("Instância do Supabase indisponível.");
          
          // 2. VETO A PAYLOADS POLUÍDOS E TRANCA _tenantid: Enviar apenas colunas oficiais exigidas e trancas ocultas (21 índices contábeis)
          const payload = {
            _tenantid: tenantIdClean,
            _unitid: filialClean,
            tenantId: tenantIdClean,
            filial: filialClean,
            status: record.status !== undefined && record.status !== null ? String(record.status).trim() : 'ATIVO',
            etiqueta: record.etiqueta !== undefined && record.etiqueta !== null ? String(record.etiqueta).trim() : '',
            qt: record.qt !== undefined && record.qt !== null ? Number(record.qt) : 1,
            descricaodoativo: record.descricaodoativo !== undefined && record.descricaodoativo !== null ? String(record.descricaodoativo).trim() : '',
            serial: record.serial !== undefined && record.serial !== null ? String(record.serial).trim() : null,
            dataaqusic: record.dataaqusic !== undefined && record.dataaqusic !== null ? String(record.dataaqusic).trim() : null,
            cnpj: record.cnpj !== undefined && record.cnpj !== null ? String(record.cnpj).trim() : null,
            nomefornecedor: record.nomefornecedor !== undefined && record.nomefornecedor !== null ? String(record.nomefornecedor).trim() : null,
            notafiscal: record.notafiscal !== undefined && record.notafiscal !== null ? String(record.notafiscal).trim() : null,
            endereco: record.endereco !== undefined && record.endereco !== null ? String(record.endereco).trim() : null,
            registro: record.registro !== undefined && record.registro !== null ? String(record.registro).trim() : null,
            subreg: record.subreg !== undefined && record.subreg !== null ? String(record.subreg).trim() : null,
            databaixa: record.databaixa !== undefined && record.databaixa !== null ? String(record.databaixa).trim() : null,
            contacontabil: record.contacontabil !== undefined && record.contacontabil !== null ? String(record.contacontabil).trim() : null,
            primarykey: String(pKey).trim(),
            centrodecusto: record.centrodecusto !== undefined && record.centrodecusto !== null ? String(record.centrodecusto).trim() : null,
            vlraquisic: record.vlraquisic !== undefined && record.vlraquisic !== null ? Number(record.vlraquisic) : 0,
            sn1_recno: record.sn1_recno !== undefined && record.sn1_recno !== null ? Number(record.sn1_recno) : null,
            sn3_recno: record.sn3_recno !== undefined && record.sn3_recno !== null ? Number(record.sn3_recno) : null,
            DE_PARA: record.DE_PARA !== undefined && record.DE_PARA !== null ? String(record.DE_PARA).trim() : null,
            gps_lat: record.gps_lat !== undefined && record.gps_lat !== null ? Number(record.gps_lat) : null,
            gps_lng: record.gps_lng !== undefined && record.gps_lng !== null ? Number(record.gps_lng) : null,
            currentCampaignId: record.currentCampaignId !== undefined && record.currentCampaignId !== null ? String(record.currentCampaignId).trim() : null
          };

          const { error: supabaseErr } = await supabase
            .from('assets')
            .upsert(payload);

          if (!supabaseErr) {
            syncedPrimaryKeys.push(String(pKey));
          } else {
            failedPrimaryKeys.push(String(pKey));
            const errObj = supabaseErr as { status?: string | number; code?: string | number; message?: string };
            const statusStr = errObj.status || errObj.code || 'SYNC_FAIL';
            const detailsStr = `Erro Supabase: [${statusStr}] ${supabaseErr.message || JSON.stringify(supabaseErr)}`;
            
            console.warn(`>>> [Sync Isolator] Erro Supabase detectado silenciosamente para chave ${pKey}:`, detailsStr);

            await sqliteService.logAuditEvent(
              user.id,
              'SYNC_RECORD_FAIL',
              'local_assets',
              String(pKey),
              detailsStr
            ).catch(console.error);
          }
        } catch (err: unknown) {
          failedPrimaryKeys.push(String(pKey));
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`>>> [Sync Isolator] Exceção capturada silenciosamente para chave ${pKey}:`, errMsg);

          await sqliteService.logAuditEvent(
            user.id,
            'SYNC_RECORD_EXCEPTION',
            'local_assets',
            String(pKey),
            `Exceção ao sincronizar registro: ${errMsg}`
          ).catch(console.error);
          
          if (!navigator.onLine) break; // Força a saída do laço se o erro foi decorrente de queda de rede físico
        }
      }

      // CORREÇÃO DE AUDITORIA (ACID TRANSACTION ATÔMICO SEQUENCIAL): Aplica atualizações locais sequencialmente via Dexie sem usar SQL
      if (syncedPrimaryKeys.length > 0) {
        console.log(`>>> [Sync ACID Engine] Processando atualização local sequencial via Dexie para ${syncedPrimaryKeys.length} registros...`);

        await db.transaction('rw', [db.local_assets, db.ativos, db.assets], async () => {
          for (let m = 0; m < syncedPrimaryKeys.length; m++) {
            const keyToUpdate = syncedPrimaryKeys[m];
            await db.local_assets.update(keyToUpdate, { _is_synced: 1 });
            await db.ativos.update(keyToUpdate, { _is_synced: 1 });
            await db.assets.update(keyToUpdate, { _is_synced: 1 });
          }
        });
        
        console.log(`>>> [Sync ACID Engine] Sincronização local consolidada com sucesso via Dexie.`);
      }

      // 4. EXPURGAMENTO DE LOGS (DISK SATURATION GUARD): Limpar histórico antigo via Dexie API para evitar entupimento de disco
      try {
        console.log(">>> [Disk Saturation Guard] Executando expurgo de logs antigos via Dexie...");
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const isoString = sevenDaysAgo.toISOString();
        
        await db.audit_logs.where('updated_at').below(isoString).delete();
        console.log(">>> [Disk Saturation Guard] Expurgo concluído com sucesso via Dexie.");
      } catch (logErr) {
        console.warn(">>> [Disk Saturation Guard] Erro silencioso ao expurgar logs:", logErr);
      }

      return {
        success: failedPrimaryKeys.length === 0,
        processedCount: syncedPrimaryKeys.length,
        failedCount: failedPrimaryKeys.length
      };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(">>> [Sync Service Engine] Falha catastrófica na fila de dados:", msg);
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
      // Busca local_assets onde filial é igual a filialClean, e filtra por tenantId em memória (apenas filial é indexado)
      const list = await db.local_assets.where('filial').equals(filialClean).toArray();
      const filtered = list.filter(item => 
        String(item.tenantId || item._tenantid || '').trim().toUpperCase() === tenantIdClean.toUpperCase()
      );
      
      const backupKey = `gbr_backup_${tenantIdClean.toUpperCase()}_${filialClean.toUpperCase()}`;
      localStorage.setItem(backupKey, JSON.stringify(filtered));
      return true;
    } catch (e) {
      console.error(">>> [Contingency Guard] Erro ao consolidar rascunho físico em localStorage via Dexie:", e);
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
 * Retorna o número de ativos aguardando sincronização com a nuvem via Dexie API
 */
export const getUnsyncedAssetsCount = async (): Promise<number> => {
   try {
     const user = getUserFromLocalStorage();
     const rawTenant = user ? user.tenantId : null;
     const rawFilial = sessionStorage.getItem('filial');
     
     const unsynced = await db.local_assets.where('_is_synced').equals(0).toArray();
     
     if (user && !isStringInvalid(rawTenant) && !isStringInvalid(rawFilial)) {
       const tenantIdClean = String(rawTenant).trim().toUpperCase();
       const filialClean = String(rawFilial).trim().toUpperCase();
       const filtered = unsynced.filter(record => {
         const isTenantMatch = String(record.tenantId || record._tenantid || '').trim().toUpperCase() === tenantIdClean;
         const isFilialMatch = String(record.filial || record._unitid || '').trim().toUpperCase() === filialClean;
         return isTenantMatch && isFilialMatch;
       });
       return filtered.length;
     }
     
     return unsynced.length;
   } catch (e) {
     console.error(">>> [Sync Guard] Erro ao contar ativos pendentes na tabela local_assets via Dexie, tentando fallbackStore:", e);
     try {
       const assets = await fallbackStore.getItem<Record<string, unknown>[]>('loaded_assets') || [];
       const unsynced = assets.filter(a => a._is_synced === 0 || a._is_synced === false || a.sync_status === 'PENDING');
       return unsynced.length;
     } catch {
       return 0;
     }
   }
};

/**
 * Adiciona uma foto à fila de sincronização offline
 */
export const addToSyncQueue = async (assetId: string, photoBlob: Blob, tenantId: string): Promise<string> => {
  const id = generateUUID();
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
  
  const safe = await checkHardwareSafety();
  if (!safe) {
    console.warn(">>> [Sync Guard] Gravação física abortada preventivamente devido à bateria baixa (< 5%).");
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
 * Executa de forma exposta a sincronização resilient de fotos das filas
 */
export const processPhotoSyncQueue = async (): Promise<{ success: boolean; uploadCount: number; failedCount: number }> => {
  if (isSyncingLoopActive) return { success: false, uploadCount: 0, failedCount: 0 };
  
  const safe = await checkHardwareSafety();
  if (!safe) {
    console.warn(">>> [Sync Guard] Gravação física abortada preventivamente devido à bateria baixa (< 5%).");
    return { success: false, uploadCount: 0, failedCount: 0 };
  }

  isSyncingLoopActive = true;
  try {
    return await photoSyncManager.processPhotoSyncQueue();
  } finally {
    isSyncingLoopActive = false;
  }
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
  const IS_OFFLINE_FIRST_PHASE = true;
  if (IS_OFFLINE_FIRST_PHASE || !Capacitor.isNativePlatform()) {
    scheduleNextCycle();
    return;
  }
  if (isSyncingLoopActive) return;
  
  const safe = await checkHardwareSafety();
  if (!safe) {
    scheduleNextCycle();
    return;
  }

  // Barreira de guarda para evitar loops infinitos de sincronização antes do operador estar logado
  const user = getUserFromLocalStorage();
  const rawFilial = sessionStorage.getItem('filial');
  if (!user || isStringInvalid(rawFilial)) {
    // Retorna silenciosamente e agenda o próximo ciclo sem incrementar falhas
    scheduleNextCycle();
    return;
  }

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

export const syncService = new Proxy(_syncService, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(target);
    }
    return value;
  }
});

export default syncService;
