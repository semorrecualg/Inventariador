// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import {
  reconcileImport,
  type LoadedAssetRef
} from '../utils/importReconciliation';

const planilhaRow = (filial: string, primarykey: string) => ({
  tenantid: 'CICOPAL',
  filial,
  primarykey,
  etiqueta: primarykey,
  descricaodoativo: `ATIVO ${primarykey}`,
  qt: 1
});

/** 50 linhas da planilha: 30 na filial A + 20 na filial B. */
const PLANILHA_50 = [
  ...Array.from({ length: 30 }, (_, i) => planilhaRow('010101 CICOPAL GO', `A${String(i + 1).padStart(3, '0')}`)),
  ...Array.from({ length: 20 }, (_, i) => planilhaRow('010102 CICOPAL GO', `B${String(i + 1).padStart(3, '0')}`))
];

const refOf = (tenantid: string, filial: string, primarykey: string): LoadedAssetRef => ({
  tenantid,
  filial,
  primarykey
});

describe('reconcileImport — planilha × base por filial', () => {
  it('50 linhas na planilha e 50 na base: carga liberada', () => {
    const expected = PLANILHA_50.map((row) => refOf(row.tenantid, row.filial, row.primarykey));
    const report = reconcileImport(expected, expected);

    expect(report.ok).toBe(true);
    expect(report.planilha).toBe(50);
    expect(report.gravadas).toBe(50);
    expect(report.distinctKeys).toBe(50);
    expect(report.missing).toEqual([]);
    expect(report.wrongFilial).toEqual([]);
    expect(report.duplicateKeys).toEqual([]);
    expect(report.perFilial).toEqual([
      { filial: '010101 CICOPAL GO', planilha: 30, gravadas: 30 },
      { filial: '010102 CICOPAL GO', planilha: 20, gravadas: 20 }
    ]);
    expect(report.lines[0]).toContain('[CARGA OK] planilha 50 · base 50');
  });

  it('linha ausente na base: bloqueia e nomeia a chave', () => {
    const expected = PLANILHA_50.map((row) => refOf(row.tenantid, row.filial, row.primarykey));
    const found = expected.slice(1); // uma linha perdida

    const report = reconcileImport(expected, found);
    expect(report.ok).toBe(false);
    expect(report.gravadas).toBe(49);
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0]).toContain('A001');
    expect(report.lines[0]).toContain('[CARGA BLOQUEADA]');
    expect(report.lines.join(' ')).toContain('ausente na base: CICOPAL · A001');
  });

  it('chave repetida no próprio arquivo bloqueia (uma linha sobrescreveria a outra)', () => {
    const expected = [
      refOf('CICOPAL', '010101 CICOPAL GO', 'A1'),
      refOf('CICOPAL', '010101 CICOPAL GO', 'A1'),
      refOf('CICOPAL', '010101 CICOPAL GO', 'A2')
    ];
    const report = reconcileImport(expected, [
      refOf('CICOPAL', '010101 CICOPAL GO', 'A1'),
      refOf('CICOPAL', '010101 CICOPAL GO', 'A2')
    ]);

    expect(report.ok).toBe(false);
    expect(report.distinctKeys).toBe(2);
    expect(report.duplicateKeys).toEqual([
      { key: 'CICOPAL\u0000A1', rows: 2 }
    ]);
    expect(report.lines[0]).toContain('1 chave(s) repetida(s) no arquivo');
  });

  it('mesma chave noutra filial bloqueia (a base fica com uma linha só)', () => {
    const expected = [
      refOf('CICOPAL', '010101 CICOPAL GO', 'A1'),
      refOf('CICOPAL', '010102 CICOPAL GO', 'A1')
    ];
    const report = reconcileImport(expected, [refOf('CICOPAL', '010102 CICOPAL GO', 'A1')]);

    expect(report.ok).toBe(false);
    expect(report.wrongFilial).toEqual([
      { key: 'CICOPAL\u0000A1', expected: '010101 CICOPAL GO', found: '010102 CICOPAL GO' }
    ]);
    expect(report.perFilial).toEqual([
      { filial: '010101 CICOPAL GO', planilha: 1, gravadas: 0 },
      { filial: '010102 CICOPAL GO', planilha: 1, gravadas: 1 }
    ]);
  });
});

describe('carga da planilha — portão planilha N · base N', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
  });

  it('50 linhas carregadas = 50 registos na base (30 + 20 por filial)', async () => {
    const gravadas = await DatabaseLoaderService.injetarDadosEmLotes(PLANILHA_50);

    expect(gravadas).toBe(50);
    expect(await db.local_assets.count()).toBe(50);
    expect(await db.ativos.count()).toBe(50);
    // A.3a.3: `assets` deixou de ser escrito pela carga.
    expect(await db.assets.count()).toBe(0);
    expect(await db.local_assets.where('filial').equals('010101 CICOPAL GO').count()).toBe(30);
    expect(await db.local_assets.where('filial').equals('010102 CICOPAL GO').count()).toBe(20);

    const logs = await db.audit_logs.toArray();
    const recon = logs.find((log) => log.acao === 'IMPORT_RECONCILIATION');
    expect(recon).toBeDefined();
    const delta = JSON.parse(String(recon?.delta));
    expect(delta).toMatchObject({ ok: true, planilha: 50, gravadas: 50, distinctKeys: 50 });
    expect(delta.perFilial).toEqual([
      { filial: '010101 CICOPAL GO', planilha: 30, gravadas: 30 },
      { filial: '010102 CICOPAL GO', planilha: 20, gravadas: 20 }
    ]);
  });

  it('chave repetida no arquivo fica com as duas linhas (identidade interna, Fase 2)', async () => {
    const gravadas = await DatabaseLoaderService.injetarDadosEmLotes([
      planilhaRow('010101 CICOPAL GO', 'A1'),
      planilhaRow('010101 CICOPAL GO', 'A1')
    ]);

    // A identidade do registo é interna: a segunda linha não substitui a primeira.
    expect(gravadas).toBe(2);
    expect(await db.local_assets.count()).toBe(2);
    const recon = (await db.audit_logs.toArray()).find((log) => log.acao === 'IMPORT_RECONCILIATION');
    expect(JSON.parse(String(recon?.delta))).toMatchObject({ ok: true, planilha: 2, gravadas: 2 });
  });
});
