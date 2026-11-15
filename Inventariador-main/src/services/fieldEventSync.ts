/**
 * Envio do log de campo para a nuvem (`field_events`).
 *
 * O log nasce no aparelho e morre no aparelho se ninguém o subir: reinstalar a
 * app, limpar dados ou trocar de telemóvel apagava a trilha de conferência sem
 * deixar rasto. Este módulo é a cópia independente.
 *
 * Contrato, igual ao dos ativos:
 *
 *   1. `upsert` por `event_id` com `ignoreDuplicates` — reenviar não duplica
 *      nem falha, o que torna a retomada de um ciclo seguro;
 *   2. `_synced = 1` SÓ depois de a nuvem confirmar (nunca por otimismo);
 *   3. o ciclo vive na mesma sessão/recibo dos ativos, com contadores próprios:
 *      eventos não são ativos e não podem poluir `accepted`/`missing`.
 */
import { logger } from '../utils/logger';
import type { FieldEvent } from '../types/fieldEvent';
import { supabase } from './supabaseService';
import {
  markFieldEventsSynced,
  quarantineFieldEvents,
  unsyncedFieldEvents,
} from './fieldEventStore';
import {
  DEFAULT_REJECTION_REASON,
  finalizeSyncSession,
  markSyncSessionFailed,
  openSyncSession,
  registerFieldEventsAccepted,
  registerFieldEventsRejected,
  type SyncSession,
  type SyncSessionStore,
} from './syncSessionService';

/** Tabela na nuvem (DDL em `docs/supabase_field_events.sql`). */
export const FIELD_EVENTS_TABLE = 'field_events';
/** Mesmo tamanho de lote do espelhamento de ativos. */
export const FIELD_EVENTS_CHUNK_SIZE = 500;

export interface FieldEventSyncFailure {
  /** Chave composta `tenant|event_id`, como nas recusas de ativos. */
  key: string;
  reason: string;
}

export interface FieldEventSyncResult {
  accepted: string[];
  failures: FieldEventSyncFailure[];
  /**
   * A rodada parou por falta de rede. Os eventos que sobraram NÃO são recusas:
   * continuam pendentes e voltam quando o aparelho tiver sinal.
   */
  interrupted?: 'rede';
}

/**
 * Falha de transporte, não de conteúdo. Num aparelho offline, insistir nos 500
 * eventos é acumular timeouts para receber sempre o mesmo erro de rede.
 */
export const ehFalhaDeRede = (reason: string): boolean =>
  /fetch failed|failed to fetch|load failed|network|networkerror|net::|econn|timed? ?out|abort|offline|internet/i.test(
    String(reason || '')
  );

/** Colisão na chave única do Postgres (evento que já existe noutro estado). */
export const ehViolacaoDeChaveUnica = (reason: string): boolean =>
  /duplicate key|unique constraint|23505/i.test(String(reason || ''));

/**
 * Cliente mínimo (só o que é usado). Permite fixar desfechos nos testes sem
 * cliente Supabase — o mesmo padrão de `AssetSyncRun`.
 */
export interface FieldEventClient {
  from(table: string): {
    upsert(
      rows: Record<string, unknown>[],
      options: { onConflict: string; ignoreDuplicates: boolean }
    ): PromiseLike<{ error: { message?: string } | null }>;
  };
}

/** Chave estável de recusa, no mesmo formato de `assetSyncKey`. */
export const fieldEventSyncKey = (tenantid: string, eventId: string): string =>
  `${String(tenantid || '').trim().toUpperCase()}|${String(eventId || '').trim()}`;

/**
 * Linha enviada à nuvem. `_synced` NÃO vai: é estado de transporte do aparelho,
 * e uma coluna a mais no Postgres seria uma coluna a divergir do log.
 */
export const fieldEventRow = (event: FieldEvent, tenantid?: string): Record<string, unknown> => ({
  event_id: String(event.event_id || '').trim(),
  tenantid: String(tenantid || event.tenantid || '').trim().toUpperCase(),
  filial: String(event.filial || 'GERAL').trim(),
  device_id: String(event.device_id || '').trim(),
  auditor: String(event.auditor || 'desconhecido').trim(),
  event_type: event.event_type,
  asset_key: event.asset_key ?? null,
  territory_key: event.territory_key ?? null,
  lamport: Number(event.lamport) || 0,
  occurred_at: event.occurred_at,
  payload: event.payload ?? {},
  prev_hash: event.prev_hash ?? null,
  hash: event.hash ?? null,
});

