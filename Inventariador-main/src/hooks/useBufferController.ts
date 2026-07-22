import { useState, useEffect, useCallback, useRef } from "react";
import { sqliteService } from "../services/sqliteService";

/** Tamanho máximo do buffer antes de disparar auto-flush */
export const BUFFER_MAX_SIZE = 50;

export interface BufferStatus {
  pendingCount: number;
  isFlushing: boolean;
  flush: () => Promise<void>;
}

/**
 * Hook de controle estritamente tipado para o Buffer Atômico ("Regra dos 5")
 *
 * - Polling a cada 1s para monitorar o buffer de alterações de campo
 * - Auto-flush quando pendingCount >= BUFFER_MAX_SIZE
 * - Guard de concorrência: não dispara auto-flush enquanto já estiver flusheando
 */
export function useBufferController(): BufferStatus {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isFlushing, setIsFlushing] = useState<boolean>(false);
  const isFlushingRef = useRef(false);

  // Sincroniza a ref com o estado para evitar stale closures no efeito de auto-flush
  useEffect(() => {
    isFlushingRef.current = isFlushing;
  }, [isFlushing]);

  // Polling: monitora o buffer a cada 1s
  useEffect(() => {
    const updateCount = () => {
      setPendingCount(sqliteService.getBufferedChangesCount());
    };

    updateCount();
    const interval = setInterval(updateCount, 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-flush: quando pendingCount atinge o limite, dispara flush automaticamente
  useEffect(() => {
    if (pendingCount >= BUFFER_MAX_SIZE && !isFlushingRef.current) {
      flushInternal();
    }
  }, [pendingCount]);

  // Função interna de flush, chamada tanto pelo auto-flush quanto pelo flush manual
  const flushInternal = useCallback(async () => {
    if (isFlushingRef.current) return;
    setIsFlushing(true);
    isFlushingRef.current = true;
    try {
      await sqliteService.flushFieldChanges();
      setPendingCount(0);
    } catch (err) {
      console.error(">>> [useBufferController] Erro ao realizar flush:", err);
    } finally {
      setIsFlushing(false);
      isFlushingRef.current = false;
    }
  }, []);

  // flush manual exposto via interface
  const flush = useCallback(async () => {
    await flushInternal();
  }, [flushInternal]);

  return { pendingCount, isFlushing, flush };
}
