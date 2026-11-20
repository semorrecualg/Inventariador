// @vitest-environment jsdom
// ============================================================================
// deltaPullDecisaoLocal.test.ts — no delta, só a decisão local volta ao disco.
//
// O delta é o pull do dia a dia: a nuvem manda as linhas alteradas desde o
// checkpoint e o download já as gravou nos três espelhos. O que não pode
// acontecer é reescrever a base inteira por causa delas. `mergeDeltaPull`
// devolve, além do estado remontado, a lista `decisaoLocal` — as únicas linhas
// que o pull manda a `persistAssetsBatch`.
//
// Este ficheiro fixa as duas metades: a regra (quem vence, quem entra na lista)
// e o disco (depois do delta, as linhas da nuvem que não têm decisão local
// continuam exactamente como o download as deixou).
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

import { db, sqliteService } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { mergeDeltaPull } from '../utils/mergeDeltaPull';
import type { Asset } from '../types';

const NUVEM = '2026-11-18T08:00:00.000Z';
const APARELHO = '2026-11-20T09:30:00.000Z';

const ativo = (over: Record<string, unknown> = {}): Asset =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'P',
    _is_synced: 1,
    ...over
  }) as unknown as Asset;

const guardado = async (key: string): Promise<DexieAsset | undefined> =>
  (await db.local_assets.where('primarykey').equals(key).first()) as DexieAsset | undefined;

describe('mergeDeltaPull — quem volta ao disco', () => {
  it('linha da nuvem sem decisão local não entra na escrita', () => {
    const local = ativo({ descricaodoativo: 'igual' });
    const nuvem = ativo({ descricaodoativo: 'novo da nuvem' });

    const { assets, decisaoLocal } = mergeDeltaPull({
      prevAssets: [local],
      cloudAssets: [nuvem],
      dirtyIds: []
    });

    expect(decisaoLocal).toEqual([]);
    expect(assets[0].descricaodoativo).toBe('novo da nuvem');
  });

  it('a leitura de GPS local mais recente vence e é a única a regravar', () => {
    const local = ativo({
      latitude: -15.79,
      longitude: -47.88,
      _gps_source: 'sensor',
      _gps_at: APARELHO,
      _dataLeitura: APARELHO
    });
    const nuvem = ativo({
      latitude: -15.7,
      longitude: -47.9,
      _gps_source: 'sensor',
      _gps_at: NUVEM,
      _dataLeitura: NUVEM
    });

    const { assets, decisaoLocal } = mergeDeltaPull({
      prevAssets: [local],
      cloudAssets: [nuvem],
      dirtyIds: []
    });

    expect(decisaoLocal).toHaveLength(1);
    expect(decisaoLocal[0].latitude).toBe(-15.79);
    expect(assets[0].latitude).toBe(-15.79);
  });

  it('GPS da nuvem mais recente: o ponto desce e nada é reescrito', () => {
    const local = ativo({ latitude: -15.7, _gps_at: NUVEM, _dataLeitura: NUVEM });
    const nuvem = ativo({ latitude: -15.79, _gps_at: APARELHO, _dataLeitura: APARELHO });

    const { decisaoLocal } = mergeDeltaPull({
      prevAssets: [local],
      cloudAssets: [nuvem],
      dirtyIds: []
    });

    expect(decisaoLocal).toEqual([]);
  });

  it('edição por enviar que veio no delta é regravada por cima da nuvem', () => {
    const local = ativo({ descricaodoativo: 'editado no aparelho', _is_synced: 0 });
    const nuvem = ativo({ descricaodoativo: 'versão da nuvem' });

    const { assets, decisaoLocal } = mergeDeltaPull({
      prevAssets: [local],
      cloudAssets: [nuvem],
      dirtyIds: ['PK-1']
    });

    expect(assets[0].descricaodoativo).toBe('editado no aparelho');
    expect(decisaoLocal).toHaveLength(1);
    expect(Number(decisaoLocal[0]._is_synced)).toBe(0);
  });

  it('pendência que não veio no delta não é regravada (já está no disco)', () => {
    const local = ativo({ id: 'PK-2', primarykey: 'PK-2', _is_synced: 0 });
    const nuvem = ativo({ id: 'PK-3', primarykey: 'PK-3' });

    const { assets, decisaoLocal } = mergeDeltaPull({
      prevAssets: [local],
      cloudAssets: [nuvem],
      dirtyIds: ['PK-2']
    });

    expect(assets.map(a => a.id)).toEqual(['PK-2', 'PK-3']);
    expect(decisaoLocal).toEqual([]);
  });
});

