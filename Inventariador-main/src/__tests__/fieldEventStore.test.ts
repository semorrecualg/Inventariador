// @vitest-environment node
// ============================================================================
// fieldEventStore.test.ts — `field_events` é só-adição de verdade.
//
// Prova contra IndexedDB (fake-indexeddb): acrescentar funciona; alterar o
// evento é recusado pelo hook do banco; apagar é recusado; e a única exceção —
// marcar `_synced` — passa. É o critério de aceite de F1.1.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { db, AppendOnlyViolation } from '../services/sqliteService';
import {
  appendFieldEvent,
  eventsForAsset,
  markFieldEventsSynced,
  nextLamport,
  projectStoredAsset,
  unsyncedFieldEvents,
} from '../services/fieldEventStore';
import type { FieldEventDraft } from '../services/fieldEventStore';

const rascunho = (over: Partial<FieldEventDraft> = {}): FieldEventDraft => ({
  tenantid: 'cicopal',
  filial: '010101',
  device_id: 'dev-A',
  auditor: 'ana@empresa.com',
  event_type: 'LEITURA',
  asset_key: 'AT-1',
  lamport: 1,
  occurred_at: '2026-11-14T10:00:00.000Z',
  payload: { local: 'BLOCO A' },
  ...over,
});

beforeAll(async () => {
  await db.open();
});

describe('field_events — gravação', () => {
  it('acrescenta com event_id gerado, tenantid canónico e _synced 0', async () => {
    const evento = await appendFieldEvent(rascunho({ asset_key: 'AT-STORE-1' }));

    expect(evento.event_id).toBeTruthy();
    expect(evento.tenantid).toBe('CICOPAL');
    expect(evento._synced).toBe(0);
    expect(await db.field_events.get(evento.event_id)).toMatchObject({ asset_key: 'AT-STORE-1' });
  });

  it('recusa duplicar o mesmo event_id (idempotência local)', async () => {
    await appendFieldEvent(rascunho({ asset_key: 'AT-STORE-2', event_id: 'evt-fixo' }));

    await expect(
      appendFieldEvent(rascunho({ asset_key: 'AT-STORE-2', event_id: 'evt-fixo' }))
    ).rejects.toThrow();
  });

  it('nextLamport devolve o próximo contador do aparelho', () => {
    expect(nextLamport([])).toBe(1);
    expect(nextLamport([{ lamport: 1 }, { lamport: 7 }, { lamport: 3 }])).toBe(8);
  });
});

describe('field_events — só-adição', () => {
  it('alterar o evento é recusado pelo banco', async () => {
    const evento = await appendFieldEvent(rascunho({ asset_key: 'AT-STORE-3' }));

    await expect(
      db.field_events.update(evento.event_id, { payload: { local: 'ADULTERADO' } })
    ).rejects.toBeInstanceOf(AppendOnlyViolation);

    expect(await db.field_events.get(evento.event_id)).toMatchObject({
      payload: { local: 'BLOCO A' },
    });
  });

  it('apagar o evento é recusado pelo banco', async () => {
    const evento = await appendFieldEvent(rascunho({ asset_key: 'AT-STORE-4' }));

    await expect(db.field_events.delete(evento.event_id)).rejects.toBeInstanceOf(AppendOnlyViolation);

    expect(await db.field_events.get(evento.event_id)).toBeTruthy();
  });

  it('a única alteração permitida é marcar _synced', async () => {
    const evento = await appendFieldEvent(rascunho({ asset_key: 'AT-STORE-5' }));

    await expect(markFieldEventsSynced([evento.event_id])).resolves.toBe(1);
    expect(await db.field_events.get(evento.event_id)).toMatchObject({ _synced: 1 });
  });
});

describe('field_events — leitura e projeção', () => {
  it('lê só o ativo pedido e projeta a partir do que está gravado', async () => {
    await appendFieldEvent(rascunho({ asset_key: 'AT-STORE-6', lamport: 1, payload: { local: 'ANTES' } }));
    await appendFieldEvent(
      rascunho({ asset_key: 'AT-STORE-6', lamport: 2, payload: { local: 'DEPOIS' }, event_type: 'DIVERGENCIA' })
    );
    await appendFieldEvent(rascunho({ asset_key: 'AT-OUTRO', tenantid: 'OUTRO' }));

    const eventos = await eventsForAsset('cicopal', 'AT-STORE-6');
    expect(eventos).toHaveLength(2);

    const estado = await projectStoredAsset('CICOPAL', 'AT-STORE-6');
    expect(estado).toMatchObject({
      tenantid: 'CICOPAL',
      asset_key: 'AT-STORE-6',
      _conferido: true,
      _divergencia: true,
      _localMaster: 'DEPOIS',
      _version: 2,
    });
  });

  it('lista os pendentes de sync (só _synced 0)', async () => {
    const evento = await appendFieldEvent(rascunho({ asset_key: 'AT-STORE-7' }));
    const pendentes = await unsyncedFieldEvents();

    expect(pendentes.map(e => e.event_id)).toContain(evento.event_id);
    expect(pendentes.every(e => e._synced === 0)).toBe(true);
  });

  it('projeta nulo quando o ativo não tem eventos', async () => {
    expect(await projectStoredAsset('CICOPAL', 'AT-INEXISTENTE')).toBeNull();
  });
});
