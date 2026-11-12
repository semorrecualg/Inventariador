// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { previewAssetDuplicateCleanup, applyAssetDuplicateCleanup } from '../services/assetDedupService';

const asset = (over: Partial<DexieAsset> & { primarykey: string }): DexieAsset =>
  ({
    id: over.primarykey,
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    filial_raw: '010101 CICOPAL GO',
    etiqueta: 'E1',
    tag: 'E1',
    status: 'PENDENTE',
    qt: 1,
    descricaodoativo: 'Ativo',
    _is_synced: 0,
    _is_deleted: 0,
    _conferido: 0,
    _plaquetado: 0,
    _aprovado: 0,
    _isNew: 0,
    _is_unitized: 0,
    _is_divergent_baixa: 0,
    _history: null,
    DE_PARA: null,
    _photoUrl: null,
    gps_lat: null,
    gps_lng: null,
    ...over
  }) as DexieAsset;

const seed = async (rows: DexieAsset[]) => {
  await db.local_assets.bulkPut(rows);
  await db.ativos.bulkPut(rows);
  await db.assets.bulkPut(rows);
};

/**
 * Regressão do sintoma real: a Unidade Operacional somava 50 544 ativos onde a
 * nuvem tem 12 636, porque o mesmo conjunto estava gravado 4× com `primarykey`
 * diferente. A limpeza tem de reduzir ao conjunto único e preservar o conferido.
 */
describe('assetDedupService — limpeza de cópias na base local', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
  });

  it('diagnóstico mostra antes/depois sem alterar nada', async () => {
    await seed([
      asset({ primarykey: 'A1' }),
      asset({ primarykey: 'A2' }),
      asset({ primarykey: 'A3', _conferido: 1 }),
      asset({ primarykey: 'B1', etiqueta: 'E2', tag: 'E2' }),
      asset({ primarykey: 'B2', etiqueta: 'E2', tag: 'E2' }),
      asset({ primarykey: 'SEM-ID', etiqueta: '', tag: '' })
    ]);

    const report = await previewAssetDuplicateCleanup();
    expect(report.before).toBe(6);
    expect(report.removed).toBe(3);
    expect(report.after).toBe(3);
    expect(report.groupsWithCopies).toBe(2);
    expect(report.withoutIdentity).toBe(1);
    expect(report.tables.map(t => t.table)).toEqual(['local_assets', 'ativos', 'assets']);
    expect(report.perFilial[0]).toMatchObject({ before: 6, after: 3, removed: 3 });

    // Nada foi apagado.
    expect(await db.local_assets.count()).toBe(6);
  });

  it('aplica a limpeza e mantém a cópia conferida (autor e data preservados)', async () => {
    await seed([
      asset({ primarykey: 'A1', _is_synced: 1 }),
      asset({ primarykey: 'A2', _conferido: 1, _auditor: 'semorr@gmail.com', _dataLeitura: '2026-11-12T10:00:00Z' }),
      asset({ primarykey: 'A3' }),
      asset({ primarykey: 'B1', etiqueta: 'E2', tag: 'E2' }),
      asset({ primarykey: 'B2', etiqueta: 'E2', tag: 'E2' }),
      asset({ primarykey: 'SEM-ID', etiqueta: '', tag: '' })
    ]);

    const report = await applyAssetDuplicateCleanup();
    expect(report.removed).toBe(3);
    expect(report.after).toBe(3);

    for (const table of ['local_assets', 'ativos', 'assets'] as const) {
      expect(await db.table(table).count()).toBe(3);
    }

    const kept = (await db.local_assets.toArray()) as unknown as DexieAsset[];
    const conferido = kept.find(row => row.primarykey === 'A2');
    expect(conferido?._conferido).toBe(1);
    expect(conferido?._auditor).toBe('semorr@gmail.com');
    expect(conferido?._dataLeitura).toBe('2026-11-12T10:00:00Z');
    // Ativo sem etiqueta nunca é tocado.
    expect(kept.some(row => row.primarykey === 'SEM-ID')).toBe(true);
  });

  it('correr a limpeza duas vezes é seguro (idempotente)', async () => {
    await seed([asset({ primarykey: 'A1' }), asset({ primarykey: 'A2' }), asset({ primarykey: 'A3' })]);

    const first = await applyAssetDuplicateCleanup();
    expect(first.removed).toBe(2);

    const second = await applyAssetDuplicateCleanup();
    expect(second.removed).toBe(0);
    expect(second.before).toBe(1);
    expect(second.after).toBe(1);
  });

  it('base sem cópias fica intacta', async () => {
    await seed([
      asset({ primarykey: 'A1', etiqueta: 'E1' }),
      asset({ primarykey: 'B1', etiqueta: 'E2', tag: 'E2' })
    ]);

    const report = await applyAssetDuplicateCleanup();
    expect(report.removed).toBe(0);
    expect(await db.local_assets.count()).toBe(2);
  });
});
