// @vitest-environment jsdom
// ============================================================================
// migracaoV10.test.ts — A.3a.4 em dois passos.
//
// v10: RESGATE. Compara `assets` com as duas tabelas vivas por
// `[tenantid+primarykey]` e copia para `local_assets`/`ativos` só o que falta.
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

  it('linha já presente nas tabelas vivas não é sobrescrita pelo espelho morto', async () => {
    const v9 = abrirV9();
    await v9.open();
    await v9.table('ativos').put(linha('PK-1', { etiqueta: 'VIVA' }));
    await v9.table('assets').put(linha('PK-1', { etiqueta: 'ATRASADA' }));
    v9.close();

    const db = createDb();
    await db.open();

    // `ativos` mantém o que o app lia; `local_assets` (vazio) recebe o resgate.
    expect(await db.table('ativos').get(['CICOPAL', 'PK-1'])).toMatchObject({ etiqueta: 'VIVA' });
    expect(await db.table('local_assets').get(['CICOPAL', 'PK-1'])).toMatchObject({
      etiqueta: 'ATRASADA'
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
