// @vitest-environment jsdom
// ============================================================================
// fieldEventSync.test.ts — o log de campo sobe para a nuvem.
//
// Prova o contrato completo: upsert idempotente por `event_id`, lotes de 500,
// `_synced` só depois da confirmação, e contadores de eventos no MESMO recibo
// do ciclo — sem poluir os contadores de ativos.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../services/sqliteService';
import { appendFieldEvent, unsyncedFieldEvents } from '../services/fieldEventStore';
import {
  FIELD_EVENTS_CHUNK_SIZE,
  fieldEventRow,
  pushFieldEventsWithReceipt,
  syncFieldEventsCore,
  type FieldEventClient,
} from '../services/fieldEventSync';
import {
  checksumOf,
  endSyncCycle,
  formatReceipt,
  listSyncSessions,
  openSyncSession,
  type SyncSessionStore,
} from '../services/syncSessionService';
import type { FieldEvent } from '../types/fieldEvent';

let TENANT = 'CICOPAL';
let seqTenant = 0;

const memoria = (): SyncSessionStore => {
  const dados = new Map<string, unknown>();
  return {
    getItem: async <T>(key: string) => ((dados.get(key) as T) ?? null),
    setItem: async <T>(key: string, value: T) => {
      dados.set(key, value);
      return value;
    },
    removeItem: async (key: string) => {
      dados.delete(key);
    },
  };
};

const evento = (over: Partial<FieldEvent> = {}): FieldEvent => ({
  event_id: `evt-${Math.random().toString(36).slice(2, 12)}`,
  tenantid: TENANT,
  filial: '010101',
  device_id: 'dev-teste',
  auditor: 'ana@empresa.com',
  event_type: 'LEITURA',
  asset_key: 'AT-C1',
  lamport: 1,
  occurred_at: new Date().toISOString(),
  payload: { local: 'BLOCO A' },
  _synced: 0,
  ...over,
});

/**
 * Cliente falso: regista as chamadas e responde com o erro que a regra mandar.
 *
 * A regra recebe as linhas enviadas — é assim que se simula a violação da chave
 * única `(tenantid, device_id, lamport)`: o statement inteiro falha quando o
 * evento envenenado vai no lote, e falha sozinho quando vai só ele.
 */
const clienteFalso = (falhar?: (linhas: Record<string, unknown>[]) => string | null) => {
  const chamadas: { tabela: string; linhas: Record<string, unknown>[]; opcoes: Record<string, unknown> }[] = [];
  const client: FieldEventClient = {
    from(tabela: string) {
      return {
        upsert: async (linhas, opcoes) => {
          chamadas.push({ tabela, linhas, opcoes });
          const motivo = falhar?.(linhas) ?? null;
          return motivo ? { error: { message: motivo } } : { error: null };
        },
      };
    },
  };
  return { chamadas, client };
};

const VIOLACAO_UNICA = 'duplicate key value violates unique constraint "field_events_device_lamport_unico"';

beforeAll(async () => {
  await db.open();
});

beforeEach(() => {
  TENANT = `CICOPAL${++seqTenant}`;
});

