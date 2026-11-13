/**
 * Guardas da fila de sincronização.
 *
 * Extraídas do `syncService`/`App` para poderem ser testadas sem Dexie nem
 * temporizadores reais. Resolvem três falhas observadas em campo (2026-11-12,
 * filial 010101 CICOPAL GO): 15 de 45 ativos subiram à nuvem e os 45 ficaram
 * "PENDENTE NUVEM", porque um pedido ao Supabase sem limite de tempo pendurou o
 * ciclo e a trava `isSyncRunningRef` nunca foi libertada.
 */

/** Tempo máximo de UM pedido ao Supabase antes de contar como falha. */
export const UPSERT_TIMEOUT_MS = 15000;

/** Acima disto, um ciclo em andamento é considerado preso (trava esquecida). */
export const SYNC_CYCLE_STUCK_MS = 120000;

export class SyncRequestTimeoutError extends Error {
  constructor(ms: number) {
    super(`Tempo esgotado (${ms} ms) ao falar com a nuvem.`);
    this.name = 'SyncRequestTimeoutError';
  }
}

/**
 * Corre `promise` com limite de tempo. Sem isto um `fetch` pendurado (troca
 * 4G→5G, tela bloqueada) congela a fila inteira para sempre.
 */
export const withUpsertTimeout = async <T>(
  promise: PromiseLike<T>,
  ms: number = UPSERT_TIMEOUT_MS
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new SyncRequestTimeoutError(ms)), ms);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/**
 * A trava do ciclo está presa? Só se o ciclo diz estar a correr E o registo de
 * início é antigo o bastante. `startedAt = 0` significa "sem ciclo iniciado".
 */
export const isSyncLockStuck = (
  running: boolean,
  startedAt: number,
  now: number = Date.now(),
  stuckAfterMs: number = SYNC_CYCLE_STUCK_MS
): boolean => {
  if (!running || !startedAt) return false;
  // Relógio que anda para trás nunca deve libertar a trava.
  if (now < startedAt) return false;
  return now - startedAt > stuckAfterMs;
};
