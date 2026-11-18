import { useEffect, useRef } from 'react';
import { syncService, photoSyncManager } from '../services/syncService';
import { isSyncLockStuck } from '../services/syncQueueGuards';
import { shouldRunBackgroundSync } from '../utils/backgroundSync';
import { logger } from '../utils/logger';

/** Cadência do ciclo oculto de sincronização. */
export const BACKGROUND_SYNC_INTERVAL_MS = 60000;

export interface BackgroundSyncUser {
  tenantid?: string | null;
}

/**
 * CICLO OCULTO DE SINCRONIZAÇÃO
 * ============================================================================
 * Vive num hook (e não no corpo do `App`) para poder ser testado com
 * temporizadores falsos: a regressão que aqui se fixa não é de texto, é de
 * comportamento — com o `sessionStorage` vazio (WebView reiniciada no Android)
 * a fila tem de ser chamada na mesma.
 *
 * A filial não entra na barreira: `processDataSyncQueue` resolve a unidade com
 * `readActiveFilial()` (sessão ou `localStorage`) e audita os descartes.
 */
export const useBackgroundSyncTimer = (user: BackgroundSyncUser | null | undefined): void => {
  const isSyncRunningRef = useRef(false);
  const syncCycleStartedAtRef = useRef(0);

  useEffect(() => {
    const triggerBackgroundSync = async () => {
      if (!shouldRunBackgroundSync(user)) {
        return;
      }

      // Watchdog: se o ciclo anterior passou de 2 minutos, a trava ficou presa
      // (pedido sem resposta). Liberta e segue, em vez de ficar mudo para sempre.
      if (isSyncLockStuck(isSyncRunningRef.current, syncCycleStartedAtRef.current)) {
        logger.warn(
          `>>> [Background Sync Watchdog] Ciclo anterior preso há mais de 2 min — libertando a trava (iniciado em ${new Date(syncCycleStartedAtRef.current).toISOString()}).`
        );
        isSyncRunningRef.current = false;
        syncCycleStartedAtRef.current = 0;
      }

      // Se o dispositivo estiver offline ou uma sincronização já estiver ativa, aborta o ciclo
      if (!navigator.onLine || isSyncRunningRef.current) {
        return;
      }

      isSyncRunningRef.current = true;
      syncCycleStartedAtRef.current = Date.now();
      logger.info('>>> [Background Sync] Iniciando ciclo automático de atualização...');

      try {
        // 1. Processa primeiro o lote de metadados de ativos (Até 200 registros por loop)
        const dataResult = await syncService.processDataSyncQueue();

        // 2. Na sequência, processa sequencialmente as imagens pendentes da fila
        const photoResult = await photoSyncManager.processPhotoSyncQueue();

        if (dataResult.processedCount > 0 || photoResult.uploadCount > 0) {
          logger.info(`>>> [Background Sync Completed] Dados: ${dataResult.processedCount}, Fotos: ${photoResult.uploadCount}`);
        }
      } catch (syncError) {
        logger.error('>>> [Background Sync Fail] Erro no agendador oculto:', syncError);
      } finally {
        // Libera a trava para o próximo ciclo de 60 segundos ou evento
        isSyncRunningRef.current = false;
        syncCycleStartedAtRef.current = 0;
      }
    };

    const syncIntervalId = setInterval(triggerBackgroundSync, BACKGROUND_SYNC_INTERVAL_MS);

    // Gatilho reativo: Dispara imediatamente se o auditor sair de uma zona de sombra e o sinal voltar
    const handleNetworkReconnection = () => {
      logger.info('>>> [Network Guard] Conexão restaurada detectada. Forçando sincronização...');
      triggerBackgroundSync();
    };

    window.addEventListener('online', handleNetworkReconnection);

    // Gatilho de retomada: o Android suspende os timers da WebView em segundo
    // plano, então o ciclo de 60 s não corre com o app minimizado — e ao voltar
    // o operador esperava até um minuto sem nada subir. Com o listener, o ciclo
    // roda no instante em que o app volta ao primeiro plano.
    let appStateHandle: { remove: () => Promise<void> } | null = null;
    let disposed = false;
    const registerAppStateListener = async () => {
      try {
        const { App: CapacitorApp } = await import('@capacitor/app');
        const handle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) return;
          logger.info('>>> [Background Sync] App voltou ao primeiro plano: disparando ciclo.');
          triggerBackgroundSync();
        });
        if (disposed) {
          void handle.remove();
        } else {
          appStateHandle = handle;
        }
      } catch (err) {
        // PWA/browser sem plugin nativo: o timer e o evento `online` continuam.
        logger.warn('>>> [Background Sync] appStateChange indisponível nesta plataforma:', err);
      }
    };
    void registerAppStateListener();

    return () => {
      disposed = true;
      clearInterval(syncIntervalId);
      window.removeEventListener('online', handleNetworkReconnection);
      if (appStateHandle) void appStateHandle.remove();
    };
  }, [user]);
};
