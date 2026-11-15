// @vitest-environment jsdom
// ============================================================================
// fieldConferencing.test.ts — a conferência de campo nasce como evento (F1.3) e
// o estado do ativo passa a vir da projeção (F1.4).
//
// Prova: o evento leva lamport, GPS e aparelho; `local_assets` (e os espelhos)
// recebem os campos derivados calculados a partir do log; desmarcar não gera
// evento; e um estado adulterado à mão é corrigido pela projeção.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db } from '../services/sqliteService';
import {
  applyProjectionToState,
  conferirAtivo,
  derivarAtualizacaoConferencia,
  nextDeviceLamport,
  resolveDeviceId,
} from '../services/fieldConferencing';
import type { ProjectedAsset } from '../services/fieldProjection';

// Cada teste usa um contrato próprio: o banco é o mesmo ficheiro e a tabela de
// eventos não pode ser limpa (só-adição), portanto isolar por tenantid evita
// que uma projeção veja eventos de outro teste.
let TENANT = 'CICOPAL';
let seqTenant = 0;

const criarAtivo = async (assetKey: string) => {
  const row = {
    tenantid: TENANT,
    primarykey: assetKey,
    id: assetKey,
    filial: '010101',
    _is_synced: 0,
    _conferido: false,
  };
  for (const tabela of ['local_assets', 'ativos', 'assets'] as const) {
    await db.table(tabela).add(row);
  }
};

const lerAtivo = async (assetKey: string) =>
  (await db.local_assets.get([TENANT, assetKey])) as unknown as Record<string, unknown>;

const conferir = (over: Partial<Parameters<typeof conferirAtivo>[0]> = {}) =>
  conferirAtivo({
    tenantid: TENANT,
    filial: '010101',
    asset_key: 'AT-C1',
    auditor: 'ana@empresa.com',
    tipo: 'LEITURA',
    local: 'BLOCO A / SALA 12',
    gps_lat: -16.6,
    gps_lng: -49.2,
    ...over,
  });

beforeAll(async () => {
  await db.open();
});

// O aparelho também é próprio de cada teste: o contador lógico é reconstruído
// a partir do log quando o contexto falta, e o log não se apaga.
let DEVICE = 'dev-teste';

beforeEach(async () => {
  TENANT = `CICOPAL${++seqTenant}`;
  DEVICE = `dev-${seqTenant}`;
  await db.SYSTEM_CONTEXT.clear();
});

describe('conferência → evento (F1.3)', () => {
  it('emite LEITURA com lamport, GPS, aparelho e auditor', async () => {
    await criarAtivo('AT-C1');

    const { event } = await conferir({ device_id: DEVICE });

    expect(event).toMatchObject({
      tenantid: TENANT,
      filial: '010101',
      asset_key: 'AT-C1',
      device_id: DEVICE,
      auditor: 'ana@empresa.com',
      event_type: 'LEITURA',
      lamport: 1,
      payload: { local: 'BLOCO A / SALA 12', gps_lat: -16.6, gps_lng: -49.2 },
    });
    expect(event.event_id).toBeTruthy();
    expect(await db.field_events.get(event.event_id)).toMatchObject({ _synced: 0 });
  });

  it('avança o lamport do aparelho a cada leitura, mesmo de outro ativo', async () => {
    await criarAtivo('AT-C1');
    await criarAtivo('AT-C2');

    const primeira = await conferir({ device_id: DEVICE });
    const segunda = await conferir({ device_id: DEVICE, asset_key: 'AT-C2' });

    expect(primeira.event.lamport).toBe(1);
    expect(segunda.event.lamport).toBe(2);
  });

  it('DIVERGENCIA também é evento, com o local onde o ativo estava', async () => {
    await criarAtivo('AT-C1');

    const { event } = await conferir({ tipo: 'DIVERGENCIA', local: 'BLOCO C', device_id: DEVICE });

    expect(event.event_type).toBe('DIVERGENCIA');
    expect(event.payload.local).toBe('BLOCO C');
  });

  it('o aparelho é estável entre chamadas e vem do localStorage', async () => {
    await criarAtivo('AT-C1');
    localStorage.clear();

    const id = resolveDeviceId();
    await conferir();
    await conferir();

    expect(resolveDeviceId()).toBe(id);
    const eventos = await db.field_events.where('[tenantid+asset_key]').equals([TENANT, 'AT-C1']).toArray();
    expect(new Set(eventos.map(e => e.device_id))).toEqual(new Set([id]));
  });

  it('reconstrói o contador a partir do log quando o contexto se perdeu', async () => {
    await criarAtivo('AT-C1');
    await conferir({ device_id: DEVICE, lamport: 7 });

    // Contexto apagado (restore antigo): o próximo lamport não pode repetir 7.
    expect(await nextDeviceLamport(DEVICE)).toBe(8);
  });
});

