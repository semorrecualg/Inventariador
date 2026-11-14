// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqliteService, type DexieAsset } from '../services/sqliteService';

/** Linha mínima: a contagem só lê `tenantid`; o resto não influencia. */
const row = (tenantid: string, primarykey: string): DexieAsset =>
  ({ id: primarykey, primarykey, tenantid } as unknown as DexieAsset);

describe('countAssetMirrors (F0)', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
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

    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toEqual({
      local_assets: 2,
      ativos: 1,
      assets: 2,
      total: 2
    });
  });

  it('cai na varredura quando o índice não acha o tenant (linha legada em minúsculas)', async () => {
    // A v7 grava `tenantid` em UPPER; esta linha representa resíduo anterior.
    await db.local_assets.bulkPut([row('cicopal', 'legacy-1')]);

    await expect(sqliteService.countAssetMirrors('CICOPAL')).resolves.toEqual({
      local_assets: 1,
      ativos: 0,
      assets: 0,
      total: 1
    });
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
