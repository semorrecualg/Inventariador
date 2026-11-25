// @vitest-environment jsdom
// ============================================================================
// migracaoV10.test.ts — A.3a.4.
//
// A v10 remove a store `assets`. A prova monta uma base v9 com as três tabelas
// (uma linha em cada), reabre na v10 e verifica que: a store desapareceu, os
// ativos das duas tabelas vivas continuam lá e a base fica na versão 10.
// ============================================================================
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';

const NOME = 'InventoryLocalStore_v10_prova';

const linha = (primarykey: string) =>
  ({
    tenantid: 'CICOPAL',
    primarykey,
    id: primarykey,
    filial: '010101 CICOPAL GO',
    etiqueta: '000123',
    _is_synced: 0,
    _is_deleted: 0
  }) as Record<string, unknown>;

const abrirV9 = () => {
  const d = new Dexie(NOME);
  d.version(9).stores({
    local_assets: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
    ativos: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
    assets: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
    audit_logs: 'id, updated_at'
  });
  return d;
};

const abrirV10 = () => {
  const d = new Dexie(NOME);
  d.version(9).stores({
    local_assets: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
    ativos: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
    assets: '[tenantid+primarykey], primarykey, filial, _is_synced, [tenantid+filial]',
    audit_logs: 'id, updated_at'
  });
  d.version(10).stores({ assets: null });
  return d;
};

describe('A.3a.4 — v10 remove a store `assets`', () => {
  it('apaga a store e preserva as linhas das duas tabelas vivas', async () => {
    await Dexie.delete(NOME);

    const v9 = abrirV9();
    await v9.open();
    await v9.table('local_assets').put(linha('PK-1'));
    await v9.table('ativos').put(linha('PK-1'));
    await v9.table('assets').put(linha('PK-1'));
    expect(await v9.table('assets').count()).toBe(1);
    v9.close();

    const v10 = abrirV10();
    await v10.open();

    expect(v10.verno).toBe(10);
    expect(v10.tables.map((t) => t.name)).not.toContain('assets');
    expect(await v10.table('local_assets').count()).toBe(1);
    expect(await v10.table('ativos').count()).toBe(1);
    // O ativo continua a ser encontrado pela chave composta, como antes.
    expect(await v10.table('ativos').get(['CICOPAL', 'PK-1'])).toMatchObject({ etiqueta: '000123' });

    v10.close();
    await Dexie.delete(NOME);
  });
});
