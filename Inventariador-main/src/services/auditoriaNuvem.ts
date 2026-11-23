/**
 * FILA DA TRILHA DE AUDITORIA PARA A NUVEM (F2)
 * ============================================================================
 * Em Base Oficial, `logAuditEvent` escrevia direto no Supabase com um timeout
 * de 2 s e, se a rede falhasse, só deixava uma linha no log técnico: o evento
 * de auditoria perdia-se. A trilha local (`audit_logs` do Dexie) passa a ser o
 * destino durável — todo o evento é gravado no aparelho e sobe depois por esta
 * fila, em lotes, com retry.
 *
 * IDEMPOTÊNCIA: cada evento leva `client_event_id` = `id` local (estável). O
 * envio é um `upsert` por essa coluna, por isso reenviar o mesmo lote não
 * duplica linhas na nuvem. A coluna e o índice único estão em
 * `docs/supabase_bootstrap.sql`; sem a migração aplicada o envio falha, a
 * linha fica na fila com o erro carimbado e o contador do Gestor mostra o
 * atraso — nada é apagado nem dado como enviado.
 */
import { supabase } from './supabaseService';
import { canPushToCloud } from './pushGate';
import { db, type DexieAuditLog } from './sqliteService';
import { getCurrentTenantid } from './localDbService';
import { logger } from '../utils/logger';

/** Eventos por lote — o mesmo porte das cargas (`DatabaseLoaderService`). */
export const LOTE_AUDITORIA = 200;
/** Tempo máximo de um lote antes de a tentativa ser dada por falhada. */
export const TEMPO_LIMITE_ENVIO_MS = 8000;

export interface ResultadoFilaAuditoria {
  success: boolean;
  /** Eventos confirmados pela nuvem nesta passagem. */
  enviados: number;
  /** Eventos que ficaram na fila nesta passagem. */
  falhados: number;
  /** Eventos ainda por subir depois da passagem (só conta). */
  pendentes?: number;
  error?: string;
}

/** Lê o `delta` local (JSON) sem rebentar com texto livre. */
const lerDelta = (delta: string | null): unknown => {
  if (!delta) return undefined;
  try {
    const parsed = JSON.parse(delta);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Mapeamento local → nuvem, fixado pelo plano de F2:
 * `usuario → user_email`, `acao → action`, `tabela → table_name`,
 * `registro_id → record_id`, `delta → new_data`, `updated_at → created_at`.
 *
 * `tenantid` é resolvido no envio, a partir do contrato activo: o registo
 * local não guarda o contrato, e o ciclo só corre com sessão escolhida.
 */
export const mapearLogParaNuvem = (log: DexieAuditLog, tenantid: string | null) => {
  const newData = lerDelta(log.delta);
  return {
    client_event_id: log.id,
    user_email: log.usuario || '',
    action: log.acao || 'UNKNOWN',
    table_name: log.tabela || '',
    record_id: log.registro_id || '',
    details: log.details || '',
    origin: 'APP',
    tenantid,
    // A hora do evento, não a do envio: a trilha tem de dizer QUANDO aconteceu.
    created_at: log.updated_at,
    ...(newData !== undefined ? { new_data: newData } : {}),
  };
};

/** Quantos eventos ainda não foram confirmados pela nuvem. */
export const contarAuditoriaPendente = async (): Promise<number> =>
  db.audit_logs.filter((log) => log._synced !== 1).count();

const marcarEnviados = async (ids: string[]): Promise<void> => {
  await db.transaction('rw', db.audit_logs, async () => {
    for (const id of ids) {
      await db.audit_logs.update(id, { _synced: 1, _syncError: null });
    }
  });
};

const marcarFalha = async (logs: DexieAuditLog[], mensagem: string): Promise<void> => {
  const erro = mensagem.slice(0, 300);
  await db.transaction('rw', db.audit_logs, async () => {
    for (const log of logs) {
      await db.audit_logs.update(log.id, {
        _syncError: erro,
        _syncAttempts: (log._syncAttempts ?? 0) + 1,
      });
    }
  });
};

/**
 * Envia um lote da trilha local para a nuvem.
 *
 * Devolve sempre um resultado (nunca lança): o ciclo de fundo não pode morrer
 * por causa da trilha, e uma falha tem de deixar a linha na fila com o motivo.
 */
export const enviarFilaAuditoria = async (): Promise<ResultadoFilaAuditoria> => {
  if (!canPushToCloud() || !supabase) {
    return { success: true, enviados: 0, falhados: 0 };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, enviados: 0, falhados: 0, error: 'Dispositivo em modo Offline' };
  }

  try {
    const pendentes = await db.audit_logs
      .filter((log) => log._synced !== 1)
      .limit(LOTE_AUDITORIA)
      .toArray();

    if (pendentes.length === 0) {
      return { success: true, enviados: 0, falhados: 0, pendentes: 0 };
    }

    const tenantid = getCurrentTenantid() || null;
    const payload = pendentes.map((log) => mapearLogParaNuvem(log, tenantid));

    const resposta = await Promise.race([
      supabase.from('audit_logs').upsert(payload, { onConflict: 'client_event_id' }),
      new Promise<{ error: { message: string } }>((_, reject) =>
        setTimeout(() => reject(new Error('AUDIT_PUSH_TIMEOUT')), TEMPO_LIMITE_ENVIO_MS)
      ),
    ]).catch((err: unknown) => ({
      error: { message: err instanceof Error ? err.message : String(err) }
    }));

    const erro = (resposta as { error?: { message?: string } | null }).error;
    if (erro) {
      const mensagem = erro.message || 'Falha ao enviar a trilha.';
      await marcarFalha(pendentes, mensagem);
      logger.warn(`>>> [Auditoria] ${pendentes.length} evento(s) ficaram na fila:`, mensagem);
      return { success: false, enviados: 0, falhados: pendentes.length, error: mensagem };
    }

    await marcarEnviados(pendentes.map((log) => log.id));
    logger.info(`>>> [Auditoria] ${pendentes.length} evento(s) da trilha confirmados na nuvem.`);
    return {
      success: true,
      enviados: pendentes.length,
      falhados: 0,
      pendentes: await contarAuditoriaPendente()
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('>>> [Auditoria] Falha inesperada na fila da trilha:', msg);
    return { success: false, enviados: 0, falhados: 0, error: msg };
  }
};
