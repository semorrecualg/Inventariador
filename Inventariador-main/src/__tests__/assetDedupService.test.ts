// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { previewAssetDuplicateCleanup, formatDedupReport } from '../services/assetDedupService';

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
 * Regra do produto: nenhuma linha da base pode ser apagada pelo app. O Gestor de
 * Base só MEDE as cópias (mesmo tenantid + filial + etiqueta); a causa é
 * tratada na carga, que bloqueia quando planilha e base não batem.
 */
describe('assetDedupService — diagnóstico de cópias (não apaga nada)', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
  });

  it('mostra as cópias por filial sem alterar a base', async () => {
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
    // A.3a.2: o relatório mede as duas tabelas que ainda são espelho de
    // negócio; `assets` só recebe escrita até à A.3a.3.
    expect(report.tables.map((t) => t.table)).toEqual(['local_assets', 'ativos']);
    expect(report.perFilial[0]).toMatchObject({ before: 6, after: 3, removed: 3 });

    // O rótulo não chama "identidades" às linhas sem etiqueta: 3 linhas após a
    // soma = 2 identidades distintas + 1 linha sem etiqueta.
    const texto = formatDedupReport(report).join('\n');
    expect(texto).toContain('Identidades distintas (tenantid+filial+etiqueta): 2');
    expect(texto).toContain('linhas sem etiqueta (fora do agrupamento, contadas uma a uma): 1');
    expect(texto).not.toContain('identidade(s)');

    // Nada foi apagado, em espelho nenhum.
    expect(await db.local_assets.count()).toBe(6);
    expect(await db.ativos.count()).toBe(6);
    expect(await db.assets.count()).toBe(6);
  });

  it('não escreve em audit_logs (diagnóstico é leitura pura)', async () => {
    await seed([asset({ primarykey: 'A1' }), asset({ primarykey: 'A2' })]);

    await previewAssetDuplicateCleanup();
    expect(await db.audit_logs.count()).toBe(0);
  });

  it('base sem cópias fica intacta e com zero divergências', async () => {
    await seed([
      asset({ primarykey: 'A1', etiqueta: 'E1' }),
      asset({ primarykey: 'B1', etiqueta: 'E2', tag: 'E2' })
    ]);

    const report = await previewAssetDuplicateCleanup();
    expect(report.removed).toBe(0);
    expect(await db.local_assets.count()).toBe(2);
    expect(formatDedupReport(report).join(' ')).toContain('nenhum registo é apagado');
  });

  it('o relatório identifica as grafias que criaram a cópia', async () => {
    await seed([
      asset({ primarykey: 'ARQUIVO 1', etiqueta: 'E1' }),
      asset({ primarykey: 'arquivo-1', etiqueta: 'E1' })
    ]);

    const report = await previewAssetDuplicateCleanup();
    expect(report.examples[0]).toMatchObject({
      // Tenantid mascarado no relatório; filial/etiqueta continuam legíveis.
      key: 'CI***|010101 CICOPAL GO|E1'
    });
    expect(report.examples[0].removed.length + 1).toBe(2);
  });
});
