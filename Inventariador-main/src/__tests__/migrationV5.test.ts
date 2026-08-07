// src/__tests__/migrationV5.test.ts
// Fase C4 — migração Dexie `version(5)` idempotente (dry-run, flag
// NORMALIZE_ON_UPGRADE). docs/PLANO_FASE_C_HIGIENIZACAO.md §6.1/§6.2.
//
// Cobertura (§6.2):
//  (a) banco v4 com dados "sujos" → upgrade → chaves canônicas + valores K/T/N/D/F;
//  (b) roda 2× → idempotente (zero alterações na 2ª execução);
//  (c) dados T preservam caixa (coberto em (a) — status/descricaodoativo);
//  (d) dry-run não grava;
//  (e) checksum antes/depois coerente (canônico → iguais);
//  (f) flag enabled=false → etapa de dados pulada;
//  (g) addresses: reconcile aditivo (preserva existentes, adiciona derivadas).
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import {
  normalizeAssetRecordV5,
  runMigrationV5DryRun,
  runV5Upgrade,
  assetChecksum
} from '../services/migrationV5';
import type { V5Source } from '../services/migrationV5';

// Assinaturas das tabelas afetadas (espelham v4/v5 do InventoryDexieDatabase).
const STORES = {
  local_assets: 'primarykey, filial, _is_synced, [tenantid+filial]',
  ativos: 'primarykey, filial, _is_synced, [tenantid+filial]',
  assets: 'primarykey, filial, _is_synced, [tenantid+filial]',
  addresses: '++id, [tenantid+filial], codigo_endereco, setor, bloco, _is_synced'
};

/** Cria um banco de teste com a cadeia v4 → (opcional) v5 com o upgrade real. */
function createDb(name: string, withV5Upgrade = false): Dexie {
  const d = new Dexie(name);
  d.version(4).stores(STORES);
  if (withV5Upgrade) {
    d.version(5).stores(STORES).upgrade((tx) => runV5Upgrade(tx));
  }
  return d;
}

/** Registro "sujo" legado: chaves UPPER + valores fora do padrão por classe. */
function DIRTY(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'PK-001',
    primarykey: 'PK-001',
    tenantid: 'CICOPAL',
    ENDERECO: ' Corredor A ',
    ETIQUETA: 'ET-001 ',
    SERIAL: ' sn-01 ',
    REGISTRO: 'REG- x ',
    SUBREG: ' s1 ',
    CENTRODECUSTO: ' cc-01 ',
    CONTACONTABIL: '1.2.3.4',
    CNPJ: '12.345.678/0001-90',
    NOTAFISCAL: 'nf 2023/01',
    STATUS: ' Pendente ',
    DESCRICAODOATIVO: '  Microcomputador   HP ',
    NOMEFORNECEDOR: ' Dell ',
    FILIAL: '010101 CICOPAL GO',
    QT: '5',
    VLRAQUISIC: '1500.50',
    SN1_RECNO: '10',
    SN3_RECNO: '20',
    DATAAQUISIC: '31/12/2024',
    DATABAIXA: '01/02/2025',
    _is_synced: true,
    _conferido: false,
    _plaquetado: '1',
    TAG_INVENTARIO: 'TI-RUNTIME',
    ...over
  };
}