describe('delta — depois do merge, só a decisão local toca o disco', () => {
  beforeEach(async () => {
    for (const tabela of [db.ativos, db.assets, db.local_assets]) await tabela.clear();
  });

  it('as 200 linhas da nuvem ficam como o download as gravou; 2 voltam ao disco', async () => {
    // Base local de 200 ativos, como se o último pull a tivesse deixado.
    const base = Array.from({ length: 200 }, (_, i) =>
      ativo({
        id: `PK-${i}`,
        primarykey: `PK-${i}`,
        etiqueta: String(i).padStart(6, '0'),
        descricaodoativo: `local ${i}`,
        _is_synced: 1
      })
    );
    await sqliteService.bulkInsertAssetsOfflineFirst(base as never, undefined, { markSynced: true });

    // O delta traz duas linhas: uma com GPS do aparelho mais recente, outra com
    // edição por enviar. O resto do lote (198) não muda.
    const cloudDelta = [
      ativo({ id: 'PK-1', primarykey: 'PK-1', descricaodoativo: 'nuvem 1', _gps_at: NUVEM, _dataLeitura: NUVEM }),
      ativo({ id: 'PK-2', primarykey: 'PK-2', descricaodoativo: 'nuvem 2' })
    ];
    const estadoLocal = base.map(a =>
      a.id === 'PK-1'
        ? { ...a, latitude: -15.79, longitude: -47.88, gps_lat: -15.79, gps_lng: -47.88, _gps_source: 'sensor', _gps_at: APARELHO, _dataLeitura: APARELHO }
        : a.id === 'PK-2'
          ? { ...a, descricaodoativo: 'editado no aparelho', _is_synced: 0 }
          : a
    );

    // O download grava o delta (comportamento de fetchFullInventory).
    await sqliteService.bulkInsertAssetsOfflineFirst(cloudDelta as never, undefined, { markSynced: true });

    const { decisaoLocal } = mergeDeltaPull({
      prevAssets: estadoLocal,
      cloudAssets: cloudDelta,
      dirtyIds: ['PK-2']
    });

    expect(decisaoLocal.map(a => a.id).sort()).toEqual(['PK-1', 'PK-2']);

    const gravadas = await sqliteService.persistAssetsBatch(
      decisaoLocal as unknown as Record<string, unknown>[]
    );

    expect(gravadas).toBe(2);
    // PK-1: o GPS do aparelho voltou; PK-2: a edição por enviar voltou e segue pendente.
    expect((await guardado('PK-1'))?.latitude).toBe(-15.79);
    expect((await guardado('PK-2'))?.descricaodoativo).toBe('editado no aparelho');
    expect(Number((await guardado('PK-2'))?._is_synced)).toBe(0);
    // PK-3 (fora do delta) continua com o que estava.
    expect((await guardado('PK-3'))?.descricaodoativo).toBe('local 3');
    // A base continua com 200 linhas: nada é apagado nem duplicado.
    expect(await db.local_assets.count()).toBe(200);
  });
});

describe('delta — o contrato do App', () => {
  it('o pull incremental usa mergeDeltaPull e grava só a decisaoLocal', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
    expect(fonte).toContain('mergeDeltaPull({');
    expect(fonte).toContain('sqliteService.persistAssetsBatch(decisaoLocal as unknown as Record<string, unknown>[])');
    // O delta não chama a regra do GPS à mão: ela vive no mergeDeltaPull.
    expect(fonte).not.toContain('preservarGpsMaisRecente(local, a)');
  });
});
