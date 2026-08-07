// src/__tests__/securityExport.test.ts
// FASE 0 — TESTE DE BACKUP → RESTORE DE PONTA A PONTA (docs/MIGRACAO_HIBRIDA.md,
// item 4 / critério de aceite).
//
// Cobre o `securityExportService`:
//  - snapshot completo com contagem + checksum SHA-256 por tabela;
//  - determinismo do checksum (dados idênticos → mesmo hash; dados diferentes → hash distinto);
//  - restore de ponta a ponta reproduzindo dados idênticos (round-trip de checksum);
//  - recusa de formato inválido e de snapshot mais novo que o banco-alvo (anti-downgrade);
//  - tolerância a tabelas ausentes no banco-alvo e isolamento de tabelas fora do manifesto.
// Polyfill de IndexedDB para o ambiente Node (Vitest) — permite teste REAL de
// backup → restore com Dexie de ponta a ponta (critério de aceite da Fase 0).
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import Dexie from 'dexie';
import {
  buildSecurityExport,
  restoreSecurityExport,
  SECURITY_EXPORT_FORMAT,
  type SecurityExportManifest
} from '../services/securityExportService';

const DB_PREFIX = 'SecurityExportTest';
let counter = 0;

/** Cria um banco Dexie isolado com duas tabelas (espelho do contrato de teste). */
function makeDb(name: string): Dexie {
  const d = new Dexie(name);
  d.version(1).stores({
    assets_test: 'primarykey, filial, _is_synced',
    config_test: 'key'
  });
  return d;
}