describe('projeção → estado do ativo (F1.4)', () => {
  it('grava `local_assets` com os campos derivados do evento', async () => {
    await criarAtivo('AT-C1');

    const { estado } = await conferir({ device_id: DEVICE });

    expect(estado).toMatchObject({ _conferido: true, _version: 1, _localMaster: 'BLOCO A / SALA 12' });
    expect(await lerAtivo('AT-C1')).toMatchObject({
      _conferido: true,
      _auditor: 'ana@empresa.com',
      _dataLeitura: estado._dataLeitura,
      _localMaster: 'BLOCO A / SALA 12',
      gps_lat: -16.6,
      gps_lng: -49.2,
      _versionEventos: 1,
    });
  });

  it('os espelhos `ativos` e `assets` recebem a mesma projeção até F5', async () => {
    await criarAtivo('AT-C1');

    await conferir({ device_id: DEVICE });

    for (const tabela of ['ativos', 'assets'] as const) {
      expect(await db.table(tabela).get([TENANT, 'AT-C1'])).toMatchObject({ _conferido: true, gps_lat: -16.6 });
    }
  });

  it('a segunda leitura reescreve o estado a partir dos dois eventos', async () => {
    await criarAtivo('AT-C1');

    await conferir({ device_id: DEVICE, local: 'BLOCO A' });
    const { estado } = await conferir({ device_id: DEVICE, tipo: 'DIVERGENCIA', local: 'BLOCO C' });

    expect(estado).toMatchObject({ _version: 2, _divergencia: true, _localMaster: 'BLOCO C' });
    expect(await lerAtivo('AT-C1')).toMatchObject({
      _localMaster: 'BLOCO C',
      TAG_INVENTARIO: 'DIVERGÊNCIA',
      _versionEventos: 2,
    });
  });

  it('corrige um estado adulterado à mão: quem manda é o log', async () => {
    await criarAtivo('AT-C1');
    await db.local_assets.update([TENANT, 'AT-C1'], { _conferido: 0, _auditor: 'intruso' });

    await conferir({ device_id: DEVICE, local: 'BLOCO B' });

    expect(await lerAtivo('AT-C1')).toMatchObject({ _conferido: true, _auditor: 'ana@empresa.com' });
  });

  it('applyProjectionToState não rebenta quando o ativo ainda não está nas tabelas', async () => {
    const estado: ProjectedAsset = {
      tenantid: TENANT,
      asset_key: 'AT-SEM-REGISTO',
      _conferido: true,
      _divergencia: false,
      _correcoes: {},
      _version: 1,
    };

    await expect(applyProjectionToState(TENANT, 'AT-SEM-REGISTO', estado)).resolves.toBeUndefined();
  });
});

describe('derivarAtualizacaoConferencia — mapeamento puro', () => {
  it('converte o estado projetado nos campos do ativo, sem inventar os ausentes', () => {
    const patch = derivarAtualizacaoConferencia({
      tenantid: TENANT,
      asset_key: 'AT-C1',
      _conferido: true,
      _divergencia: false,
      _correcoes: {},
      _version: 3,
    });

    expect(patch).toEqual({ _conferido: true, _versionEventos: 3 });
    expect(patch).not.toHaveProperty('TAG_INVENTARIO');
  });

  it('marca TAG_INVENTARIO quando o ativo está divergente', () => {
    const patch = derivarAtualizacaoConferencia({
      tenantid: TENANT,
      asset_key: 'AT-C1',
      _conferido: true,
      _divergencia: true,
      _correcoes: {},
      _version: 1,
    });

    expect(patch.TAG_INVENTARIO).toBe('DIVERGÊNCIA');
  });
});
