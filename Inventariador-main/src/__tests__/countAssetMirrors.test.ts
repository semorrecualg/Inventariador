// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqliteService, invalidateTenantCaseMarker, type DexieAsset } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';

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
    await expect(db.local_assets.get(['cicopal', 'b'])).resolves.toBeUndefined();
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

  it('a importação invalida o marcador antes de gravar', async () => {
    await expect(sqliteService.migrateLegacyTenantids()).resolves.toEqual({ repaired: 0, skipped: 0 });
    // Importação vazia: só interessa o efeito de invalidação do entrypoint.
    await DatabaseLoaderService.injetarDadosEmLotes([]);
    await db.local_assets.bulkPut([row('cicopal', 'b')]);

    // Com o marcador invalidado a contagem varre e vê a linha em minúsculas.
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
