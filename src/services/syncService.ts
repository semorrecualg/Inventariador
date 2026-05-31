import localforage from 'localforage';
import { SyncQueueItem, Asset } from '../types';
import { uploadAssetPhoto, updateAssetPhotoUrl, isQuotaExceededError, supabase } from './supabaseService';
import { deleteLocalPhoto } from './photoService';
import { sqliteService } from './sqliteService';

const PHOTO_QUEUE_STORE = 'gbr_photo_sync_queue';

// Configura o store local
const queueStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: PHOTO_QUEUE_STORE
});

const photoQueueStore = queueStore;

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

      // 2. Sanitiza o payload limpando buffers temporários de memória
      const sanitizedAssets = rawAssets.map((asset) => ({
        id: String(asset.id || ''),
        latitude: asset.latitude ? Number(asset.latitude) : null,
        longitude: asset.longitude ? Number(asset.longitude) : null,
        _conferido: Boolean(asset._conferido),
        _tenantid: String(asset._tenantid || ''),
        _unitid: asset._unitid ? String(asset._unitid).trim() : null,
        _version: Number(asset._version || 1),
        _is_deleted: Boolean(asset._is_deleted),
        UNIDADE_OPERACIONAL: asset.UNIDADE_OPERACIONAL ? String(asset.UNIDADE_OPERACIONAL).trim() : null,
        GRUPO_EMPRESARIAL: asset.GRUPO_EMPRESARIAL ? String(asset.GRUPO_EMPRESARIAL) : null,
        ETIQUETA: asset.ETIQUETA ? String(asset.ETIQUETA) : null,
        conta_contabil: asset.conta_contabil ? String(asset.conta_contabil) : null,
        DESCRICAODOATIVO: asset.DESCRICAODOATIVO ? String(asset.DESCRICAODOATIVO) : null,
        Sn1_recno: asset.Sn1_recno ? Number(asset.Sn1_recno) : null,
        Sn3_recno: asset.Sn3_recno ? Number(asset.Sn3_recno) : null,
        currentCampaignId: asset.currentCampaignId ? String(asset.currentCampaignId) : null,
        tenantId: asset.tenantId ? String(asset.tenantId).trim() : (asset._tenantid ? String(asset._tenantid).trim() : 'CICOPAL'),
        filial: asset.filial ? String(asset.filial).trim() : (asset.UNIDADE_OPERACIONAL ? String(asset.UNIDADE_OPERACIONAL).trim() : 'MATRIZ')
      }));

      // 3. Executa o Upsert em lote na tabela remota do Supabase resolvendo conflitos pelo ID
      const { error: supabaseError } = await supabase
        .from('assets')
        .upsert(sanitizedAssets, { onConflict: 'id' });

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
  });

  // Intervalo de segurança para sincronização de dados (registros e fotos)
  // Roda de forma coordenada a cada 30 segundos
  setInterval(() => {
    processDataSyncQueue().catch(console.error);
    processPhotoSyncQueue().catch(console.error);
  }, 30000);
}

export default syncService;
