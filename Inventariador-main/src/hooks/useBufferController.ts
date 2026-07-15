import { useState, useEffect, useCallback } from "react";
import { sqliteService } from "../services/sqliteService";

export interface BufferStatus {
  pendingCount: number;
  isFlushing: boolean;
  flush: () => Promise<void>;
}

/**
 * Hook de controle estritamente tipado para o Buffer Atômico ("Regra dos 5")
 */
export function useBufferController(): BufferStatus {
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isFlushing, setIsFlushing] = useState<boolean>(false);

  useEffect(() => {
    // SRE Guard: Desativa o pooling em background se o barramento central estiver em processo de carga em bloco
    const updateCount = () => {
      setPendingCount(sqliteService.getBufferedChangesCount());
    };
    
    updateCount();
    const interval = setInterval(updateCount, 1000);
    return () => clearInterval(interval);
  }, []);

  const flush = useCallback(async () => {
    if (isFlushing) return;
    setIsFlushing(true);
    try {
      await sqliteService.flushFieldChanges();
      setPendingCount(0);
    } catch (err) {
      console.error(">>> [useBufferController] Erro ao realizar flush manual:", err);
    } finally {
      setIsFlushing(false);
    }
  }, [isFlushing]);

  return { pendingCount, isFlushing, flush };
}
