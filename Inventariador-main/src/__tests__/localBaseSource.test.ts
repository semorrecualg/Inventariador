// @vitest-environment jsdom
// ============================================================================
// localBaseSource.test.ts — cartão e espelhamento sobre a MESMA lista.
//
// O cartão do Gestor contava o espelho mais completo (`local_assets · ativos ·
// assets`) e o espelhamento lia só `db.ativos`. Com espelhos divergentes, o ecrã
// anunciava N ativos e o envio mandava outro número. Estes testes fixam a regra:
// a escolha do espelho acontece uma vez e devolve as linhas que o cartão conta e
// que o envio envia.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { escolherEspelho, lerBaseLocalUnificada } from '../services/localBaseSource';

const asset = (primarykey: string, tenantid = 'CICOPAL'): DexieAsset =>
  ({
    id: primarykey,
    primarykey,
    tenantid,
    filial: '010101 CICOPAL GO',
    etiqueta: primarykey,
    _is_synced: 0,
    _is_deleted: 0
  }) as unknown as DexieAsset;

describe('escolherEspelho', () => {
  it('escolhe o espelho com mais linhas', () => {
    expect(escolherEspelho({ local_assets: 1, ativos: 3, assets: 2 })).toBe('ativos');
  });

  it('empate fica em local_assets, como o Math.max do cartão', () => {
    expect(escolherEspelho({ local_assets: 3, ativos: 3, assets: 0 })).toBe('local_assets');
  });

  it('base vazia não tem espelho', () => {
    expect(escolherEspelho({ local_assets: 0, ativos: 0, assets: 0 })).toBeNull();
  });
});

describe('lerBaseLocalUnificada', () => {
  beforeEach(async () => {
    await Promise.all([db.local_assets.clear(), db.ativos.clear(), db.assets.clear()]);
  });

  it('devolve as linhas do espelho mais completo, não as do espelho parcial', async () => {
    await db.local_assets.bulkPut([asset('A'), asset('B'), asset('C')]);
    await db.ativos.bulkPut([asset('A')]);

    const base = await lerBaseLocalUnificada();

    expect(base.fonte).toBe('local_assets');
    expect(base.rows.map((r) => r.primarykey)).toEqual(['A', 'B', 'C']);
    expect(base.mirrors).toEqual({ local_assets: 3, ativos: 1, assets: 0 });
  });

  it('o número do cartão é o número que o envio recebe', async () => {
    await db.local_assets.bulkPut([asset('A'), asset('B'), asset('C')]);
    await db.ativos.bulkPut([asset('A')]);

    const base = await lerBaseLocalUnificada();

    // countAssetMirrors devolve `total` = maior espelho; o cartão passou a usar
    // `rows.length`, que tem de ser igual para nunca haver dois números.
    expect(base.rows.length).toBe(Math.max(
      base.mirrors.local_assets,
      base.mirrors.ativos,
      base.mirrors.assets
    ));
  });

  it('filtra pelo contrato pedido sem olhar aos outros espelhos', async () => {
    await db.local_assets.bulkPut([
      asset('A', 'CICOPAL'),
      asset('B', 'CICOPAL'),
      asset('C', 'CLIENTETESTE')
    ]);

    const base = await lerBaseLocalUnificada(' cicopal ');

    expect(base.rows.map((r) => r.primarykey)).toEqual(['A', 'B']);
    expect(base.mirrors).toEqual({ local_assets: 2, ativos: 0, assets: 0 });
  });

  it('sem contrato pedido lê a base inteira', async () => {
    await db.local_assets.bulkPut([asset('A', 'CICOPAL'), asset('B', 'CLIENTETESTE')]);

    const base = await lerBaseLocalUnificada(null);

    expect(base.rows).toHaveLength(2);
  });

  it('base vazia devolve lista vazia e nenhuma fonte', async () => {
    const base = await lerBaseLocalUnificada();

    expect(base.rows).toEqual([]);
    expect(base.fonte).toBeNull();
  });
});