/**
 * Envia os eventos em lotes de 500, por `upsert` idempotente.
 *
 * Um lote que falha não invalida os anteriores: o que a nuvem aceitou fica
 * aceito e o resto segue pendente para a próxima rodada.
 */
export const syncFieldEventsCore = async (
  events: FieldEvent[],
  tenantid?: string,
  client: FieldEventClient = supabase as unknown as FieldEventClient
): Promise<FieldEventSyncResult> => {
  const accepted: string[] = [];
  const failures: FieldEventSyncFailure[] = [];
  if (events.length === 0) return { accepted, failures };

  const tenant = String(tenantid || events[0]?.tenantid || '').trim().toUpperCase();
  if (!tenant || tenant === 'UNDEFINED' || tenant === 'NULL') {
    throw new Error('Sessão Expirada: Contrato ausente para envio do log de campo.');
  }

  // Offline conhecido: nem tenta. Cada pedido aqui seria um timeout.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { accepted, failures, interrupted: 'rede' };
  }

  const enviar = (rows: Record<string, unknown>[]) =>
    client
      .from(FIELD_EVENTS_TABLE)
      .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true });

  for (let i = 0; i < events.length; i += FIELD_EVENTS_CHUNK_SIZE) {
    const chunk = events.slice(i, i + FIELD_EVENTS_CHUNK_SIZE);
    try {
      const { error } = await enviar(chunk.map(event => fieldEventRow(event, tenant)));
      if (!error) {
        accepted.push(...chunk.map(event => event.event_id));
        continue;
      }
      const reason = String(error.message || DEFAULT_REJECTION_REASON);
      // Lote sem rede: não há culpado a isolar, há um aparelho sem sinal.
      if (ehFalhaDeRede(reason)) {
        logger.warn(`>>> [Field Events] Lote sem rede (${reason}); restam ${chunk.length} pendentes.`);
        return { accepted, failures, interrupted: 'rede' };
      }
      logger.warn(
        `>>> [Field Events] Lote de ${chunk.length} recusado (${reason}); ` +
          'reenviando evento a evento para isolar o culpado.'
      );
    } catch (err) {
      const motivo = err instanceof Error ? err.message : String(err);
      if (ehFalhaDeRede(motivo)) {
        logger.warn('>>> [Field Events] Transporte caiu no lote; nada foi provado, parando aqui.');
        return { accepted, failures, interrupted: 'rede' };
      }
      logger.warn('>>> [Field Events] Falha no lote; reenviando evento a evento:', err);
    }

    // UM evento mau (ex.: colisão em `(tenantid, device_id, lamport)`) reprovava
    // o lote inteiro em todas as rodadas: 500 eventos presos para sempre por
    // causa de um. Aqui o lote é desmontado: quem passa, passa; quem falha fica
    // identificado com o motivo, e só ele volta na próxima.
    for (const event of chunk) {
      const key = fieldEventSyncKey(tenant, event.event_id);
      try {
        const { error } = await enviar([fieldEventRow(event, tenant)]);
        if (error) {
          const motivo = String(error.message || DEFAULT_REJECTION_REASON);
          if (ehFalhaDeRede(motivo)) {
            // A rede caiu no meio: os que ainda não foram tentados continuam
            // pendentes (não são recusas) e o resto do lote não é tentado.
            logger.warn('>>> [Field Events] Rede caiu no envio individual; parando o recuo.');
            return { accepted, failures, interrupted: 'rede' };
          }
          failures.push({ key, reason: motivo });
          continue;
        }
        accepted.push(event.event_id);
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        if (ehFalhaDeRede(motivo)) {
          logger.warn('>>> [Field Events] Transporte caiu no envio individual:', err);
          return { accepted, failures, interrupted: 'rede' };
        }
        failures.push({ key, reason: motivo });
      }
    }
  }

  return { accepted, failures };
};

export interface PushFieldEventsOptions {
  /** Sessão do ciclo em curso (envio de ativos + pull). */
  session?: SyncSession;
  store?: SyncSessionStore;
  auditor?: string;
  filial?: string;
  now?: number;
  run?: typeof syncFieldEventsCore;
}

/**
 * Envia o log dentro de uma sessão com recibo.
 *
 * Fora de um ciclo abre e fecha a sua própria sessão; dentro do ciclo grava na
 * sessão recebida e NÃO fecha — quem fecha é `endSyncCycle`, depois do pull.
 */
