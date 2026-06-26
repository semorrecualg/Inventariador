// src/services/SqliteMutexContext.ts
import { SQLiteDBConnection } from '../types/inventory';

export class SqliteMutexContext {
  private static writeMutex: boolean = false;
  private static transactionQueue: (() => Promise<void>)[] = [];

  /**
   * Envolve e prioriza de forma imperativa transações massivas (Carga Expert Lote 0)
   * sobre chamadas em segundo plano (Background Flush) para evitar falhas físicas no SQLite.
   */
  public static async acquireLock(isHighPriorityBatch: boolean = false): Promise<void> {
    if (this.writeMutex) {
      // Se for carga em lote de alta prioridade, fura a fila e se posiciona no topo
      if (isHighPriorityBatch) {
        return new Promise<void>((resolve) => {
          this.transactionQueue.unshift(async () => {
            this.writeMutex = true;
            resolve();
          });
        });
      }

      // Chamadas normais entram na fila de espera padrão
      return new Promise<void>((resolve) => {
        this.transactionQueue.push(async () => {
          this.writeMutex = true;
          resolve();
        });
      });
    }

    this.writeMutex = true;
  }

  /**
   * Libera o Mutex e processa o próximo bloco pendente da fila de execução.
   */
  public static releaseLock(): void {
    this.writeMutex = false;
    
    if (this.transactionQueue.length > 0) {
      const nextTransaction = this.transactionQueue.shift();
      if (nextTransaction) {
        nextTransaction();
      }
    }
  }

  /**
   * Executa uma declaração SQL garantindo o isolamento atômico do barramento de dados local.
   */
  public static async executeSafeTransaction(
    db: SQLiteDBConnection,
    sql: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: any[],
    isBatch: boolean = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ values: any[] }> {
    await this.acquireLock(isBatch);
    try {
      // Consome estritamente a estrutura canônica { values: any[] } exigida pelo driver local
      const result = await db.query(sql, params);
      return result ?? { values: [] };
    } finally {
      this.releaseLock();
    }
  }
}
