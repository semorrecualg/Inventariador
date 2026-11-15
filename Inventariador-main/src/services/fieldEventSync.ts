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
import { markFieldEventsSynced, unsyncedFieldEvents } from './fieldEventStore';
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
}

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

  for (let i = 0; i < events.length; i += FIELD_EVENTS_CHUNK_SIZE) {
    const chunk = events.slice(i, i + FIELD_EVENTS_CHUNK_SIZE);
    const rows = chunk.map(event => fieldEventRow(event, tenant));
    try {
      const { error } = await client
        .from(FIELD_EVENTS_TABLE)
        .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true });
      if (error) {
        const reason = String(error.message || DEFAULT_REJECTION_REASON);
        chunk.forEach(event => failures.push({ key: fieldEventSyncKey(tenant, event.event_id), reason }));
        logger.warn(`>>> [Field Events] Lote recusado pela nuvem: ${reason}`);
        continue;
      }
      accepted.push(...chunk.map(event => event.event_id));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      chunk.forEach(event => failures.push({ key: fieldEventSyncKey(tenant, event.event_id), reason }));
      logger.warn('>>> [Field Events] Falha de transporte no lote:', err);
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
): Promise<{ synced: string[]; session: SyncSession }> => {
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
): Promise<{ synced: string[]; session: SyncSession | null; pending: number }> => {
  const pendentes = await unsyncedFieldEvents();
  if (pendentes.length === 0) return { synced: [], session: options.session ?? null, pending: 0 };
  const { synced, session } = await pushFieldEventsWithReceipt(pendentes, tenantid, options);
  return { synced, session, pending: pendentes.length };
};
