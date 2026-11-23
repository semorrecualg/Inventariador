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
import { getCurrentTenantid } from '../utils/tenantAtual';
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

/** Lê um campo JSON local sem rebentar com texto livre. */
const lerJson = (valor: string | null | undefined): unknown => {
  if (!valor) return undefined;
  try {
    const parsed = JSON.parse(valor);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Mapeamento local → nuvem, fixado pelo plano de F2:
 * `usuario → user_email`, `acao → action`, `tabela → table_name`,
 * `registro_id → record_id`, `new_data`/`old_data` → as mesmas colunas e
 * `updated_at → created_at`.
 *
 * O `tenantid` do evento vem do **nascimento** (carimbado em `sqliteService` e
 * em `localDb.auditLogs.add`): subir com o contrato activo no momento do envio
 * arquivava em B um evento que aconteceu em A. O `tenantFallback` só serve as
 * linhas antigas, escritas antes deste carimbo existir.
 *
 * `delta` continua a alimentar `new_data` quando a linha é legada — e só nesse
 * caso, porque o `delta` antigo guardava UM estado e perdia o outro.
 */
export const mapearLogParaNuvem = (log: DexieAuditLog, tenantFallback: string | null) => {
  const newData = lerJson(log.new_data) ?? lerJson(log.delta);
  const oldData = lerJson(log.old_data);
  return {
    client_event_id: log.id,
    user_email: log.usuario || '',
    action: log.acao || 'UNKNOWN',
    table_name: log.tabela || '',
    record_id: log.registro_id || '',
    details: log.details || '',
    origin: 'APP',
    tenantid: log.tenantid || tenantFallback,
    // A hora do evento, não a do envio: a trilha tem de dizer QUANDO aconteceu.
    created_at: log.updated_at,
    ...(newData !== undefined ? { new_data: newData } : {}),
    ...(oldData !== undefined ? { old_data: oldData } : {}),
  };
};

/** Quantos eventos ainda não foram confirmados pela nuvem. */
export const contarAuditoriaPendente = async (): Promise<number> =>
  db.audit_logs.filter((log) => log._synced !== 1).count();

/**
 * Retrato do contador remoto da trilha.
 *
 * `off` = a nuvem não foi consultada (BASE LOCAL ou aparelho offline) — não é
 * erro. `ok` = total lido para o contrato. `erro` = a nuvem recusou, o pedido
 * passou do tempo limite, ou não há contrato resolvido (nunca se conta a
 * tabela inteira: a trilha é multi-tenant, e uma contagem global expunha
 * eventos de outro contrato).
 */
export interface ContagemAuditoriaNuvem {
  estado: 'off' | 'ok' | 'erro';
  /** Contrato consultado (normalizado em maiúsculas); `null` sem contrato. */
  tenantid: string | null;
  /** Linhas da trilha na nuvem para o contrato (só quando `estado === 'ok'`). */
  total: number | null;
  message?: string;
}

/**
 * Quantos eventos da trilha do contrato já estão na nuvem.
 *
 * É só leitura (`head: true`, `count: exact`): nenhuma linha é transferida,
 * enviada ou alterada. Serve de contra-prova ao contador «N por subir» — um
 * erro de esquema (por exemplo, a migração `client_event_id` por aplicar)
 * aparece carimbado aqui, em vez de deixar o operador sem saber se subiu.
 */
export const contarAuditoriaNuvem = async (
  tenantid?: string | null
): Promise<ContagemAuditoriaNuvem> => {
  const tenant = String(tenantid ?? getCurrentTenantid() ?? '').trim().toUpperCase();

  if (!canPushToCloud() || !supabase) {
    return {
      estado: 'off',
      tenantid: tenant || null,
      total: null,
      message: 'BASE LOCAL — a nuvem não é consultada.'
    };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { estado: 'off', tenantid: tenant || null, total: null, message: 'Aparelho sem conexão.' };
  }
  if (!tenant) {
    return {
      estado: 'erro',
      tenantid: null,
      total: null,
      message: 'Sem contrato resolvido — a contagem não é global.'
    };
  }

  try {
    const resposta = await Promise.race([
      supabase
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('tenantid', tenant),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AUDIT_COUNT_TIMEOUT')), TEMPO_LIMITE_ENVIO_MS)
      ),
    ]);

    const erro = (resposta as { error?: { message?: string } | null }).error;
    if (erro) {
      return {
        estado: 'erro',
        tenantid: tenant,
        total: null,
        message: erro.message || 'Falha ao contar a trilha na nuvem.'
      };
    }
    const total = (resposta as { count?: number | null }).count ?? 0;
    return { estado: 'ok', tenantid: tenant, total };
  } catch (err) {
    return {
      estado: 'erro',
      tenantid: tenant,
      total: null,
      message: err instanceof Error ? err.message : String(err)
    };
  }
};

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

    // Fallback só para linhas legadas, sem contrato carimbado no nascimento.
    const tenantFallback = getCurrentTenantid() || null;
    const payload = pendentes.map((log) => mapearLogParaNuvem(log, tenantFallback));

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
