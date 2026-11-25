// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import {
  cleanExactAssetCopies,
  previewExactCopyCleanup,
  restoreExactCopyCleanup,
  latestExactCopyBackup,
  formatExactCopyReport
} from '../services/assetMirrorCleanupService';

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
};

describe('assetMirrorCleanupService — cópias EXATAS (mesma primarykey + conteúdo)', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.audit_logs.clear();
    await db.asset_cleanup_backups.clear();
  });

  it('remove a cópia sem contrato e mantém a linha do contrato nas duas tabelas', async () => {
    await seed([
      asset({ primarykey: 'A1', tenantid: 'CICOPAL', _is_synced: 0 }),
      asset({ primarykey: 'A1', tenantid: '', _is_synced: 1 })
    ]);

    const report = await cleanExactAssetCopies('CICOPAL');

    expect(report.applied).toBe(true);
    expect(report.removed).toBe(1); // local_assets
    expect(report.removedTotal).toBe(2); // um por tabela da união
    expect(report.before).toBe(2);
    expect(report.after).toBe(1);
    expect(report.distinctBefore).toBe(1);
    expect(report.distinctAfter).toBe(1);

    expect(await db.local_assets.count()).toBe(1);
    expect(await db.ativos.count()).toBe(1);
    expect((await db.local_assets.toArray())[0].tenantid).toBe('CICOPAL');
    // A linha que fica herda o estado de sincronização da cópia removida.
    expect((await db.local_assets.toArray())[0]._is_synced).toBe(1);
  });

  it('nunca funde primarykeys diferentes que partilham a etiqueta (bens distintos)', async () => {
    const bem = {
      etiqueta: '008488 CCPL',
      tag: '008488 CCPL',
      descricaodoativo: 'ESTANTE ESC PES CANT AC 6P CZA 90X30X180'
    };
    const rows = Array.from({ length: 9 }, (_, i) => {
      const chave = `010101CMDECRPRCX0${i + 1}`;
      return [
        asset({ primarykey: chave, tenantid: 'CICOPAL', ...bem }),
        asset({ primarykey: chave, tenantid: '', ...bem })
      ];
    }).flat();
    await seed(rows);

    const report = await cleanExactAssetCopies('CICOPAL');

    // 18 linhas → 9 (uma por chave); nenhuma chave desapareceu do contrato.
    expect(report.before).toBe(18);
    expect(report.after).toBe(9);
    expect(report.distinctBefore).toBe(9);
    expect(report.distinctAfter).toBe(9);
    expect(await db.local_assets.count()).toBe(9);
    expect(await db.local_assets.where('primarykey').equals('010101CMDECRPRCX01').count()).toBe(1);
    expect(await db.local_assets.where('primarykey').equals('010101CMDECRPRCX09').count()).toBe(1);
  });

  it('não toca em linhas com a mesma chave e conteúdo diferente', async () => {
    // Duas linhas do mesmo `primarykey` só coexistem em escopos diferentes
    // (a chave primária local é [tenantid+primarykey]).
    await seed([
      asset({ primarykey: 'A1', tenantid: 'CICOPAL', descricaodoativo: 'ESTANTE' }),
      asset({ primarykey: 'A1', tenantid: '', descricaodoativo: 'CADEIRA' })
    ]);

    const report = await cleanExactAssetCopies('CICOPAL');

    expect(report.removedTotal).toBe(0);
    expect(report.skippedDifferentContent).toBe(1);
    expect(await db.local_assets.count()).toBe(2);
    expect(await db.asset_cleanup_backups.count()).toBe(0);
  });

  it('não mexe no mesmo primarykey de outro contrato (multi-tenant é legítimo)', async () => {
    await seed([
      asset({ primarykey: 'A1', tenantid: 'CICOPAL' }),
      asset({ primarykey: 'A1', tenantid: 'CLIENTETESTE' })
    ]);

    const report = await cleanExactAssetCopies('CICOPAL');

    expect(report.removedTotal).toBe(0);
    expect(await db.local_assets.count()).toBe(2);
  });

  it('a pré-visualização mostra as contagens e não escreve nada', async () => {
    await seed([
      asset({ primarykey: 'A1' }),
      asset({ primarykey: 'A1', tenantid: '' }),
      asset({ primarykey: 'B1', etiqueta: 'E2', tag: 'E2' })
    ]);

    const plan = await previewExactCopyCleanup('CICOPAL');

    expect(plan.applied).toBe(false);
    expect(plan.removedTotal).toBe(2);
    expect(plan.tables.map((t) => `${t.table}:${t.before}->${t.after}`)).toEqual([
      'local_assets:3->2',
      'ativos:3->2'
    ]);
    const texto = formatExactCopyReport(plan).join('\n');
    expect(texto).toContain('DEPOIS (projeção)');
    expect(texto).toContain('Chaves distintas (um ativo por primarykey): 2 → 2');

    // Nada gravado.
    expect(await db.local_assets.count()).toBe(3);
    expect(await db.asset_cleanup_backups.count()).toBe(0);
  });

  it('desfazer devolve as linhas removidas com a chave exata', async () => {
    await seed([
      asset({ primarykey: 'A1', tenantid: 'CICOPAL' }),
      asset({ primarykey: 'A1', tenantid: '' })
    ]);

    const report = await cleanExactAssetCopies('CICOPAL');
    expect(report.backupId).toBeTruthy();
    expect(await db.local_assets.count()).toBe(1);

    const backup = await latestExactCopyBackup();
    expect(backup).toMatchObject({ id: report.backupId, removedTotal: 2 });

    const { restored } = await restoreExactCopyCleanup(report.backupId as string);
    expect(restored).toBe(2);
    expect(await db.local_assets.count()).toBe(2);
    expect(await db.ativos.count()).toBe(2);

    const tenants = (await db.local_assets.toArray()).map((row) => row.tenantid).sort();
    expect(tenants).toEqual(['', 'CICOPAL']);
  });

  it('base sem cópias: não grava backup e reporta zero', async () => {
    await seed([
      asset({ primarykey: 'A1', etiqueta: 'E1' }),
      asset({ primarykey: 'B1', etiqueta: 'E2', tag: 'E2' })
    ]);

    const report = await cleanExactAssetCopies('CICOPAL');

    expect(report.removedTotal).toBe(0);
    expect(report.backupId).toBeUndefined();
    expect(await db.asset_cleanup_backups.count()).toBe(0);
    expect(await latestExactCopyBackup()).toBeNull();
    expect(await db.local_assets.count()).toBe(2);
  });
});
