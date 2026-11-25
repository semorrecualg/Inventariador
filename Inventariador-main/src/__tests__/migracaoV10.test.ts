// @vitest-environment jsdom
// ============================================================================
// migracaoV10.test.ts — A.3a.4 em dois passos.
//
// v10: RESGATE. Compara `assets` com as duas tabelas vivas por
// `[tenantid+primarykey]` e acerta os dois espelhos: se a chave já existe numa
// delas, é a linha viva que se copia para a outra; a versão de `assets` só
// entra quando a chave não existe em nenhuma.
// v11: REMOÇÃO. A store `assets` sai do schema.
//
// O teste NÃO reimplementa a migração: declara as versões com
// `registarResgateEExtincaoDoEspelho`, a mesma função que o construtor de
// `InventoryDexieDatabase` chama. Se o resgate de produção mudar (comparação,
// chave, normalização), estes casos apanham.
// ============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { registarResgateEExtincaoDoEspelho } from '../services/migrationEspelhoAssets';

const NOME = 'InventoryLocalStore_v10_prova';

const linha = (primarykey: string, over: Record<string, unknown> = {}) =>
  ({
    tenantid: 'CICOPAL',
    primarykey,
    id: primarykey,
    filial: '010101 CICOPAL GO',
    etiqueta: '000123',
    _is_synced: 0,
    _is_deleted: 0,
    ...over
  }) as Record<string, unknown>;

const STORES_V9 = {
  local_assets: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
  ativos: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
  assets: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
  audit_logs: 'id, updated_at'
};

/** Base v9 com a MESMA declaração de v10/v11 da produção. */
const createDb = () => {
  const d = new Dexie(NOME);
  d.version(9).stores(STORES_V9);
  registarResgateEExtincaoDoEspelho(d);
  return d;
};

const abrirV9 = () => {
  const d = new Dexie(NOME);
  d.version(9).stores(STORES_V9);
  return d;
};

describe('A.3a.4 — resgate na v10, remoção na v11', () => {
  beforeEach(async () => {
    await Dexie.delete(NOME);
  });

  afterEach(async () => {
    await Dexie.delete(NOME);
  });

  it('linha que só existia em `assets` é copiada para as duas tabelas', async () => {
    const v9 = abrirV9();
    await v9.open();
    await v9.table('assets').put(linha('PK-1', { etiqueta: 'SO-EM-ASSETS' }));
    v9.close();

    const db = createDb();
    await db.open();

    expect(db.verno).toBe(11);
    expect(db.tables.map((t) => t.name)).not.toContain('assets');
    expect(await db.table('local_assets').get(['CICOPAL', 'PK-1'])).toMatchObject({
      etiqueta: 'SO-EM-ASSETS'
    });
    expect(await db.table('ativos').get(['CICOPAL', 'PK-1'])).toMatchObject({
      etiqueta: 'SO-EM-ASSETS'
    });
    db.close();
  });

  it('chave já existente numa tabela viva propaga a linha viva, não a atrasada de `assets`', async () => {
    const v9 = abrirV9();
    await v9.open();
    // PK-1 só em `ativos`; PK-2 só em `local_assets`. Nos dois casos `assets`
    // tem uma versão atrasada que não pode ganhar.
    await v9.table('ativos').put(linha('PK-1', { etiqueta: 'VIVA-ATIVOS' }));
    await v9.table('local_assets').put(linha('PK-2', { etiqueta: 'VIVA-LOCAL' }));
    await v9.table('assets').bulkPut([
      linha('PK-1', { etiqueta: 'ATRASADA-1' }),
      linha('PK-2', { etiqueta: 'ATRASADA-2' })
    ]);
    v9.close();

    const db = createDb();
    await db.open();

    // Os dois espelhos ficam iguais, com o conteúdo vivo dos dois lados.
    expect(await db.table('ativos').get(['CICOPAL', 'PK-1'])).toMatchObject({ etiqueta: 'VIVA-ATIVOS' });
    expect(await db.table('local_assets').get(['CICOPAL', 'PK-1'])).toMatchObject({
      etiqueta: 'VIVA-ATIVOS'
    });
    expect(await db.table('local_assets').get(['CICOPAL', 'PK-2'])).toMatchObject({
      etiqueta: 'VIVA-LOCAL'
    });
    expect(await db.table('ativos').get(['CICOPAL', 'PK-2'])).toMatchObject({
      etiqueta: 'VIVA-LOCAL'
    });
    db.close();
  });

  it('a comparação é pela chave composta: mesmo primarykey noutro contrato não colide', async () => {
    const v9 = abrirV9();
    await v9.open();
    await v9.table('assets').put(linha('PK-1', { tenantid: 'OUTRO', etiqueta: 'OUTRO-CONTRATO' }));
    v9.close();

    const db = createDb();
    await db.open();

    expect(await db.table('local_assets').get(['CICOPAL', 'PK-1'])).toBeUndefined();
    expect(await db.table('local_assets').get(['OUTRO', 'PK-1'])).toMatchObject({
      etiqueta: 'OUTRO-CONTRATO'
    });
    db.close();
  });
});
