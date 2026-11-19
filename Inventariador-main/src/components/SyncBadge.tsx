import React, { useState, useEffect } from 'react';
import { db } from '../services/sqliteService';
import { syncService, photoSyncManager } from '../services/syncService';
import localforage from 'localforage';
import { AlertTriangle, Cloud, CloudLightning, CloudOff, RefreshCw } from 'lucide-react';
import { logger } from '../utils/logger';

const PHOTO_QUEUE_STORE = 'gbr_photo_sync_queue';

const photoQueueStore = localforage.createInstance({
  name: 'GBR_Audit_v24',
  storeName: PHOTO_QUEUE_STORE
});

export const SyncBadge: React.FC = () => {
  const [pendingData, setPendingData] = useState<number>(0);
  const [pendingPhotos, setPendingPhotos] = useState<number>(0);
  const [failures, setFailures] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  const checkCounters = async () => {
    try {
      // 1. Contador de dados pendentes no Dexie — a MESMA tabela que a fila lê.
      // Contar `ativos` subcontava: a confirmação pelo cartão grava `_is_synced`
      // em `local_assets` e em `ativos` só mexe no `_conferido`, pelo que o botão
      // ficava desactivado («Sincronizado») com trabalho por enviar na fila.
      const pendentes = await db.local_assets.where('_is_synced').equals(0).filter(a => a._is_deleted !== 1).toArray();
      const dataCount = pendentes.length;
      // «Na fila» e «recusado pela nuvem» são estados diferentes: só o carimbo
      // de falha (ver utils/syncFalha) pinta o botão de vermelho.
      const falhas = pendentes.filter(a => !!a._syncFailAt).length;
      
      // 2. Contador de fotos pendentes no IndexedDB
      const photoKeys = await photoQueueStore.keys();
      
      setPendingData(dataCount);
      setFailures(falhas);
      setPendingPhotos(photoKeys.length);
    } catch (err) {
      logger.error("Erro ao ler contadores de sincronização:", err);
    }
  };

  useEffect(() => {
    checkCounters();
    const interval = setInterval(checkCounters, 5000); // Atualiza a cada 5s discretamente

    const handlePhysicalWrite = () => {
      logger.info(">>> [SyncBadge] Reatividade Física SRE acionada. Recalculando contadores...");
      checkCounters();
    };

    window.addEventListener('gbr_physical_write', handlePhysicalWrite);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('gbr_physical_write', handlePhysicalWrite);
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
      logger.error("Falha no disparo manual de sincronização:", err);
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
          : failures > 0
            ? 'bg-red-500/10 border border-red-500/30 text-red-400 animate-pulse cursor-pointer hover:bg-red-500/20'
            : totalPendencies > 0 
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse cursor-pointer hover:bg-amber-500/20'
              : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 cursor-default'
      }`}
    >
      {isSyncing ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      ) : failures > 0 ? (
        <AlertTriangle className="w-3.5 h-3.5" />
      ) : totalPendencies > 0 ? (
        <CloudLightning className="w-3.5 h-3.5 animate-bounce" />
      ) : (
        <Cloud className="w-3.5 h-3.5" />
      )}
      
      <span>
        {isSyncing 
          ? 'Enviando...' 
          : failures > 0
            ? `${failures} falha${failures > 1 ? 's' : ''} de envio`
            : totalPendencies > 0 
              ? `${totalPendencies} pendentes` 
              : 'Sincronizado'}
      </span>
    </button>
  );
};

export default SyncBadge;
