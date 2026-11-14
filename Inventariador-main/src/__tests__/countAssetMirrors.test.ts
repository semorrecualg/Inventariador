// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, sqliteService, invalidateTenantCaseMarker, TENANT_CASE_MARKER, type DexieAsset } from '../services/sqliteService';
import { DatabaseMode } from '../types';
import { restoreInventory } from '../services/persistenceService';

// persistenceService importa o cliente Supabase; o restore não o usa.
vi.mock('../services/supabaseService', () => ({
  syncAssetsToCloudAndMark: vi.fn(),
  syncConfigToCloud: vi.fn()
}));
import { DatabaseLoaderService, verifyAndRestorePhysicalBackup } from '../services/DatabaseLoaderService';

// Backup físico: o conteúdo lido do "dispositivo" é controlado pelo teste.
const physicalBackup = vi.hoisted(() => ({ data: '' }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { readFile: vi.fn(async () => ({ data: physicalBackup.data })) },
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' }
}));

/** Linha mínima: a contagem só lê `tenantid`; o resto não influencia. */
const row = (tenantid: string, primarykey: string, etiqueta = primarykey): DexieAsset =>
  ({ id: primarykey, primarykey, tenantid, etiqueta } as unknown as DexieAsset);
describe('countAssetMirrors (F0)', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    // Sem o marcador, a contagem usa a varredura e a migração volta a correr.
    await db.SYSTEM_CONTEXT.clear();
  });

  it('conta pelo índice [tenantid+primarykey] e isola o tenant', async () => {
    await db.local_assets.bulkPut([
      row('CICOPAL', 'a'),
      row('CICOPAL', 'b'),
      row('OUTRO', 'c')
    ]);
    await db.ativos.bulkPut([row('CICOPAL', 'a')]);
    await db.assets.bulkPut([
      row('CICOPAL', 'a'),
      row('CICOPAL', 'b'),
      row('OUTRO', 'd')
    ]);
    // A migração não tem resíduo para tratar e só deixa o marcador.
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 0, skipped: 0 });

    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toEqual({
      local_assets: 2,
      ativos: 1,
      assets: 2,
      total: 2
    });
  });

  it('antes da migração conta o legado por varredura, sem o alterar', async () => {
    await db.local_assets.bulkPut([row('CICOPAL', 'a'), row('cicopal', 'b')]);

    // Leitura pura: o resíduo entra na contagem e continua na chave antiga.
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toEqual({
      local_assets: 2,
      ativos: 0,
      assets: 0,
      total: 2
    });
    await expect(db.local_assets.get(['cicopal', 'b'])).resolves.not.toBeUndefined();
  });

  it('migra o legado em transação e depois conta pelo índice', async () => {
    await db.local_assets.bulkPut([row('CICOPAL', 'a'), row('cicopal', 'b')]);

    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 1, skipped: 0 });

    expect((await db.local_assets.get(['CICOPAL', 'b']))?.tenantid).toBe('CICOPAL');
    // After migration, the row exists with normalized UPPER tenantid.
    await expect(db.local_assets.get(['CICOPAL', 'b'])).resolves.toBeDefined();
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toEqual({
      local_assets: 2,
      ativos: 0,
      assets: 0,
      total: 2
    });
  });

  it('não sobrescreve a linha canónica quando as duas variantes existem', async () => {
    await db.local_assets.bulkPut([
      row('CICOPAL', 'b', 'CANONICA'),
      row('cicopal', 'b', 'LEGADA')
    ]);

    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 0, skipped: 1 });

    // Canónica intacta; legada preservada (não apagada) na chave antiga.
    expect((await db.local_assets.get(['CICOPAL', 'b']))?.etiqueta).toBe('CANONICA');
    expect((await db.local_assets.get(['cicopal', 'b']))?.etiqueta).toBe('LEGADA');
    // O ativo conta uma só vez: a legada é duplicado da mesma primarykey.
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toEqual({
      local_assets: 1,
      ativos: 0,
      assets: 0,
      total: 1
    });
  });

  it('invalida o marcador após restore e volta a contar o legado', async () => {
    // Base já migrada: o marcador existe e a contagem usa o índice.
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 0, skipped: 0 });
    // Restore/importação grava direto nas tabelas, com tenantid em minúsculas.
    await db.local_assets.bulkPut([row('CICOPAL', 'a'), row('cicopal', 'b')]);

    // Sem invalidar, o índice não vê a linha restaurada (o bug).
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toMatchObject({ local_assets: 1 });

    await invalidateTenantCaseMarker();
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toMatchObject({ local_assets: 2 });

    // A migração volta a correr e o índice fica exato outra vez.
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 1, skipped: 0 });
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toMatchObject({ local_assets: 2 });
  });

  it('restoreInventory (caminho real) invalida o marcador', async () => {
    // securityService (usado pelo restore) lê localStorage; jsdom aqui não o expõe.
    const mem = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); },
      clear: () => mem.clear(),
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      length: 0
    });

    // Se a invalidação sair do restore, o marcador continua e o teste falha.
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 0, skipped: 0 });
    expect(await db.SYSTEM_CONTEXT.get(TENANT_CASE_MARKER)).toBeTruthy();

    const backup = new File(
      [JSON.stringify({ assets: [row('cicopal', 'b')], config: {} })],
      'backup.json',
      { type: 'application/json' }
    );
    await expect(restoreInventory(backup, DatabaseMode.INTERNAL)).resolves.not.toBeNull();

    await expect(db.SYSTEM_CONTEXT.get(TENANT_CASE_MARKER)).resolves.toBeUndefined();

    // Base restaurada: a linha em minúsculas volta a ser contada pela varredura.
    await db.local_assets.bulkPut([row('cicopal', 'b')]);
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toMatchObject({ local_assets: 1 });
  });

  it('verifyAndRestorePhysicalBackup (caminho real) invalida o marcador e conta o legado', async () => {
    // Base já migrada: marcador presente e índice ativo.
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 0, skipped: 0 });
    expect(await db.SYSTEM_CONTEXT.get(TENANT_CASE_MARKER)).toBeTruthy();

    physicalBackup.data = JSON.stringify([row('cicopal', 'b')]);
    await expect(verifyAndRestorePhysicalBackup()).resolves.toBe(true);

    // Se a invalidação sair do restore físico, o marcador continua e falha aqui.
    await expect(db.SYSTEM_CONTEXT.get(TENANT_CASE_MARKER)).resolves.toBeUndefined();
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toMatchObject({ local_assets: 1 });

    // O restauro repõe os três espelhos: a linha legada em minúsculas existe
    // nos três e é reparada em cada um.
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 3, skipped: 0 });
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toMatchObject({ local_assets: 1 });
  });

  it('verifyAndRestorePhysicalBackup repõe os três espelhos (não deixa ativos/assets vazios)', async () => {
    // Base apagada por desastre: local_assets vazio, mas o espelho operacional
    // ainda guarda uma linha velha de outro estado.
    await db.ativos.bulkPut([row('CICOPAL', 'VELHO')]);

    physicalBackup.data = JSON.stringify([row('CICOPAL', 'a'), row('CICOPAL', 'b')]);
    await expect(verifyAndRestorePhysicalBackup()).resolves.toBe(true);

    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toEqual({
      local_assets: 2,
      ativos: 2,
      assets: 2,
      total: 2
    });
    // A linha velha do espelho não sobrevive ao restauro integral.
    await expect(db.ativos.get(['CICOPAL', 'VELHO'])).resolves.toBeUndefined();
  });

  it('a importação invalida o marcador antes de gravar', async () => {
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 0, skipped: 0 });
    // Importação vazia: só interessa o efeito de invalidação do entrypoint.
    await DatabaseLoaderService.injetarDadosEmLotes([]);
    await db.local_assets.bulkPut([row('cicopal', 'b')]);

    // Com o marcador invalidado a contagem varre e vê a linha em minúsculas.
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toMatchObject({ local_assets: 1 });
  });

  it('importExcelBulkData invalida o marcador antes de gravar', async () => {
    // Base já migrada: marcador presente e contagem a usar o índice.
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 0, skipped: 0 });
    expect((await db.SYSTEM_CONTEXT.get(TENANT_CASE_MARKER))?.value).toBe('1');

    // O entrypoint tem de invalidar o marcador antes de escrever os ativos.
    await new DatabaseLoaderService().importExcelBulkData(minimalValidXlsxFile(), 'CICOPAL', 'UNIT1', () => {});
    await expect(db.SYSTEM_CONTEXT.get(TENANT_CASE_MARKER)).resolves.toBeUndefined();

    // Com o marcador invalidado a contagem volta à varredura e vê o resíduo
    // em minúsculas que a importação pode deixar (o entrypoint não o apagou).
    await db.local_assets.bulkPut([row('cicopal', 'b')]);
    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toMatchObject({ local_assets: 1 });
  });

  it('sem tenant conta a tabela inteira', async () => {
    await db.assets.bulkPut([row('CICOPAL', 'a'), row('OUTRO', 'b')]);

    await expect(sqliteService.countAssetMirrors()).resolves.toEqual({
      local_assets: 0,
      ativos: 0,
      assets: 2,
      total: 2
    });
  });
});

// Gera um arquivo XLSX mínimo com os cabeçalhos obrigatórios para passar a validação de contrato.
// O contrato SRE exige 21 colunas na ordem exata com tenantid no índice 0.
function minimalValidXlsxFile(): File {
  const headers = [
    'tenantid', 'filial', 'status', 'etiqueta', 'qt',
    'descricaodoativo', 'serial', 'dataaqusic', 'cnpj',
    'nomefornecedor', 'notafiscal', 'endereco', 'registro',
    'subreg', 'databaixa', 'contacontabil', 'primarykey',
    'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno'
  ];

  const headerItems = headers.map(h => `<Cell><Data ss:Type="String">${h}</Data></Cell>`);
  const headerRow = headerItems.join('');
  const dataRow = headers.map(() => `<Cell><Data ss:Type="String">dummy</Data></Cell>`).join('');

  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Worksheet ss:Name="Planilha1">' +
    '<Table>' +
    '<Row>' + headerRow + '</Row>' +
    '<Row>' + dataRow + '</Row>' +
    '</Table>' +
    '</Worksheet>' +
    '</Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  return new File([blob], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}