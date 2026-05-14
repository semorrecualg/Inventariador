
import localforage from 'localforage';
import { SyncQueueItem, Asset } from '../types';
import { uploadAssetPhoto, updateAssetPhotoUrl, isQuotaExceededError, syncAssetsToCloud } from './supabaseService';
import { deleteLocalPhoto } from './photoService';
import { sqliteService } from './sqliteService';

const PHOTO_QUEUE_STORE = 'gbr_photo_sync_queue';

// Configura o store local
const queueStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: PHOTO_QUEUE_STORE
});

let isDataSyncRunning = false;

/**
 * Processa a sincronização de dados (registros de ativos) entre SQLite e Supabase
 */
export const processDataSyncQueue = async (): Promise<void> => {
  if (isDataSyncRunning) return;
  
  const currentMode = localStorage.getItem('app_database_mode');
  if (currentMode?.startsWith('INTERNAL')) return;
  if (!navigator.onLine) return;

  isDataSyncRunning = true;
  
  try {
    const unsyncedResults = await sqliteService.query(
      "SELECT * FROM inventario_mestre WHERE _is_synced = 0 AND _is_deleted = 0 LIMIT 50"
    );
    
    if (unsyncedResults.length === 0) {
      isDataSyncRunning = false;
      return;
    }

    console.log(`[Sync] Sincronizando ${unsyncedResults.length} ativos pendentes...`);
    
    const assets = unsyncedResults as unknown as Asset[];
    const syncedIds = await syncAssetsToCloud(assets);

    if (syncedIds.length > 0) {
      // Marcar como sincronizado no SQLite
      const placeholders = syncedIds.map(() => '?').join(',');
      await sqliteService.execute(
        `UPDATE inventario_mestre SET _is_synced = 1 WHERE id IN (${placeholders})`,
        syncedIds
      );
      console.log(`[Sync] ${syncedIds.length} ativos marcados como sincronizados.`);
      
      // Se sincronizou o lote todo, tenta o próximo imediatamente
      if (syncedIds.length === unsyncedResults.length) {
        isDataSyncRunning = false;
        setTimeout(() => processDataSyncQueue(), 1000);
        return;
      }
    }
  } catch (err) {
    console.error('[Sync] Falha na sincronização de dados:', err);
  } finally {
    isDataSyncRunning = false;
  }
};

/**
 * Retorna o número de ativos aguardando sincronização com a nuvem
 */
export const getUnsyncedAssetsCount = async (): Promise<number> => {
   try {
     const result = await sqliteService.query("SELECT COUNT(*) as total FROM inventario_mestre WHERE _is_synced = 0 AND _is_deleted = 0");
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
 * Processa a fila de sincronização
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
 * Hook/Listener para monitorar a volta da conexão
 */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Sync] Conexão restaurada. Processando filas...');
    processSyncQueue().catch(console.error);
    processDataSyncQueue().catch(console.error);
  });

  // Intervalo de segurança para sincronização de dados (registros)
  // Roda a cada 30 segundos
  setInterval(() => {
    processDataSyncQueue().catch(console.error);
  }, 30000);
}
