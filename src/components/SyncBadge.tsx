import React, { useState, useEffect } from 'react';
import { sqliteService } from '../services/sqliteService';
import { syncService, photoSyncManager } from '../services/syncService';
import localforage from 'localforage';
import { Cloud, CloudLightning, CloudOff, RefreshCw } from 'lucide-react';

const PHOTO_QUEUE_STORE = 'gbr_photo_sync_queue';

const photoQueueStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: PHOTO_QUEUE_STORE
});

export const SyncBadge: React.FC = () => {
  const [pendingData, setPendingData] = useState<number>(0);
  const [pendingPhotos, setPendingPhotos] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const checkCounters = async () => {
    try {
      // 1. Contador de dados pendentes no SQLite
      const dataRes = await sqliteService.query("SELECT COUNT(*) as total FROM ativos WHERE _is_synced = 0 AND _is_deleted = 0");
      const dataCount = dataRes && dataRes.length > 0 ? Number(dataRes[0]?.total || 0) : 0;
      
      // 2. Contador de fotos pendentes no IndexedDB
      const photoKeys = await photoQueueStore.keys();
      
      setPendingData(dataCount);
      setPendingPhotos(photoKeys.length);
    } catch (err) {
      console.error("Erro ao ler contadores de sincronização:", err);
    }
  };

  useEffect(() => {
    checkCounters();
    const interval = setInterval(checkCounters, 5000); // Atualiza a cada 5s discretamente

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const forceSync = async () => {
    if (isSyncing || !navigator.onLine) return;
    setIsSyncing(true);
    try {
      // Dispara as duas filas sequencialmente em background
      await syncService.processDataSyncQueue();
      await photoSyncManager.processPhotoSyncQueue();
      await checkCounters();
    } catch (err) {
      console.error("Falha no disparo manual de sincronização:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const totalPendencies = pendingData + pendingPhotos;

  if (!isOnline) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-xs font-bold uppercase tracking-wider">
        <CloudOff className="w-3.5 h-3.5" />
        <span>Offline</span>
      </div>
    );
  }

  return (
    <button 
      onClick={forceSync}
      disabled={isSyncing || totalPendencies === 0}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all active:scale-95 ${
        isSyncing 
          ? 'bg-accent/10 border border-accent/30 text-accent cursor-not-allowed'
          : totalPendencies > 0 
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse cursor-pointer hover:bg-amber-500/20'
            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-default'
      }`}
    >
      {isSyncing ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      ) : totalPendencies > 0 ? (
        <CloudLightning className="w-3.5 h-3.5 animate-bounce" />
      ) : (
        <Cloud className="w-3.5 h-3.5" />
      )}
      
      <span>
        {isSyncing 
          ? 'Enviando...' 
          : totalPendencies > 0 
            ? `${totalPendencies} pendentes` 
            : 'Sincronizado'}
      </span>
    </button>
  );
};

export default SyncBadge;
