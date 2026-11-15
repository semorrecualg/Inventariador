/**
 * Isolamento de lote do espelhamento para a nuvem.
 *
 * Quando um lote inteiro falha (ex.: uma coluna que o schema remoto não tem), o
 * caminho normal desiste das 500 linhas. Aqui cada linha é reenviada sozinha,
 * em pequenas ondas, para separar o que é válido do que o Postgres recusou — e
 * com o motivo real de cada recusa, não um erro genérico do lote.
 *
 * Módulo puro: o transporte entra como função (`send`), o que permite cobrir os
 * três desfechos — aceite, chave duplicada (23505) e recusa com motivo — sem
 * rede nem cliente Supabase.
 */

/** Recusa de uma linha, com a chave de origem e o motivo devolvido pelo banco. */
export interface BatchRowFailure {
  key: string;
  reason: string;
}

export interface BatchIsolationResult {
  /** Chaves locais aceites (inclui as que já existiam com 23505). */
  accepted: string[];
  failures: BatchRowFailure[];
}

/** Erro do PostgREST/Supabase em texto legível, sem perder código nem dica. */
export const describeSyncError = (err: unknown): string => {
  if (!err) return 'erro desconhecido';
  if (err instanceof Error) return err.message;
  const e = err as { code?: string; message?: string; details?: string; hint?: string };
  const parts = [
    e.code ? `[${e.code}]` : '',
    e.message || '',
    e.details ? `detalhe: ${e.details}` : '',
    e.hint ? `dica: ${e.hint}` : '',
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  try {
    return JSON.stringify(err);
  } catch {
    return 'erro sem detalhe legível';
  }
};

/** Chave de origem de uma linha; o `primarykey` é a chave, o id é o último recurso. */
export const rowKeyOf = (row: Record<string, unknown>, localKey?: string): string => {
  const pk = row.primarykey;
  const vazia = pk === undefined || pk === null || String(pk).trim() === '';
  return String(vazia ? (localKey ?? '') : pk);
};

/** Código de unicidade do Postgres: a linha já está lá, logo está aceite. */
const UNIQUE_VIOLATION = '23505';

export interface IsolateBatchOptions {
  /** Linhas como foram enviadas no lote (payload já montado). */
  rows: Record<string, unknown>[];
  /** Chave local de cada linha, na mesma ordem de `rows`. */
  keys: string[];
  /** Transporte de uma linha. Lançar é a forma de recusar. */
  send: (rows: Record<string, unknown>[]) => Promise<void>;
  /** Linhas em voo por onda. O lote só falha uma vez, portanto é caminho raro. */
  concurrency?: number;
  /** Tradutor de erro; nos testes permite fixar o texto sem depender do formato. */
  describe?: (err: unknown) => string;
}

export const isolateBatchRows = async ({
  rows,
  keys,
  send,
  concurrency = 8,
  describe = describeSyncError,
}: IsolateBatchOptions): Promise<BatchIsolationResult> => {
  const accepted: string[] = [];
  const failures: BatchRowFailure[] = [];

  for (let start = 0; start < rows.length; start += concurrency) {
    const rowSlice = rows.slice(start, start + concurrency);
    await Promise.all(
      rowSlice.map(async (row, i) => {
        const localKey = keys[start + i];
        try {
          await send([row]);
          accepted.push(localKey);
        } catch (rowErr: unknown) {
          // 23505 em `assets_tenant_primarykey_key`: a chave de origem já está
          // na nuvem (com id anterior) — o ativo está sincronizado, não recusado.
          if ((rowErr as { code?: string }).code === UNIQUE_VIOLATION) {
            accepted.push(localKey);
            return;
          }
          failures.push({ key: rowKeyOf(row, localKey), reason: describe(rowErr) });
        }
      })
    );
  }

  return { accepted, failures };
};
