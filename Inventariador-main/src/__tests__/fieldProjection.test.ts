// @vitest-environment node
// ============================================================================
// fieldProjection.test.ts — projetor puro do log de eventos (F1.2/F1.5).
//
// A promessa: o estado de um ativo depende do CONJUNTO de eventos, não da ordem
// em que chegaram. Os casos pequenos fixam a semântica; o teste de propriedade
// (10 mil eventos, duas ordens diferentes) fixa a promessa.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  applyFieldEvent,
  compareFieldEvents,
  projectAsset,
  projectFieldEvents,
  projectionKey,
  sequenceGaps,
  type ProjectedAsset,
} from '../services/fieldProjection';
import type { FieldEvent, FieldEventType } from '../types/fieldEvent';

let seq = 0;
const evento = (over: Partial<FieldEvent> & { event_type: FieldEventType }): FieldEvent => ({
  event_id: over.event_id ?? `evt-${String(++seq).padStart(4, '0')}`,
  tenantid: 'CICOPAL',
  filial: '010101',
  device_id: 'dev-A',
  auditor: 'ana@empresa.com',
  lamport: 1,
  occurred_at: '2026-11-14T10:00:00.000Z',
  payload: {},
  _synced: 0,
  ...over,
});

const doAtivo = (over: Partial<FieldEvent> & { event_type: FieldEventType }) =>
  evento({ asset_key: 'AT-1', ...over });