export const pushFieldEventsWithReceipt = async (
  events: FieldEvent[],
  tenantid: string | undefined,
  options: PushFieldEventsOptions = {}
): Promise<{ synced: string[]; session: SyncSession; interrupted?: 'rede' }> => {
  const store = options.store;
  const tenant = String(tenantid || events[0]?.tenantid || '').trim().toUpperCase();
  const filial =
    options.filial ||
    events[0]?.filial ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('filial') || undefined : undefined) ||
    'GERAL';

  const cycle = options.session;
  const inCycle = Boolean(cycle && cycle.tenantid === tenant);
  const session =
    (inCycle ? cycle : null) ??
    (await openSyncSession({
      tenantid: tenant,
      filial,
      auditor: options.auditor,
      store,
      now: options.now,
    }));

  // IDEMPOTÊNCIA: não reenviar o que ESTA sessão já teve aceito.
  const jaAceitos = new Set(session.fieldEvents?.acceptedIds ?? []);
  const pendentes = events.filter(event => !jaAceitos.has(event.event_id));
  if (pendentes.length === 0) {
    if (!inCycle) await finalizeSyncSession(session, store);
    return { synced: [], session };
  }

  let result: FieldEventSyncResult;
  try {
    result = await (options.run ?? syncFieldEventsCore)(pendentes, tenant);
  } catch (err) {
    // Rede cortada: a sessão fica ABERTA para retomada, como no envio de ativos.
    await markSyncSessionFailed(session, store);
    logger.warn('>>> [Field Events] Envio interrompido; sessão mantida aberta:', err);
    throw err;
  }

  // Marca localmente SÓ o que a nuvem confirmou. Se a marcação falhar, o evento
  // volta na próxima rodada — o upsert idempotente não cria duplicata.
  if (result.accepted.length > 0) {
    try {
      await markFieldEventsSynced(result.accepted);
    } catch (markErr) {
      logger.warn('>>> [Field Events] Aceitos na nuvem mas falhou a marcação local:', markErr);
    }
  }

  await registerFieldEventsAccepted(session, result.accepted, store);
  await registerFieldEventsRejected(
    session,
    result.failures.map(item => ({ key: item.key, reason: item.reason })),
    store
  );

  // Um evento que colide na chave única é recusado em TODAS as rodadas: reenviá-lo
  // a cada ciclo gasta rede e nunca muda o desfecho. Sai da fila, com o evento
  // inteiro guardado para quem for corrigir a causa.
  const porChave = new Map(pendentes.map(event => [fieldEventSyncKey(tenant, event.event_id), event]));
  const paraQuarentena = result.failures
    .filter(item => ehViolacaoDeChaveUnica(item.reason))
    .map(item => ({ event: porChave.get(item.key), reason: item.reason }))
    .filter((item): item is { event: FieldEvent; reason: string } => Boolean(item.event));
  if (paraQuarentena.length > 0) {
    try {
      const postos = await quarantineFieldEvents(paraQuarentena);
      logger.warn(`>>> [Field Events] ${postos} evento(s) em quarentena por chave única.`);
    } catch (err) {
      logger.warn('>>> [Field Events] Falha ao pôr eventos em quarentena:', err);
    }
  }

  if (result.interrupted) {
    // Sem rede a sessão fica ABERTA: o que faltou volta na próxima rodada.
    // Devolve a versão persistida — é ela que carrega `failed`, e o chamador
    // mostra o estado a partir do objecto devolvido, não do que ficou em disco.
    const falhada = await markSyncSessionFailed(session, store);
    return { synced: result.accepted, session: falhada, interrupted: 'rede' };
  }

  if (!inCycle) await finalizeSyncSession(session, store);
  return { synced: result.accepted, session };
};

/**
 * Um passo: sobe o que está pendente no aparelho. Devolve quantos eventos a
 * nuvem confirmou — o chamador usa isto para decidir se vale mostrar recibo.
 */
export const flushFieldEvents = async (
  tenantid: string | undefined,
  options: PushFieldEventsOptions = {}
): Promise<{ synced: string[]; session: SyncSession | null; pending: number; interrupted?: 'rede' }> => {
  const pendentes = await unsyncedFieldEvents();
  if (pendentes.length === 0) return { synced: [], session: options.session ?? null, pending: 0 };
  const { synced, session, interrupted } = await pushFieldEventsWithReceipt(pendentes, tenantid, options);
  return { synced, session, pending: pendentes.length, interrupted };
};