describe('syncFieldEventsCore — upsert idempotente', () => {
  it('envia em lotes de 500 com onConflict event_id e ignoreDuplicates', async () => {
    const eventos = Array.from({ length: FIELD_EVENTS_CHUNK_SIZE * 2 + 200 }, () => evento());
    const { chamadas, client } = clienteFalso();

    const { accepted, failures } = await syncFieldEventsCore(eventos, TENANT, client);

    expect(chamadas.map(c => c.linhas.length)).toEqual([
      FIELD_EVENTS_CHUNK_SIZE,
      FIELD_EVENTS_CHUNK_SIZE,
      200,
    ]);
    for (const chamada of chamadas) {
      expect(chamada.tabela).toBe('field_events');
      expect(chamada.opcoes).toEqual({ onConflict: 'event_id', ignoreDuplicates: true });
    }
    expect(accepted).toHaveLength(eventos.length);
    expect(failures).toEqual([]);
  });

  it('um evento que viola a chave única não prende o lote inteiro', async () => {
    const eventos = Array.from({ length: 10 }, () => evento());
    const envenenado = eventos[4];
    // O Postgres recusa o statement todo quando uma linha colide — mesmo que as
    // outras 9 estivessem boas. Sem o recuo, este lote seria recusado para sempre.
    const { client } = clienteFalso(linhas =>
      linhas.some(linha => linha.event_id === envenenado.event_id) ? VIOLACAO_UNICA : null
    );

    const { accepted, failures } = await syncFieldEventsCore(eventos, TENANT, client);

    expect(accepted).toHaveLength(9);
    expect(accepted).not.toContain(envenenado.event_id);
    expect(failures).toEqual([
      { key: `${TENANT}|${envenenado.event_id}`, reason: VIOLACAO_UNICA },
    ]);
  });

  it('o recuo é um só nível: o lote falha e os 500 seguem um a um', async () => {
    const eventos = Array.from({ length: FIELD_EVENTS_CHUNK_SIZE }, () => evento());
    const { chamadas, client } = clienteFalso(() => VIOLACAO_UNICA);

    const { accepted, failures } = await syncFieldEventsCore(eventos, TENANT, client);

    // 1 tentativa em lote + 1 por evento: nada de reenviar o lote outra vez.
    expect(chamadas).toHaveLength(1 + FIELD_EVENTS_CHUNK_SIZE);
    expect(chamadas[0].linhas).toHaveLength(FIELD_EVENTS_CHUNK_SIZE);
    expect(chamadas.slice(1).every(c => c.linhas.length === 1)).toBe(true);
    expect(accepted).toEqual([]);
    expect(failures).toHaveLength(FIELD_EVENTS_CHUNK_SIZE);
  });

  it('falha de transporte no lote também recai para evento a evento', async () => {
    const eventos = Array.from({ length: 3 }, () => evento());
    let chamadasFeitas = 0;
    const client: FieldEventClient = {
      from: () => ({
        upsert: async linhas => {
          chamadasFeitas += 1;
          if (linhas.length > 1) throw new Error('fetch failed');
          return { error: null };
        },
      }),
    };

    const { accepted, failures } = await syncFieldEventsCore(eventos, TENANT, client);

    expect(chamadasFeitas).toBe(4);
    expect(accepted).toEqual(eventos.map(e => e.event_id));
    expect(failures).toEqual([]);
  });

  it('sem contrato não envia nada e diz porquê', async () => {
    const { chamadas, client } = clienteFalso();

    await expect(syncFieldEventsCore([evento({ tenantid: '' })], '', client)).rejects.toThrow(/Contrato ausente/);
    expect(chamadas).toHaveLength(0);
  });

  it('a linha enviada não leva `_synced` nem inventa colunas', () => {
    const linha = fieldEventRow(evento({ lamport: 7 }), ' cicopal ');

    expect(linha).toMatchObject({ tenantid: 'CICOPAL', lamport: 7, event_type: 'LEITURA' });
    expect(linha).not.toHaveProperty('_synced');
  });
});

