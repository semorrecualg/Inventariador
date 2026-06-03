import localforage from 'localforage';
import { SyncQueueItem, Asset } from '../types';
import { uploadAssetPhoto, updateAssetPhotoUrl, isQuotaExceededError, supabase, registerCampaignSyncQueueDelegate } from './supabaseService';
import { deleteLocalPhoto } from './photoService';
import { sqliteService } from './sqliteService';

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

let isDataSyncRunning = false;

export const photoSyncManager = {
  /**
   * Varre a fila do IndexedDB, faz upload para o Supabase Storage e limpa a memória local
   */
  processPhotoSyncQueue: async (): Promise<{ success: boolean; uploadCount: number }> => {
    if (sqliteService.isImportingBatch) {
      console.log('[Sync Photo] Sincronização suspensa: Importação em lote ativa.');
      return { success: false, uploadCount: 0 };
    }
    if (!navigator.onLine) return { success: false, uploadCount: 0 };

    // BLOQUEIO: Se estiver em modo INTERNO, não tenta sincronizar nada com a nuvem
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

        // Proteção contra loops infinitos de erro em redes instáveis
        if (item.attempts >= 3) {
          console.warn(`>>> [Sync Photo] Item ${item.id} atingiu o limite de tentativas e foi retido.`);
          continue;
        }

        item.attempts += 1;
        item.lastAttempt = Date.now();

        try {
          const fileExt = 'jpg';
          const filePath = `${item.tenantid}/${item.assetId}/${item.id}.${fileExt}`;

          // 1. Upload do binário bruto (Blob) para o bucket público do Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from('asset-photos')
            .upload(filePath, item.photoBlob, {
              contentType: 'image/jpeg',
              upsert: true
            });

          if (uploadError) throw uploadError;

          // 2. Recupera a URL pública gerada pelo Storage do Supabase
          const { data: { publicUrl } } = supabase.storage
            .from('asset-photos')
            .getPublicUrl(filePath);

          // 3. Atualiza síncronamente o SQLite local com o link. Marca _is_synced = 0 para o lote de dados levar essa alteração
          const updateAssetQuery = `
            UPDATE ativos 
            SET foto_url = ?, _is_synced = 0 
            WHERE id = ?
          `;
          await sqliteService.execute(updateAssetQuery, [publicUrl, item.assetId]);

          // 4. Expurgo físico do Blob da fila local para liberar espaço no IndexedDB
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
  /**
   * Processa o lote de ativos modificados offline e sincroniza com o Supabase
   */
  processDataSyncQueue: async (): Promise<{ success: boolean; processedCount: number; error?: string }> => {
    if (sqliteService.isImportingBatch) {
      return { success: false, processedCount: 0, error: "Sincronização suspensa: Importação em lote ativa." };
    }
    if (isDataSyncRunning) {
      return { success: false, processedCount: 0, error: "Sync already in progress" };
    }

    try {
      if (!navigator.onLine) {
        return { success: false, processedCount: 0, error: "Dispositivo em modo Offline" };
      }

      const currentMode = localStorage.getItem('app_database_mode');
      if (currentMode?.startsWith('INTERNAL')) {
        return { success: false, processedCount: 0, error: "Modo OFFLINE/INTERNO ativo" };
      }

      isDataSyncRunning = true;

      // 1. Busca lote de até 200 registros modificados localmente (Soberania Offline)
      const queryLocal = `
        SELECT * FROM ativos 
        WHERE _is_synced = 0 AND _is_deleted = 0 
        LIMIT 200
      `;
      const result = await sqliteService.query(queryLocal);
      
      const rawAssets = result;
      
      if (!rawAssets || rawAssets.length === 0) {
        return { success: true, processedCount: 0 };
      }

      // 2. Sanitiza o payload limpando buffers temporários de memória para blindagem PostgREST
      const sanitizedAssets = rawAssets.map((asset) => {
        // Mapeamentos unificados resilientes baseados no schema GBR v2.6
        return {
          id: String(asset.id || ''),
          tenantId: asset.tenantId ? String(asset.tenantId).trim() : (asset._tenantid ? String(asset._tenantid).trim() : 'CICOPAL'),
          filial: asset.filial ? String(asset.filial).trim() : (asset.UNIDADE_OPERACIONAL ? String(asset.UNIDADE_OPERACIONAL).trim() : 'MATRIZ'),
          status: asset.status ? String(asset.status).trim() : (asset.STATUS ? String(asset.STATUS).trim() : 'PENDENTE'),
          etiqueta: asset.etiqueta ? String(asset.etiqueta).trim() : (asset.ETIQUETA ? String(asset.ETIQUETA).trim() : ''),
          qt: asset.qt ? String(asset.qt).trim() : (asset.QT ? String(asset.QT).trim() : '1'),
          descricaodoativo: asset.descricaodoativo ? String(asset.descricaodoativo).trim() : (asset.DESCRICAODOATIVO ? String(asset.DESCRICAODOATIVO).trim() : ''),
          serial: asset.serial ? String(asset.serial).trim() : (asset.SERIAL ? String(asset.SERIAL).trim() : ''),
          dataaqusic: asset.dataaqusic ? String(asset.dataaqusic).trim() : (asset.DATAAQUISIC ? String(asset.DATAAQUISIC).trim() : ''),
          cnpj: asset.cnpj ? String(asset.cnpj).trim() : (asset.CNPJ ? String(asset.CNPJ).trim() : ''),
          nomefornecedor: asset.nomefornecedor ? String(asset.nomefornecedor).trim() : (asset.NOMEFORNECEDOR ? String(asset.NOMEFORNECEDOR).trim() : ''),
          notafiscal: asset.notafiscal ? String(asset.notafiscal).trim() : (asset.NOTAFISCAL ? String(asset.NOTAFISCAL).trim() : ''),
          endereco: asset.endereco ? String(asset.endereco).trim() : (asset.ENDERECO ? String(asset.ENDERECO).trim() : ''),
          registro: asset.registro ? String(asset.registro).trim() : (asset.REGISTRO ? String(asset.REGISTRO).trim() : ''),
          subreg: asset.subreg ? String(asset.subreg).trim() : (asset.SUBREG ? String(asset.SUBREG).trim() : ''),
          databaixa: asset.databaixa ? String(asset.databaixa).trim() : (asset.DATABAIXA ? String(asset.DATABAIXA).trim() : ''),
          contacontabil: asset.contacontabil ? String(asset.contacontabil).trim() : (asset.conta_contabil ? String(asset.conta_contabil).trim() : ''),
          primarykey: asset.primarykey ? String(asset.primarykey).trim() : (asset.PRIMARYKEY ? String(asset.PRIMARYKEY).trim() : ''),
          centrodecusto: asset.centrodecusto ? String(asset.centrodecusto).trim() : (asset.CENTRODECUSTO ? String(asset.CENTRODECUSTO).trim() : ''),
          vlraquisic: typeof asset.vlraquisic === 'number' ? asset.vlraquisic : (typeof asset.VLRAQUISIC === 'number' ? asset.VLRAQUISIC : 0),
          sn1_recno: asset.sn1_recno !== undefined ? Number(asset.sn1_recno) : (asset.Sn1_recno !== undefined ? Number(asset.Sn1_recno) : null),
          sn3_recno: asset.sn3_recno !== undefined ? Number(asset.sn3_recno) : (asset.Sn3_recno !== undefined ? Number(asset.Sn3_recno) : null),
          
          // Metadados adicionais suportados pela tabela remota na nuvem
          latitude: asset.latitude ? Number(asset.latitude) : null,
          longitude: asset.longitude ? Number(asset.longitude) : null,
          _conferido: Boolean(asset._conferido),
          _tenantid: asset._tenantid ? String(asset._tenantid).trim() : (asset.tenantId ? String(asset.tenantId).trim() : 'CICOPAL'),
          _unitid: asset._unitid ? String(asset._unitid).trim() : (asset.filial ? String(asset.filial).trim() : 'MATRIZ'),
          _version: Number(asset._version || 1),
          _is_deleted: Boolean(asset._is_deleted)
        };
      });

      // 3. Executa o Upsert em lote na tabela remota do Supabase resolvendo conflitos pelo ID
      // Higienização de Payload (v2.6): Expurga propriedades locais para evitar erro PGRST204
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const payloadSanitizada = (sanitizedAssets as Record<string, unknown>[]).map(({ _version, _unitid, latitude, longitude, is_deleted, _is_deleted, ...resto }) => resto);

      const { error: supabaseError } = await supabase
        .from('assets')
        .upsert(payloadSanitizada, { onConflict: 'id' });

      if (supabaseError) throw supabaseError;

      // 4. Atualiza o status local para sincronizado (_is_synced = 1) após a confirmação da nuvem
      const idsProcessados = sanitizedAssets.map(a => `'${a.id}'`).join(',');
      const updateLocalQuery = `
        UPDATE ativos 
        SET _is_synced = 1 
        WHERE id IN (${idsProcessados})
      `;
      await sqliteService.execute(updateLocalQuery);

      console.log(`>>> [Sync] Lote de ${sanitizedAssets.length} ativos replicados com sucesso no Supabase.`);
      return { success: true, processedCount: sanitizedAssets.length };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(">>> [Sync Error] Falha na replicação do lote híbrido:", error);
      return { success: false, processedCount: 0, error: errMsg };
    } finally {
      isDataSyncRunning = false;
    }
  },

  /**
   * Busca os ativos locais alinhando os campos de unidade para evitar divergências na UX
   */
  fetchUnitAssets: async (unitId: string, campaignId?: string | null): Promise<Asset[]> => {
    const cleanUnitId = String(unitId).trim();
    
    // Query simétrica que cobre tanto a coluna do ERP quanto o metadado da Cloud
    let query = `
      SELECT * FROM ativos 
      WHERE (TRIM(UNIDADE_OPERACIONAL) = ? OR TRIM(_unitid) = ?)
        AND _is_deleted = 0
    `;
    const params: (string | number | boolean | null)[] = [cleanUnitId, cleanUnitId];

    if (campaignId) {
      query += ` AND currentCampaignId = ?`;
      params.push(campaignId);
    }

    query += ` ORDER BY Sn1_recno ASC`;
    
    const result = await sqliteService.query(query, params);
    const rawAssets = result;
    return rawAssets as unknown as Asset[];
  }
};

/**
 * Processa a sincronização de dados (registros de ativos) entre SQLite e Supabase
 */
export const processDataSyncQueue = async (): Promise<{ success: boolean; processedCount: number; error?: string }> => {
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
export const addToSyncQueue = async (assetId: string, photoBlob: Blob, tenantid: string): Promise<string> => {
  const id = crypto.randomUUID();
  const item: SyncQueueItem = {
    id,
    assetId,
    tenantid,
    photoBlob,
    timestamp: Date.now(),
    attempts: 0
  };

  await queueStore.setItem(id, item);
  
  // Tenta processar imediatamente se houver internet
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
  await queueStore.iterate((value: SyncQueueItem) => {
    items.push(value);
  });
  return items.sort((a, b) => a.timestamp - b.timestamp);
};

/**
 * Processa a fila de sincronização de fotos
 */
export const processSyncQueue = async (onProgress?: (pendingCount: number) => void): Promise<void> => {
  // BLOQUEIO: Se estiver em modo INTERNO, não tenta sincronizar nada com a nuvem
  const currentMode = localStorage.getItem('app_database_mode');
  if (currentMode?.startsWith('INTERNAL')) {
    console.log('[Sync] Sincronização suspensa: Modo OFFLINE/INTERNO ativo.');
    return;
  }

  if (!navigator.onLine) return;

  const items = await getPendingSyncItems();
  if (items.length === 0) return;

  console.log(`[Sync] Iniciando processamento de ${items.length} fotos pendentes...`);

  for (const item of items) {
    try {
      // Tenta o upload
      const photoUrl = await uploadAssetPhoto(item.assetId, item.photoBlob, item.tenantid);
      
      if (photoUrl) {
        // Atualiza o registro do ativo com a nova URL na nuvem
        await updateAssetPhotoUrl(item.assetId, photoUrl, item.tenantid);

        // Sucesso: Remove da fila de sincronização
        await queueStore.removeItem(item.id);
        
        // EXPURGO: Remove do armazenamento local pesado (IndexedDB) agora que está na nuvem
        await deleteLocalPhoto(item.assetId);
        
        console.log(`[Sync] Foto do ativo ${item.assetId} sincronizada e expurgada localmente.`);
      
        // Dispara evento customizado para o app atualizar o estado local se necessário
        window.dispatchEvent(new CustomEvent('gbr_photo_synced', { 
          detail: { assetId: item.assetId, photoUrl } 
        }));

        // Notifica progresso se houver callback
        if (onProgress) {
          const remaining = await queueStore.length();
          onProgress(remaining);
        }
      } else {
        throw new Error('Upload retornou URL vazia');
      }
    } catch (err) {
      console.error(`[Sync] Erro ao sincronizar foto ${item.id}:`, err);
      
      // REGRA DE NEGÓCIO: Se a cota foi excedida, suspende tudo
      if (isQuotaExceededError(err)) {
        const errorMsg = 'LIMITE DE ARMAZENAMENTO ATINGIDO (Supabase Quota). Sincronização de fotos suspensa para evitar perda de dados. Contate o administrador.';
        console.error(`[Sync] ${errorMsg}`);
        
        // Disparar evento para a UI mostrar um alerta persistente
        window.dispatchEvent(new CustomEvent('gbr_sync_quota_error', { 
          detail: { message: errorMsg } 
        }));
        
        // Para o processamento IMEDIATAMENTE
        break;
      }
      
      // Atualiza tentativas para erros genéricos
      const updatedItem = {
        ...item,
        attempts: item.attempts + 1,
        lastAttempt: Date.now(),
        error: err instanceof Error ? err.message : String(err)
      };
      
      await queueStore.setItem(item.id, updatedItem);
      
      // Se falhou por rede, para o processamento para não queimar tentativas à toa
      if (!navigator.onLine) break;
    }
  }
};

/**
 * Retorna o número de itens pendentes na fila
 */
export const getSyncQueueLength = async (): Promise<number> => {
  return await queueStore.length();
};

/**
 * Remove um item específico da fila
 */
export const removeItemFromQueue = async (id: string): Promise<void> => {
  await queueStore.removeItem(id);
};

/**
 * Limpa a fila (útil para debug ou reset)
 */
export const clearSyncQueue = async (): Promise<void> => {
  await queueStore.clear();
};

/**
 * Executa de forma exposta a sincronização resiliente de fotos das filas
 */
export const processPhotoSyncQueue = async (): Promise<{ success: boolean; uploadCount: number }> => {
  return await photoSyncManager.processPhotoSyncQueue();
};

/**
 * Hook/Listener para monitorar a volta da conexão
 */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Sync] Conexão restaurada. Processando filas...');
    processSyncQueue().catch(console.error);
    processPhotoSyncQueue().catch(console.error);
    processDataSyncQueue().catch(console.error);
    processCampaignSyncQueue().catch(console.error);
  });

  // Intervalo de segurança para sincronização de dados (registros, fotos e campanhas)
  // Roda de forma coordenada a cada 30 segundos
  setInterval(() => {
    processDataSyncQueue().catch(console.error);
    processPhotoSyncQueue().catch(console.error);
    processCampaignSyncQueue().catch(console.error);
  }, 30000);
}

export default syncService;