describe('fieldProjection — semântica por tipo de evento', () => {
  it('LEITURA confere o ativo e grava auditor, hora, local e GPS', () => {
    const estado = projectAsset([
      doAtivo({
        event_type: 'LEITURA',
        payload: { local: 'BLOCO A / SALA 12', gps_lat: -16.6, gps_lng: -49.2 },
      }),
    ])!;

    expect(estado).toMatchObject({
      tenantid: 'CICOPAL',
      asset_key: 'AT-1',
      _conferido: true,
      _divergencia: false,
      _auditor: 'ana@empresa.com',
      _dataLeitura: '2026-11-14T10:00:00.000Z',
      _localMaster: 'BLOCO A / SALA 12',
      gps_lat: -16.6,
      gps_lng: -49.2,
      _version: 1,
    });
  });

  it('DIVERGENCIA confere mas marca o ativo como divergente', () => {
    const estado = projectAsset([
      doAtivo({ event_type: 'DIVERGENCIA', payload: { local: 'BLOCO C' } }),
    ])!;

    expect(estado._conferido).toBe(true);
    expect(estado._divergencia).toBe(true);
    expect(estado._localMaster).toBe('BLOCO C');
  });

  it('ETIQUETA, FOTO e CORRECAO guardam o que mudaram, sem conferir o ativo', () => {
    const estado = projectAsset([
      doAtivo({ event_type: 'ETIQUETA', payload: { etiqueta: 'GBR-0099' } }),
      doAtivo({ event_type: 'FOTO', payload: { foto: 'https://cdn/foto.jpg' }, lamport: 2 }),
      doAtivo({
        event_type: 'CORRECAO',
        payload: { campo: 'endereco', antes: 'BLOCO A', depois: 'BLOCO B' },
        lamport: 3,
      }),
    ])!;

    expect(estado._etiqueta).toBe('GBR-0099');
    expect(estado._foto).toBe('https://cdn/foto.jpg');
    expect(estado._correcoes).toEqual({ endereco: 'BLOCO B' });
    expect(estado._conferido).toBe(false);
    expect(estado._version).toBe(3);
  });

  it('POSSE não mexe no estado do ativo e evento sem asset_key é ignorado', () => {
    expect(projectAsset([evento({ event_type: 'POSSE', territory_key: 'BLOCO A' })])).toBeNull();
    expect(projectAsset([])).toBeNull();
  });

  it('aplica na ordem (lamport, device_id, event_id), não na ordem de chegada', () => {
    const tarde = doAtivo({ event_type: 'LEITURA', lamport: 2, payload: { local: 'DEPOIS' } });
    const cedo = doAtivo({ event_type: 'LEITURA', lamport: 1, payload: { local: 'ANTES' } });

    expect(projectAsset([tarde, cedo])!._localMaster).toBe('DEPOIS');
  });

  it('empate de lamport desempata por aparelho e, no fim, por event_id', () => {
    const b = doAtivo({ event_type: 'LEITURA', lamport: 5, device_id: 'dev-B', payload: { local: 'B' } });
    const a = doAtivo({ event_type: 'LEITURA', lamport: 5, device_id: 'dev-A', payload: { local: 'A' } });
    expect(projectAsset([b, a])!._localMaster).toBe('B');

    const z = doAtivo({ event_type: 'LEITURA', lamport: 5, event_id: 'zzz', payload: { local: 'Z' } });
    const y = doAtivo({ event_type: 'LEITURA', lamport: 5, event_id: 'yyy', payload: { local: 'Y' } });
    expect(projectAsset([z, y])!._localMaster).toBe('Z');
  });

  it('compareFieldEvents ordena exatamente por (lamport, device_id, event_id)', () => {
    const base = doAtivo({ event_type: 'LEITURA', lamport: 2, device_id: 'dev-A', event_id: 'a' });
    const maiorLamport = { ...base, lamport: 3 };
    const mesmoLamportOutroAparelho = { ...base, device_id: 'dev-B' };
    const mesmoAparelhoOutroId = { ...base, event_id: 'b' };

    expect(compareFieldEvents(base, maiorLamport)).toBeLessThan(0);
    expect(compareFieldEvents(base, mesmoLamportOutroAparelho)).toBeLessThan(0);
    expect(compareFieldEvents(base, mesmoAparelhoOutroId)).toBeLessThan(0);
    expect(compareFieldEvents(base, { ...base })).toBe(0);
  });

  it('projeta vários ativos, ordenados por chave, e separa contratos', () => {
    const estados = projectFieldEvents([
      doAtivo({ event_type: 'LEITURA', asset_key: 'AT-2' }),
      doAtivo({ event_type: 'LEITURA', asset_key: 'AT-1' }),
      doAtivo({ event_type: 'LEITURA', asset_key: 'AT-1', tenantid: 'OUTRO' }),
    ]);

    expect(estados.map(e => `${e.tenantid}|${e.asset_key}`)).toEqual([
      'CICOPAL|AT-1',
      'CICOPAL|AT-2',
      'OUTRO|AT-1',
    ]);
    expect(projectionKey({ tenantid: ' cicopal ', asset_key: ' AT-1 ' })).toBe('CICOPAL|AT-1');
  });

  it('sequenceGaps denuncia buraco no contador de um aparelho', () => {
    const eventos = [
      doAtivo({ event_type: 'LEITURA', lamport: 1 }),
      doAtivo({ event_type: 'LEITURA', lamport: 2 }),
      doAtivo({ event_type: 'LEITURA', lamport: 5 }),
      evento({ event_type: 'LEITURA', lamport: 10, device_id: 'dev-B', asset_key: 'AT-2' }),
    ];

    expect(sequenceGaps(eventos)).toEqual([3, 4]);
  });

  it('applyFieldEvent não muta o estado recebido', () => {
    const inicial: ProjectedAsset = {
      tenantid: 'CICOPAL',
      asset_key: 'AT-1',
      _conferido: false,
      _divergencia: false,
      _correcoes: {},
      _version: 0,
    };
    const novo = applyFieldEvent(inicial, doAtivo({ event_type: 'LEITURA' }));

    expect(inicial._version).toBe(0);
    expect(novo._version).toBe(1);
    expect(novo).not.toBe(inicial);
  });
});

// ---------------------------------------------------------------------------
// Propriedade: 10 mil eventos, ordem embaralhada, mesmo estado.
// PRNG determinístico (LCG) — falha reproduzível, sem dependência externa.
// ---------------------------------------------------------------------------
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
};

