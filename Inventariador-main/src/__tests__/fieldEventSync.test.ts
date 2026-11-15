// @vitest-environment jsdom
// ============================================================================
// fieldEventSync.test.ts — o log de campo sobe para a nuvem.
//
// Prova o contrato completo: upsert idempotente por `event_id`, lotes de 500,
// `_synced` só depois da confirmação, e contadores de eventos no MESMO recibo
// do ciclo — sem poluir os contadores de ativos.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { db } from '../services/sqliteService';
import {
  appendFieldEvent,
  quarantinedFieldEvents,
  releaseQuarantinedFieldEvent,
  unsyncedFieldEvents,
} from '../services/fieldEventStore';
import {
  FIELD_EVENTS_CHUNK_SIZE,
  ehFalhaDeRede,
  fieldEventRow,
  flushFieldEvents,
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
          // 'upstream 502' não é falta de rede do aparelho: o lote falhou, mas
          // os eventos individuais podem passar.
          if (linhas.length > 1) throw new Error('upstream 502');
          return { error: null };
        },
      }),
    };

    const { accepted, failures, interrupted } = await syncFieldEventsCore(eventos, TENANT, client);

    expect(chamadasFeitas).toBe(4);
    expect(accepted).toEqual(eventos.map(e => e.event_id));
    expect(failures).toEqual([]);
    expect(interrupted).toBeUndefined();
  });

  it('sem rede no lote não tenta os 500 um a um', async () => {
    const eventos = Array.from({ length: FIELD_EVENTS_CHUNK_SIZE }, () => evento());
    let chamadas = 0;
    const client: FieldEventClient = {
      from: () => ({
        upsert: async () => {
          chamadas += 1;
          // O `fetch` sem transporte rejeita com TypeError — é a forma que
          // identifica rede, não a mensagem.
          throw new TypeError('Failed to fetch');
        },
      }),
    };

    const { accepted, failures, interrupted } = await syncFieldEventsCore(eventos, TENANT, client);

    // 1 pedido e ponto: insistir nos 500 só acumulava timeouts no aparelho.
    expect(chamadas).toBe(1);
    expect(accepted).toEqual([]);
    expect(failures).toEqual([]);
    expect(interrupted).toBe('rede');
  });

  it('a rede a cair no meio do recuo para o resto do lote', async () => {
    const eventos = Array.from({ length: 5 }, () => evento());
    let chamadasFeitas = 0;
    const client: FieldEventClient = {
      from: () => ({
        upsert: async linhas => {
          chamadasFeitas += 1;
          if (linhas.length > 1) return { error: { message: 'permission denied' } };
          if (chamadasFeitas >= 4) throw new TypeError('Failed to fetch');
          return { error: null };
        },
      }),
    };

    const { accepted, failures, interrupted } = await syncFieldEventsCore(eventos, TENANT, client);

    // 1 lote + 3 individuais (o 3.º cai) e para: os 2 últimos nem são tentados.
    expect(chamadasFeitas).toBe(4);
    expect(accepted).toEqual(eventos.slice(0, 2).map(e => e.event_id));
    expect(failures).toEqual([]);
    expect(interrupted).toBe('rede');
  });

  it('aparelho offline não faz pedido nenhum', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { chamadas, client } = clienteFalso();

    const { interrupted } = await syncFieldEventsCore([evento()], TENANT, client);

    expect(chamadas).toHaveLength(0);
    expect(interrupted).toBe('rede');
    onLine.mockRestore();
  });

  it('evento em colisão de chave única sai da fila (quarentena)', async () => {
    const store = memoria();
    const envenenado = await appendFieldEvent({ ...evento(), event_id: `${TENANT}-poison`, lamport: 1 });
    const bom = await appendFieldEvent({ ...evento(), event_id: `${TENANT}-bom`, lamport: 2 });
    const { client } = clienteFalso(linhas =>
      linhas.some(linha => linha.event_id === envenenado.event_id) ? VIOLACAO_UNICA : null
    );
    const run = (events: FieldEvent[], tenant?: string) => syncFieldEventsCore(events, tenant, client);

    const { session } = await pushFieldEventsWithReceipt(await unsyncedFieldEvents(), TENANT, {
      store,
      run,
    });

    expect(session.receipt?.fieldEvents).toMatchObject({ sent: 2, accepted: 1, rejected: 1 });
    // O bom ficou marcado; o envenenado não foi mentido como sincronizado.
    expect((await db.field_events.get(bom.event_id))?._synced).toBe(1);
    expect((await db.field_events.get(envenenado.event_id))?._synced).toBe(0);

    const quarentena = await quarantinedFieldEvents();
    const posto = quarentena.find(item => item.event_id === envenenado.event_id);
    expect(posto).toMatchObject({ tenantid: TENANT, lamport: 1, reason: VIOLACAO_UNICA });
    // O evento inteiro fica guardado, não só o id.
    expect(posto?.event.payload.local).toBe('BLOCO A');

    // Não volta a ser enviado no ciclo seguinte.
    const filaDoContrato = async () =>
      (await unsyncedFieldEvents()).filter(e => e.tenantid === TENANT).map(e => e.event_id);
    expect(await filaDoContrato()).toEqual([]);
    let enviadosNoCicloSeguinte: string[] = [];
    await flushFieldEvents(TENANT, {
      store,
      run: async (events: FieldEvent[]) => {
        enviadosNoCicloSeguinte = events.map(e => e.event_id);
        return { accepted: [], failures: [] };
      },
    });
    expect(enviadosNoCicloSeguinte).toEqual([]);

    // Devolver à fila é explícito: o evento volta a ser candidato ao envio.
    expect(await releaseQuarantinedFieldEvent(envenenado.event_id)).toBe(true);
    expect(await filaDoContrato()).toEqual([envenenado.event_id]);
    expect(await quarantinedFieldEvents()).toEqual([]);
    expect(await releaseQuarantinedFieldEvent('nao-existe')).toBe(true);
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

describe('ehFalhaDeRede — classificação estrutural', () => {
  it('reconhece o que É rede', () => {
    expect(ehFalhaDeRede(new TypeError('Failed to fetch'))).toBe(true);
    expect(ehFalhaDeRede({ name: 'AbortError' })).toBe(true);
    expect(ehFalhaDeRede({ name: 'TimeoutError' })).toBe(true);
  });

  it('um timeout do Postgres não é aparelho offline', () => {
    // O Postgres desistir da query chega como ERRO DEVOLVIDO, com mensagem que
    // fala em timeout — o que a heurística antiga lia como rede.
    expect(
      ehFalhaDeRede({ message: 'canceling statement due to statement timeout', code: '57014' })
    ).toBe(false);
    expect(ehFalhaDeRede(new Error('canceling statement due to statement timeout'))).toBe(false);
  });

  it('erros sem forma de transporte ficam como conteúdo', () => {
    expect(ehFalhaDeRede(new Error('permission denied'))).toBe(false);
    expect(ehFalhaDeRede(null)).toBe(false);
    expect(ehFalhaDeRede(undefined)).toBe(false);
  });
});

describe('recuo e rede — detalhe do desfecho', () => {
  it('timeout do Postgres não interrompe: o lote é desmontado e cada evento fica recusado', async () => {
    const eventos = Array.from({ length: 3 }, () => evento());
    const { chamadas, client } = clienteFalso(() => 'canceling statement due to statement timeout');

    const { accepted, failures, interrupted } = await syncFieldEventsCore(eventos, TENANT, client);

    expect(interrupted).toBeUndefined();
    expect(chamadas).toHaveLength(4); // 1 lote + 3 individuais
    expect(accepted).toEqual([]);
    expect(failures).toHaveLength(3);
    expect(failures[0].reason).toContain('statement timeout');
  });
});

describe('pushFieldEventsWithReceipt — confirmação antes da marca', () => {
  it('sem rede devolve interrupção e deixa a sessão aberta', async () => {
    const store = memoria();
    await appendFieldEvent({ ...evento(), event_id: `${TENANT}-net`, lamport: 1 });

    const client: FieldEventClient = {
      from: () => ({
        upsert: async () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    };
    const resultado = await pushFieldEventsWithReceipt(await unsyncedFieldEvents(), TENANT, {
      store,
      run: (events, tenant) => syncFieldEventsCore(events, tenant, client),
    });

    expect(resultado.interrupted).toBe('rede');
    expect(resultado.synced).toEqual([]);
    expect(resultado.session.failed).toBe(true);
    expect((await db.field_events.get(`${TENANT}-net`))?._synced).toBe(0);
    // O evento continua na fila: falta de rede não é recusa. (A fila é global;
    // filtrar pelo contrato do teste evita ler sobras de casos anteriores.)
    const fila = await unsyncedFieldEvents();
    expect(fila.filter(e => e.tenantid === TENANT).map(e => e.event_id)).toEqual([`${TENANT}-net`]);
  });

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
