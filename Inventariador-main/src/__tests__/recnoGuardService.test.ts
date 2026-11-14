// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { saveCollectedAssetAtomic } from '../services/persistenceService';
import {
  RECNO_AUDIT_ACTION,
  RECNO_CSV_COLUMNS,
  formatRecnoReport,
  invalidateRecnoGuardIndex,
  previewRecnoCollisions,
  recnoReportCsvFileName,
  recnoReportToCsv,
  reportRecnoCollisions,
  reportRecnoConflictForAsset
} from '../services/recnoGuardService';

const asset = (over: Partial<DexieAsset> & { primarykey: string }): DexieAsset =>
  ({
    id: over.primarykey,
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    filial_raw: '010101 CICOPAL GO',
    etiqueta: 'ETQ-1',
    tag: 'ETQ-1',
    status: 'EM USO',
    qt: 1,
    descricaodoativo: 'CADEIRA GIRATORIA',
    vlraquisic: 345.26,
    sn1_recno: 6569,
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

const dupLogs = async () => db.audit_logs.filter((log) => log.acao === RECNO_AUDIT_ACTION).toArray();

/** Semeia um par "recno repetido na linha seguinte" e um caso de origens diferentes. */
const seedBothKinds = async (): Promise<void> => {
  await db.local_assets.bulkPut([
    asset({
      primarykey: '010101OBRA102820214',
      etiqueta: '010101OBRA102820214',
      registro: 'OBRA10282',
      sn1_recno: 76395,
      descricaodoativo: 'OBRA10282 PISTOLA LAVA JATO',
      vlraquisic: 4369.09,
      dataaqusic: '46057',
      notafiscal: '000008001',
      nomefornecedor: 'W J COMERCIO DE PECAS'
    }),
    asset({
      primarykey: '010101OBRA102820215',
      etiqueta: '010101OBRA102820215',
      registro: 'OBRA10282',
      sn1_recno: 76395,
      descricaodoativo: 'OBRA10282 CONECTOR INSTANTANEO',
      vlraquisic: 73172.55,
      qt: 4,
      dataaqusic: '46057',
      notafiscal: '000008001',
      nomefornecedor: 'W J COMERCIO DE PECAS'
    }),
    asset({
      primarykey: '01010100000049070001',
      etiqueta: '001947',
      registro: 'OBRA10217',
      sn1_recno: 6569,
      descricaodoativo: 'CADEIRA ESC FIXA ASS/ENC TC',
      vlraquisic: 3.49
    }),
    asset({
      primarykey: '01010100000049060001',
      etiqueta: '003753',
      descricaodoativo: 'CADEIRA ESC FIXA ASS/ENCTEC',
      sn1_recno: 6569,
      vlraquisic: 345.26
    })
  ]);
  invalidateRecnoGuardIndex();
};

describe('recnoGuardService · guardião suave de duplicidade', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
    invalidateRecnoGuardIndex();
  });

  it('mostra os casos existentes na base (mesmo recno, dados diferentes)', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: '003753', sn1_recno: 6569, vlraquisic: 345.26 }),
      asset({ primarykey: 'PK-2', etiqueta: '001947', sn1_recno: 6569, vlraquisic: 3.49, descricaodoativo: 'CADEIRA ESC FIXA AZ' }),
      asset({ primarykey: 'PK-3', etiqueta: '000999', sn1_recno: 77777, vlraquisic: 10 })
    ]);

    const collisions = await previewRecnoCollisions();
    expect(collisions).toHaveLength(1);
    expect(collisions[0]).toMatchObject({ filial: '010101 CICOPAL GO', recno: 6569 });
    expect(collisions[0].rows.map((row) => row.etiqueta)).toEqual(['003753', '001947']);
  });

  it('registra o caso em audit_logs e não repete o registro', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: 'A1', sn1_recno: 900 }),
      asset({ primarykey: 'PK-2', etiqueta: 'A2', sn1_recno: 900, vlraquisic: 1 })
    ]);

    const first = await reportRecnoCollisions('GESTOR_BASE');
    expect(first.collisions).toHaveLength(1);
    expect(first.logged).toBe(1);

    const logs = await dupLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].registro_id).toBe('CICOPAL|010101 CICOPAL GO|900');
    expect(logs[0].details).toContain('Possível duplicidade por recno');
    const delta = JSON.parse(String(logs[0].delta));
    expect(delta).toMatchObject({ source: 'GESTOR_BASE', recno: 900, filial: '010101 CICOPAL GO' });
    expect(delta.rows).toHaveLength(2);

    const second = await reportRecnoCollisions('GESTOR_BASE');
    expect(second.logged).toBe(0);
    expect(await dupLogs()).toHaveLength(1);
  });

  it('na conferência, detecta o conflito, audita e NÃO bloqueia a gravação', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: 'A1', sn1_recno: 6569, vlraquisic: 345.26 })
    ]);
    invalidateRecnoGuardIndex();

    await saveCollectedAssetAtomic({
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      primarykey: 'PK-2',
      etiqueta: 'A2',
      sn1_recno: 6569,
      vlraquisic: 3.49,
      descricaodoativo: 'CADEIRA ESC FIXA AZ'
    });

    // A conferência foi gravada: o guardião só avisa.
    expect(await db.local_assets.count()).toBe(2);
    expect(await db.audit_logs.filter((log) => log.acao === 'DEDUP_ASSETS').count()).toBe(0);
    const logs = await dupLogs();
    expect(logs).toHaveLength(1);
    expect(JSON.parse(String(logs[0].delta)).source).toBe('CONFERENCIA');
    expect(logs[0].details).toContain('Nada foi bloqueado nem apagado');
  });

  it('conferência com os MESMOS dados do recno não gera alarme', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: 'A1', sn1_recno: 700, vlraquisic: 10 })
    ]);
    invalidateRecnoGuardIndex();

    const report = await reportRecnoConflictForAsset(
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', primarykey: 'PK-9', etiqueta: 'A1', sn1_recno: 700, vlraquisic: 10 },
      'CONFERENCIA'
    );
    expect(report.collisions).toHaveLength(0);
    expect(await dupLogs()).toHaveLength(0);
  });

  it('a carga da planilha audita os conflitos do próprio arquivo', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', etiqueta: 'A1', descricaodoativo: 'CADEIRA', vlraquisic: 10, sn1_recno: 500, qt: 1 },
      { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', etiqueta: 'A2', descricaodoativo: 'MESA', vlraquisic: 20, sn1_recno: 500, qt: 1 }
    ]);

    const logs = await dupLogs();
    expect(logs).toHaveLength(1);
    expect(JSON.parse(String(logs[0].delta)).source).toBe('CARGA_PLANILHA');
    // Nada foi descartado: as duas linhas existem.
    expect(await db.local_assets.count()).toBe(2);
  });

  it('o relatório diz explicitamente quando não há casos', async () => {
    expect(formatRecnoReport({ collisions: [], logged: 0 })).toEqual([
      '[RECNO] Nenhuma duplicidade por tenantid + filial + sn1_recno na base local.'
    ]);
  });

  it('o relatório separa linha seguinte de origens diferentes', async () => {
    await seedBothKinds();
    const report = await reportRecnoCollisions('GESTOR_BASE');
    const lines = formatRecnoReport(report);

    expect(lines[0]).toBe('[RECNO] 2 caso(s) · 4 linha(s) · 2 novo(s) em audit_logs');

    const idxLinha = lines.findIndex((line) => line.includes('LINHA SEGUINTE'));
    const idxOrigens = lines.findIndex((line) => line.includes('ORIGENS DIFERENTES'));
    expect(idxLinha).toBeGreaterThan(0);
    expect(idxOrigens).toBeGreaterThan(idxLinha);

    expect(lines[idxLinha]).toContain('1 caso(s) · 2 linha(s)');
    expect(lines[idxLinha + 1]).toContain('recno 76395');
    expect(lines[idxOrigens]).toContain('1 caso(s) · 2 linha(s)');
    expect(lines[idxOrigens + 1]).toContain('recno 6569');
    expect(lines.at(-1)).toContain('EXPORTAR CSV');
    // Cada seção mostra só os seus casos: o de 6569 não aparece na seção de cima.
    expect(lines.slice(idxLinha + 1, idxOrigens).join('\n')).not.toContain('recno 6569');
  });

  it('exporta o CSV com as colunas do Protheus, uma linha por ativo', async () => {
    await seedBothKinds();
    const report = await reportRecnoCollisions('GESTOR_BASE');
    const csv = recnoReportToCsv(report);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n');
    expect(lines[0]).toBe(RECNO_CSV_COLUMNS.join(';'));
    expect(lines).toHaveLength(5); // cabeçalho + 4 ativos

    const rows = lines.slice(1).map((line) => line.split(';'));
    const col = (name: (typeof RECNO_CSV_COLUMNS)[number]) => RECNO_CSV_COLUMNS.indexOf(name);
    // Linha seguinte primeiro, origens diferentes depois.
    expect(rows.map((row) => row[col('tipo')])).toEqual([
      'LINHA_SEGUINTE',
      'LINHA_SEGUINTE',
      'ORIGENS_DIFERENTES',
      'ORIGENS_DIFERENTES'
    ]);
    expect(rows.map((row) => row[col('grupo')])).toEqual(['R1', 'R1', 'R2', 'R2']);
    expect(rows[0][col('etiqueta')]).toBe('010101OBRA102820214');
    expect(rows[1][col('etiqueta')]).toBe('010101OBRA102820215');
    expect(rows[0][col('valor')]).toBe('4369.09');
    expect(rows[0][col('registro')]).toBe('OBRA10282');
    expect(rows[0][col('notafiscal')]).toBe('000008001');
    expect(rows[0][col('qt')]).toBe('1');
    expect(rows[2][col('recno')]).toBe('6569');
  });

  it('o CSV protege valores com ponto e vírgula e aspas', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', etiqueta: 'A1', sn1_recno: 1234, descricaodoativo: 'CAIXA "FORTE"; 20L', vlraquisic: 10 }),
      asset({ primarykey: 'PK-2', etiqueta: 'A2', sn1_recno: 1234, descricaodoativo: 'MESA', vlraquisic: 20 })
    ]);
    invalidateRecnoGuardIndex();

    const csv = recnoReportToCsv({ collisions: await previewRecnoCollisions(), logged: 0 });
    expect(csv).toContain('"CAIXA ""FORTE""; 20L"');
    // 1 cabeçalho + 2 ativos: o ponto e vírgula da descrição não cria linha nova.
    expect(csv.replace(/^\uFEFF/, '').trimEnd().split('\r\n')).toHaveLength(3);
  });

  it('nome do ficheiro leva a data do dia', () => {
    expect(recnoReportCsvFileName(new Date('2026-11-12T10:00:00Z'))).toBe('RECNO_DUPLICIDADE_20261112.csv');
  });
});
