// @vitest-environment jsdom
// ============================================================================
// assetKeyMigration.test.ts — chaves antigas → formato do ERP
//
// As bases antigas guardam `primarykey` derivado da etiqueta (`000420`) ou do
// conteúdo (`SEM-ETIQUETA-…`). A carga nova grava a identidade do ERP
// (`010101OBRA102840007`) e, como `bulkPut` não limpa a base, reimportar
// criaria linhas novas ao lado das antigas. A migração reescreve as chaves uma
// vez por instalação.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import { ASSET_KEY_MIGRATION_FLAG, migrateAssetKeysToErpOnce } from '../services/assetKeyMigration';

const asset = (over: Record<string, unknown> = {}) =>
  ({
    id: '000420',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    primarykey: '000420',
    etiqueta: '000420',
    descricaodoativo: 'CADEIRA',
    registro: '1001',
    subreg: '1',
    _conferido: 1,
    _is_synced: 1,
    _is_deleted: 0,
    ...over
  }) as never;

const keysIn = async (table: typeof db.local_assets = db.local_assets) => {
  const rows = await table.toArray();
  return rows.map((r) => String(r.primarykey)).sort();
};

describe('migração única das chaves para o formato do ERP', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
  });

  it('reescreve a chave da etiqueta para filial+registro+subreg, nos três espelhos', async () => {
    await db.local_assets.put(asset());
    await db.ativos.put(asset());
    await db.assets.put(asset());

    const result = await migrateAssetKeysToErpOnce();

    expect(result.migrated).toBe(1);
    expect(await keysIn()).toEqual(['01010110011']);
    expect(await keysIn(db.ativos)).toEqual(['01010110011']);
    expect(await keysIn(db.assets)).toEqual(['01010110011']);

    const row = await db.local_assets.toArray();
    expect(String(row[0].id)).toBe('01010110011');
    // A nuvem tem de conhecer a chave do ERP.
    expect(Number(row[0]._is_synced)).toBe(0);
    // O resto do registo fica intacto.
    expect(String(row[0].descricaodoativo)).toBe('CADEIRA');
    expect(Number(row[0]._conferido)).toBe(1);
    expect(localStorage.getItem(ASSET_KEY_MIGRATION_FLAG)).toBe('done');
  });

  it('reescreve também a chave derivada do conteúdo', async () => {
    await db.local_assets.put(asset({ id: 'SEM-ETIQUETA-ABC123', primarykey: 'SEM-ETIQUETA-ABC123' }));

    expect((await migrateAssetKeysToErpOnce()).migrated).toBe(1);
    expect(await keysIn()).toEqual(['01010110011']);
  });

  it('não mexe em linhas sem registro nem subreg (não têm identidade de ERP)', async () => {
    await db.local_assets.put(asset({ registro: null, subreg: null }));
    await db.local_assets.put(asset({ primarykey: 'PK-DE-ORIGEM', id: 'PK-DE-ORIGEM', registro: null, subreg: null }));

    const result = await migrateAssetKeysToErpOnce();

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(2);
    expect(await keysIn()).toEqual(['000420', 'PK-DE-ORIGEM']);
  });

  it('preserva as duas linhas quando a chave nova colide: a segunda recebe sufixo', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: '000420', id: '000420', descricaodoativo: 'CADEIRA' }),
      asset({ primarykey: '000421', id: '000421', etiqueta: '000421', descricaodoativo: 'MESA' })
    ]);

    const result = await migrateAssetKeysToErpOnce();

    expect(result.migrated).toBe(2);
    expect(result.collisions).toBe(1);
    expect(await keysIn()).toEqual(['01010110011', '01010110011-2']);
    const descricoes = (await db.local_assets.toArray()).map((r) => String(r.descricaodoativo)).sort();
    expect(descricoes).toEqual(['CADEIRA', 'MESA']);
  });

  it('é idempotente: corre uma só vez por instalação', async () => {
    await db.local_assets.put(asset());
    expect((await migrateAssetKeysToErpOnce()).migrated).toBe(1);

    // Mesmo que apareça uma chave antiga depois, a migração não volta a correr.
    await db.local_assets.put(asset({ primarykey: '000999', id: '000999' }));

    const segunda = await migrateAssetKeysToErpOnce();
    expect(segunda.alreadyDone).toBe(true);
    expect(segunda.migrated).toBe(0);
    expect(await keysIn()).toEqual(['000999', '01010110011']);
  });

  it('arranque e sincronização simultâneos partilham a mesma execução', async () => {
    await db.local_assets.put(asset());

    const [a, b] = await Promise.all([migrateAssetKeysToErpOnce(), migrateAssetKeysToErpOnce()]);

    expect(a.migrated).toBe(1);
    expect(b.migrated).toBe(1);
    const logs = await db.audit_logs.filter((log) => log.acao === 'ASSET_KEY_MIGRATION').toArray();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].details)).toContain('1 reescrito(s)');
  });

  it('registra o resultado em audit_logs', async () => {
    await db.local_assets.put(asset());

    await migrateAssetKeysToErpOnce();

    const logs = await db.audit_logs.filter((log) => log.acao === 'ASSET_KEY_MIGRATION').toArray();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].details)).toContain('formato do ERP');
  });
});
