/**
 * Acesso ao log de eventos de campo (`field_events`).
 *
 * Só existe `append`: a tabela é só-adição e o Dexie recusa update/delete por
 * hook (`sqliteService`). Ler é por ativo ou por pendentes de sync; quem
 * reconstrói estado é o projetor puro (`fieldProjection`).
 */
import { db } from './sqliteService';
import type { FieldEvent, FieldEventInput } from '../types/fieldEvent';
import { projectAsset, type ProjectedAsset } from './fieldProjection';

/** O evento a gravar: o `lamport` é do aparelho, por isso vem do chamador. */
export type FieldEventDraft = FieldEventInput & { lamport: number };

const novoId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

/** Próximo contador lógico do aparelho, a partir dos eventos que ele já tem. */
export const nextLamport = (events: Pick<FieldEvent, 'lamport'>[]): number =>
  events.reduce((max, event) => Math.max(max, Number(event.lamport) || 0), 0) + 1;

/**
 * Acrescenta um evento. Devolve o registo completo (com `event_id` e `_synced`).
 *
 * Reenviar o mesmo `event_id` é erro do Dexie (chave duplicada) — é assim que a
 * idempotência do sync é garantida do lado local.
 */
export const appendFieldEvent = async (draft: FieldEventDraft): Promise<FieldEvent> => {
  const event: FieldEvent = {
    ...draft,
    tenantid: String(draft.tenantid || '').trim().toUpperCase(),
    filial: String(draft.filial || '').trim(),
    event_id: draft.event_id || novoId(),
    lamport: Number(draft.lamport),
    payload: draft.payload ?? {},
    _synced: 0,
  };
  await db.field_events.add(event);
  return event;
};

/** Eventos de um ativo, em qualquer ordem (o projetor ordena). */
export const eventsForAsset = async (tenantid: string, assetKey: string): Promise<FieldEvent[]> =>
  db.field_events
    .where('[tenantid+asset_key]')
    .equals([String(tenantid || '').trim().toUpperCase(), String(assetKey || '').trim()])
    .toArray();

/** Eventos ainda não confirmados pela nuvem. */
export const unsyncedFieldEvents = async (): Promise<FieldEvent[]> =>
  db.field_events.where('_synced').equals(0).toArray();

/** Estado projetado de um ativo a partir do que está gravado. */
export const projectStoredAsset = async (
  tenantid: string,
  assetKey: string
): Promise<ProjectedAsset | null> => projectAsset(await eventsForAsset(tenantid, assetKey));

/** Marca eventos como confirmados pela nuvem (o único campo que muda). */
export const markFieldEventsSynced = async (eventIds: string[]): Promise<number> => {
  if (eventIds.length === 0) return 0;
  // O hook de só-adição permite esta única transição (`_synced` 0 → 1): o
  // evento em si não muda, só o estado de transporte.
  return db.transaction('rw', db.field_events, async () => {
    let alterados = 0;
    for (const id of eventIds) {
      alterados += await db.field_events.update(id, { _synced: 1 });
    }
    return alterados;
  });
};