describe('migrationV5 — normalização de dados version(5) (Fase C4)', () => {
  it('(a) banco v4 com dados sujos → upgrade → chaves canônicas + valores por classe', async () => {
    const name = 'c4_upgrade_a';
    await Dexie.delete(name);

    const seed = createDb(name, false);
    await seed.open();
    await seed.table('assets').bulkAdd([DIRTY()]);
    await seed.table('local_assets').bulkAdd([DIRTY()]);
    await seed.table('ativos').bulkAdd([DIRTY()]);
    await seed.close();

    const upgraded = createDb(name, true);
    await upgraded.open();

    for (const tbl of ['assets', 'local_assets', 'ativos'] as const) {
      const rows = await upgraded.table(tbl).toArray();
      expect(rows).toHaveLength(1);
      const r = rows[0] as unknown as Record<string, unknown>;

      // PK imutável
      expect(r.primarykey).toBe('PK-001');
      expect(r.id).toBe('PK-001');

      // Classe K — UPPER + TRIM + expurgo
      expect(r.endereco).toBe('CORREDORA');
      expect(r.serial).toBe('SN-01');
      expect(r.registro).toBe('REG-X');
      expect(r.subreg).toBe('S1');
      expect(r.centrodecusto).toBe('CC-01');
      expect(r.contacontabil).toBe('1234');
      expect(r.cnpj).toBe('123456780001-90');
      expect(r.notafiscal).toBe('NF202301');

      // Identidade — TRIM apenas (caixa preservada)
      expect(r.etiqueta).toBe('ET-001');

      // filial — UPPER + TRIM com espaços internos (desvio SRE)
      expect(r.filial).toBe('010101 CICOPAL GO');

      // Classe T — caixa preservada + colapso de espaços
      expect(r.status).toBe('Pendente');
      expect(r.descricaodoativo).toBe('Microcomputador HP');
      expect(r.nomefornecedor).toBe('Dell');

      // Classe N — numérico
      expect(r.qt).toBe(5);
      expect(r.vlraquisic).toBe(1500.5);
      expect(r.sn1_recno).toBe(10);
      expect(r.sn3_recno).toBe(20);

      // Classe D — ISO YYYY-MM-DD
      expect(r.dataaqusic).toBe('2024-12-31');
      expect(r.databaixa).toBe('2025-02-01');

      // Classe F — 0|1 unificado
      expect(r._is_synced).toBe(1);
      expect(r._conferido).toBe(0);
      expect(r._plaquetado).toBe(1);

      // Chaves UPPER removidas; runtime preservada
      expect(r.ENDERECO).toBeUndefined();
      expect(r.SERIAL).toBeUndefined();
      expect(r.STATUS).toBeUndefined();
      expect(r.TAG_INVENTARIO).toBe('TI-RUNTIME');
    }
  });

  it('(b) roda 2× → idempotente (zero alterações na 2ª execução)', async () => {
    const name = 'c4_idem_b';
    await Dexie.delete(name);

    const seed = createDb(name, false);
    await seed.open();
    await seed.table('assets').bulkAdd([DIRTY()]);
    await seed.close();

    const d = createDb(name, true);
    await d.open();
    const afterFirst = JSON.parse(JSON.stringify(await d.table('assets').toArray()));

    // 2ª execução do runner dentro de transação — deve ser no-op
    await d.transaction('rw', d.tables, async (tx) => {
      await runV5Upgrade(tx);
    });
    const afterSecond = JSON.parse(JSON.stringify(await d.table('assets').toArray()));
    expect(afterSecond).toEqual(afterFirst);

    // Primitivo puro: 2ª passada por registro → changed=false
    for (const row of afterSecond) {
      const rec = row as Record<string, unknown>;
      const first = normalizeAssetRecordV5(rec);
      const second = normalizeAssetRecordV5(first.record);
      expect(second.changed).toBe(false);
    }
  });

  it('(d) dry-run não grava (relatório emitido + dados intactos)', async () => {
    const name = 'c4_dry_d';
    await Dexie.delete(name);

    const seed = createDb(name, false);
    await seed.open();
    await seed.table('assets').bulkAdd([DIRTY()]);
    await seed.table('local_assets').bulkAdd([DIRTY()]);
    await seed.table('ativos').bulkAdd([DIRTY()]);
    await seed.close();

    const d = createDb(name, false);
    await d.open();

    const report = await runMigrationV5DryRun(d as unknown as V5Source);
    expect(report.tables).toHaveLength(3);
    for (const t of report.tables) {
      expect(t.count).toBe(1);
      expect(t.changed).toBe(1);
      expect(t.fieldsChanged).toBeGreaterThan(0);
    }
    expect(report.checksumBefore).not.toBe(report.checksumAfter);
    expect(report.idempotent).toBe(true);
    expect(report.skipped).toBe(false);

    // Nada foi gravado: UPPER keys permanecem no banco
    const rows = await d.table('assets').toArray();
    const r = rows[0] as unknown as Record<string, unknown>;
    expect(r.ENDERECO).toBe(' Corredor A ');
    expect(r.endereco).toBeUndefined();
  });

  it('(e) checksum antes/depois coerente — dados canônicos → iguais', async () => {
    const name = 'c4_checksum_e';
    await Dexie.delete(name);

    const d = createDb(name, false);
    await d.open();

    const dirty = DIRTY();
    const clean = normalizeAssetRecordV5(dirty).record;
    expect(assetChecksum(dirty)).not.toBe(assetChecksum(clean));

    await d.table('assets').bulkAdd([clean]);
    const report = await runMigrationV5DryRun(d as unknown as V5Source);
    expect(report.tables[0].changed).toBe(0);
    expect(report.checksumBefore).toBe(report.checksumAfter);
    expect(report.idempotent).toBe(true);
  });

  it('(f) enabled=false → etapa de dados pulada (flag de rollback §9.2)', async () => {
    const name = 'c4_skip_f';
    await Dexie.delete(name);

    const d = createDb(name, false);
    await d.open();
    await d.table('assets').bulkAdd([DIRTY()]);

    await d.transaction('rw', d.tables, async (tx) => {
      await runV5Upgrade(tx, { enabled: false });
    });

    const rows = await d.table('assets').toArray();
    const r = rows[0] as unknown as Record<string, unknown>;
    expect(r.ENDERECO).toBe(' Corredor A '); // intacto
    expect(r.endereco).toBeUndefined();
  });

  it('(g) addresses: reconcile aditivo preserva existentes e adiciona as derivadas', async () => {
    const name = 'c4_addr_g';
    await Dexie.delete(name);

    const seed = createDb(name, false);
    await seed.open();
    await seed.table('assets').bulkAdd([
      DIRTY(),
      DIRTY({ id: 'PK-002', primarykey: 'PK-002', ENDERECO: 'SALA 3', ETIQUETA: 'ET-002' })
    ]);
    // Linha existente NÃO derivada dos ativos (metadata manual) — deve ser preservada
    await seed.table('addresses').bulkAdd([{
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      codigo_endereco: 'MANUAL-X',
      setor: 'A',
      bloco: 'B',
      _is_synced: 0
    }]);
    await seed.close();

    const d = createDb(name, true);
    await d.open();

    const addr = await d.table('addresses').toArray();
    const codigos = addr
      .map((r) => String((r as Record<string, unknown>).codigo_endereco))
      .sort();
    expect(codigos).toContain('MANUAL-X'); // preservada
    expect(codigos).toContain('CORREDORA'); // derivada (endereco normalizado)
    expect(codigos).toContain('SALA3'); // derivada (classe K)

    const derived = addr.find((r) => (r as Record<string, unknown>).codigo_endereco === 'CORREDORA') as Record<string, unknown>;
    expect(derived).toMatchObject({
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      setor: '',
      bloco: '',
      _is_synced: 1
    });

    // 2ª execução do runner → nenhuma linha nova (aditivo idempotente)
    await d.transaction('rw', d.tables, async (tx) => {
      await runV5Upgrade(tx);
    });
    const addr2 = await d.table('addresses').toArray();
    expect(addr2.length).toBe(addr.length);
  });
});