describe('securityExport — export de segurança Fase 0', () => {
  it('captura contagem + checksum + registros de todas as tabelas', async () => {
    const name = `${DB_PREFIX}_${++counter}`;
    const src = makeDb(name);
    await src.open();
    try {
      await src.table('assets_test').bulkAdd([
        { primarykey: 'B-002', filial: 'FILIAL A', _is_synced: 0 },
        { primarykey: 'A-001', filial: 'FILIAL A', _is_synced: 1 }
      ]);
      await src.table('config_test').put({ key: 'tenantid', value: 'T1' });

      const manifest = await buildSecurityExport(src);

      expect(manifest.format).toBe(SECURITY_EXPORT_FORMAT);
      expect(manifest.schemaVersion).toBe(1);
      expect(Object.keys(manifest.tables).sort()).toEqual(['assets_test', 'config_test']);
      expect(manifest.tables.assets_test.count).toBe(2);
      expect(manifest.tables.config_test.count).toBe(1);
      // SHA-256 hex de 64 chars
      expect(manifest.tables.assets_test.checksum).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await src.delete();
    }
  });

  it('checksum é estável para dados idênticos e diverge para dados diferentes', async () => {
    const name = `${DB_PREFIX}_${++counter}`;
    const a = makeDb(name);
    await a.open();
    try {
      await a.table('assets_test').bulkAdd([
        { primarykey: 'A-001', filial: 'F1' },
        { primarykey: 'B-002', filial: 'F1' }
      ]);

      const m1 = await buildSecurityExport(a);
      const m2 = await buildSecurityExport(a);
      expect(m1.tables.assets_test.checksum).toBe(m2.tables.assets_test.checksum);

      // Inserção altera o checksum da tabela afetada (e a contagem)
      await a.table('assets_test').put({ primarykey: 'C-003', filial: 'F1' });
      const m3 = await buildSecurityExport(a);
      expect(m3.tables.assets_test.checksum).not.toBe(m1.tables.assets_test.checksum);
      expect(m3.tables.assets_test.count).toBe(3);
    } finally {
      await a.delete();
    }
  });

  it('restore ponta-a-ponta reproduz dados idênticos (round-trip de checksum)', async () => {
    const srcName = `${DB_PREFIX}_src_${++counter}`;
    const dstName = `${DB_PREFIX}_dst_${++counter}`;
    const src = makeDb(srcName);
    const dst = makeDb(dstName);
    await src.open();
    await dst.open();
    try {
      await src.table('assets_test').bulkAdd([
        { primarykey: 'A-001', filial: 'FILIAL A', _is_synced: 1, status: 'ATIVO' },
        { primarykey: 'B-002', filial: 'FILIAL A', _is_synced: 0, status: 'SOBRA_FISICA' }
      ]);
      await src.table('config_test').put({ key: 'active_campaign', value: 'CAMP-1' });

      const manifest = await buildSecurityExport(src);
      const result = await restoreSecurityExport(manifest, dst);

      expect(result.restored.assets_test).toBe(2);
      expect(result.restored.config_test).toBe(1);
      expect(result.skipped).toEqual([]);

      // Re-export do banco restaurado deve ter checksum IDÊNTICO (zero perda)
      const reExport = await buildSecurityExport(dst);
      expect(reExport.tables.assets_test.count).toBe(2);
      expect(reExport.tables.assets_test.checksum).toBe(manifest.tables.assets_test.checksum);
      expect(reExport.tables.config_test.checksum).toBe(manifest.tables.config_test.checksum);

      // Spot-check dos valores restaurados
      const rows = await dst.table('assets_test').toArray();
      expect(rows).toHaveLength(2);
      const byKey = Object.fromEntries(rows.map(r => [r.primarykey, r]));
      expect(byKey['A-001'].status).toBe('ATIVO');
      expect(byKey['B-002'].status).toBe('SOBRA_FISICA');
    } finally {
      await src.delete();
      await dst.delete();
    }
  });

  it('restore limpa o destino e substitui pelo conteúdo do snapshot', async () => {
    const srcName = `${DB_PREFIX}_src2_${++counter}`;
    const dstName = `${DB_PREFIX}_dst2_${++counter}`;
    const src = makeDb(srcName);
    const dst = makeDb(dstName);
    await src.open();
    await dst.open();
    try {
      // Destino com dados antigos/órfãos que devem ser substituídos
      await dst.table('assets_test').bulkAdd([
        { primarykey: 'Z-999', filial: 'STALE' },
        { primarykey: 'Y-888', filial: 'STALE' }
      ]);
      await src.table('assets_test').bulkAdd([{ primarykey: 'X-001', filial: 'F1', _is_synced: 0 }]);
      await src.table('config_test').put({ key: 'k', value: 'v' });

      const manifest = await buildSecurityExport(src);
      await restoreSecurityExport(manifest, dst);

      const dstRows = await dst.table('assets_test').toArray();
      expect(dstRows).toHaveLength(1);
      expect(dstRows[0].primarykey).toBe('X-001');
    } finally {
      await src.delete();
      await dst.delete();
    }
  });

  it('recusa formato inválido e snapshot mais novo que o banco-alvo (anti-downgrade)', async () => {
    const dstName = `${DB_PREFIX}_dst3_${++counter}`;
    const dst = makeDb(dstName);
    await dst.open();
    try {
      await expect(restoreSecurityExport({} as never, dst)).rejects.toThrow(/Formato/);

      const tooNew: SecurityExportManifest = {
        format: SECURITY_EXPORT_FORMAT,
        version: '1.0',
        schemaVersion: 99,
        exportedAt: new Date().toISOString(),
        source: 'DEXIE_INDEXEDDB',
        tables: {}
      };
      await expect(restoreSecurityExport(tooNew, dst)).rejects.toThrow(/downgrade/);
    } finally {
      await dst.delete();
    }
  });

  it('pula tabelas ausentes no banco-alvo e não toca tabelas fora do manifesto', async () => {
    const srcName = `${DB_PREFIX}_src3_${++counter}`;
    const dstName = `${DB_PREFIX}_dst4_${++counter}`;
    const src = makeDb(srcName);
    const dst = new Dexie(dstName);
    dst.version(1).stores({ assets_test: 'primarykey', extra_test: 'key' }); // sem config_test
    await src.open();
    await dst.open();
    try {
      await src.table('assets_test').bulkAdd([{ primarykey: 'A-001' }]);
      await src.table('config_test').put({ key: 'k', value: 'v' });
      // Tabela fora do manifesto não pode ser destruída por restore parcial
      await dst.table('extra_test').put({ key: 'preserved', value: 'sim' });
      await dst.table('assets_test').put({ primarykey: 'A-001', filial: 'OLD' });

      const manifest = await buildSecurityExport(src);
      const result = await restoreSecurityExport(manifest, dst);

      expect(result.restored.assets_test).toBe(1);
      expect(result.skipped).toContain('config_test');
      const extra = await dst.table('extra_test').toArray();
      expect(extra).toHaveLength(1);
      expect(extra[0].value).toBe('sim');
      const restoredAsset = await dst.table('assets_test').toArray();
      expect(restoredAsset[0].filial).toBeUndefined(); // substituído pelo snapshot (sem filial)
    } finally {
      await src.delete();
      await dst.delete();
    }
  });
});