const embaralhar = <T,>(lista: T[], random: () => number): T[] => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};

const gerarEventos = (total: number): FieldEvent[] => {
  const random = rng(20261114);
  const aparelhos = ['dev-A', 'dev-B', 'dev-C'];
  const tipos: FieldEventType[] = ['LEITURA', 'DIVERGENCIA', 'ETIQUETA', 'FOTO', 'CORRECAO'];
  const lamportPorAparelho = new Map<string, number>();
  const eventos: FieldEvent[] = [];

  for (let i = 0; i < total; i++) {
    const device = aparelhos[Math.floor(random() * aparelhos.length)];
    const lamport = (lamportPorAparelho.get(device) ?? 0) + 1;
    lamportPorAparelho.set(device, lamport);
    const assetKey = `AT-${Math.floor(random() * 40)}`;
    const tipo = tipos[Math.floor(random() * tipos.length)];

    eventos.push(
      evento({
        event_id: `evt-${device}-${lamport}`,
        event_type: tipo,
        device_id: device,
        lamport,
        asset_key: assetKey,
        auditor: random() > 0.5 ? 'ana@empresa.com' : 'bruno@empresa.com',
        payload: {
          local: `BLOCO ${Math.floor(random() * 6)}`,
          gps_lat: -16.6 + random(),
          gps_lng: -49.2 + random(),
          etiqueta: `GBR-${Math.floor(random() * 1000)}`,
          foto: `https://cdn/${i}.jpg`,
          campo: 'endereco',
          depois: `BLOCO ${Math.floor(random() * 6)}`,
        },
      })
    );
  }
  return eventos;
};

const porChave = (estados: ProjectedAsset[]) =>
  new Map(estados.map(estado => [`${estado.tenantid}|${estado.asset_key}`, estado]));

describe('fieldProjection — propriedade (10 mil eventos embaralhados)', () => {
  it('duas ordens de chegada produzem exatamente o mesmo estado', () => {
    const eventos = gerarEventos(10_000);
    const dispositivoA = embaralhar(eventos, rng(7));
    const dispositivoB = embaralhar(eventos, rng(99));

    expect(dispositivoA).not.toEqual(dispositivoB); // a ordem MUDOU de facto
    expect(porChave(projectFieldEvents(dispositivoA))).toEqual(porChave(projectFieldEvents(dispositivoB)));
  });

  it('_version é o número de eventos aplicados, e nenhum evento se perde', () => {
    const eventos = gerarEventos(10_000);
    const estados = projectFieldEvents(embaralhar(eventos, rng(3)));

    const aplicados = estados.reduce((soma, estado) => soma + estado._version, 0);
    expect(aplicados).toBe(eventos.length);
    expect(estados).toHaveLength(new Set(eventos.map(e => e.asset_key)).size);
  });

  it('processar em duas metades (dois aparelhos a sincronizar) dá o mesmo resultado', () => {
    const eventos = gerarEventos(2_000);
    const corte = 1_200;
    const aparelhoA = projectFieldEvents(eventos.slice(0, corte));
    const aparelhoB = projectFieldEvents(embaralhar(eventos.slice(corte), rng(11)));

    // "Sincronizar" = juntar os dois conjuntos e projetar de novo.
    const juntos = porChave(projectFieldEvents([...eventos.slice(0, corte), ...eventos.slice(corte)]));
    const esperado = porChave(projectFieldEvents(eventos));

    expect(juntos).toEqual(esperado);
    expect(aparelhoA.length).toBeGreaterThan(0);
    expect(aparelhoB.length).toBeGreaterThan(0);
  });

  it('a cadeia de eventos não tem buracos quando o contador é contínuo', () => {
    const eventos = gerarEventos(1_000);
    expect(sequenceGaps(eventos)).toEqual([]);
  });
});