describe('pushFieldEventsWithReceipt — confirmação antes da marca', () => {
  it('marca `_synced = 1` só nos eventos que a nuvem aceitou', async () => {
    const store = memoria();
    const primeiro = await appendFieldEvent({ ...evento(), event_id: `${TENANT}-a`, lamport: 1 });
    await appendFieldEvent({ ...evento(), event_id: `${TENANT}-b`, lamport: 2 });

    await pushFieldEventsWithReceipt([primeiro], TENANT, {
      store,
      auditor: 'ana@empresa.com',
      run: async events => ({ accepted: events.map(e => e.event_id), failures: [] }),
    });

    const noBanco = await db.field_events.where('[tenantid+asset_key]').equals([TENANT, 'AT-C1']).toArray();
    expect(noBanco.find(e => e.event_id === primeiro.event_id)?._synced).toBe(1);
    expect(noBanco.find(e => e.event_id !== primeiro.event_id)?._synced).toBe(0);
  });

  it('falha de transporte deixa tudo pendente e a sessão aberta para retomada', async () => {
    const store = memoria();
    await appendFieldEvent({ ...evento(), event_id: `${TENANT}-c`, lamport: 1 });
    const pendentes = await unsyncedFieldEvents();

    await expect(
      pushFieldEventsWithReceipt(pendentes, TENANT, {
        store,
        run: async () => {
          throw new Error('rede caiu');
        },
      })
    ).rejects.toThrow('rede caiu');

    const guardado = await db.field_events.get(`${TENANT}-c`);
    expect(guardado?._synced).toBe(0);
    const [sessao] = await listSyncSessions({ store });
    expect(sessao.status).toBe('OPEN');
    expect(sessao.failed).toBe(true);
  });

  it('não reenvia o que a mesma sessão já aceitou', async () => {
    const store = memoria();
    const a = evento({ event_id: `${TENANT}-i1` });
    const b = evento({ event_id: `${TENANT}-i2` });
    const enviados: string[][] = [];
    const run = async (events: FieldEvent[]) => {
      enviados.push(events.map(e => e.event_id));
      return { accepted: events.map(e => e.event_id), failures: [] };
    };

    // Mesma sessão (ciclo aberto): a idempotência é do ciclo. Uma chamada
    // isolada fecha a sessão e liberta os ids, por isso as duas rodadas aqui
    // vivem dentro de um ciclo — o caso real do push principal.
    const ciclo = await openSyncSession({ tenantid: TENANT, auditor: 'ana', store });
    const { session } = await pushFieldEventsWithReceipt([a], TENANT, { store, run, session: ciclo });
    await pushFieldEventsWithReceipt([a, b], TENANT, { store, run, session });

    expect(enviados).toEqual([[a.event_id], [b.event_id]]);
  });

  it('o recibo do ciclo conta eventos em separado dos ativos', async () => {
    const store = memoria();
    const sessao = await openSyncSession({ tenantid: TENANT, auditor: 'ana', store });
    const eventos = [evento({ event_id: `${TENANT}-r1` }), evento({ event_id: `${TENANT}-r2` })];

    const { session } = await pushFieldEventsWithReceipt(eventos, TENANT, {
      store,
      session: sessao,
      run: async events => ({ accepted: events.map(e => e.event_id), failures: [] }),
    });

    // Em ciclo a sessão NÃO fecha: quem fecha é o `endSyncCycle`, após o pull.
    expect(session.status).toBe('OPEN');
    expect(session.receipt ?? null).toBeNull();

    const fechada = await endSyncCycle(session, store);
    expect(fechada.status).toBe('COMPLETED');
    expect(fechada.receipt?.accepted).toBe(0);
    expect(fechada.receipt?.fieldEvents).toEqual({
      sent: 2,
      accepted: 2,
      rejected: 0,
      checksum: checksumOf(eventos.map(e => e.event_id)),
    });
  });

  it('recusa com motivo chega ao recibo e o evento continua pendente', async () => {
    const store = memoria();
    await appendFieldEvent({ ...evento(), event_id: `${TENANT}-x`, lamport: 1 });

    const { session } = await pushFieldEventsWithReceipt(await unsyncedFieldEvents(), TENANT, {
      store,
      run: async events => ({
        accepted: [],
        failures: [{ key: `${TENANT}|${events[0].event_id}`, reason: 'RLS bloqueou o insert' }],
      }),
    });

    expect(session.receipt?.fieldEvents).toMatchObject({ sent: 1, accepted: 0, rejected: 1 });
    expect(formatReceipt(session)).toContain('eventos 0/1');
    expect((await db.field_events.get(`${TENANT}-x`))?._synced).toBe(0);
  });
});
