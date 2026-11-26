// @vitest-environment jsdom
// src/__tests__/localAddressCreate.test.ts
// «Nova Localidade» gravava só `app_manual_locations` (localStorage) e a lista
// do ENDEREÇO FÍSICO continuava sem ela. Além disso, gravar uma única linha em
// `addresses` numa filial que vivia do fallback (localidades derivadas dos
// ativos) trocava a lista inteira por essa linha — o índice, quando tem linhas,
// é a fonte exclusiva. `ensureLocalAddress` é aditivo por isso.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { localDb } from '../services/localDbService';
import { db } from '../services/sqliteService';

const TENANT = 'CICOPAL';
const UNIT = '010101 CICOPAL GO';
const UNIT_GRAVADA = '010101_CICOPAL_GO';

const assetRow = (endereco: string, primarykey: string) => ({
  tenantid: TENANT,
  primarykey,
  id: primarykey,
  filial: UNIT_GRAVADA,
  endereco,
  _is_deleted: 0,
  _conferido: 0
});

const putAssets = (rows: Array<Record<string, unknown>>) =>
  db.ativos.bulkPut(rows as unknown as Parameters<typeof db.ativos.bulkPut>[0]);

beforeEach(async () => {
  sessionStorage.clear();
  localStorage.clear();
  sessionStorage.setItem('tenantid', TENANT);
  await db.addresses.clear();
  await db.local_assets.clear();
  await db.ativos.clear();
});

describe('ensureLocalAddress — o local criado aparece na lista', () => {
  it('grava a localidade nova sem esconder as que vinham dos ativos', async () => {
    await putAssets([
      assetRow('CORREDOR A', 'K1'),
      assetRow('CORREDOR B', 'K2')
    ]);

    const criada = await localDb.assets.ensureLocalAddress(UNIT, 'SALA 101');
    expect(criada).toBe(true);

    const rows = await localDb.assets.getLocationsWithStats(UNIT);
    expect(rows.map(r => r.displayName)).toEqual(['CORREDOR A', 'CORREDOR B', 'SALA 101']);

    // Localidade nova ainda sem ativos: entra com 0/0 para poder ser escolhida.
    expect(rows.find(r => r.displayName === 'SALA 101')).toMatchObject({ total: 0, checked: 0 });

    // E ficou persistida no índice, com o contrato e a filial da sessão.
    const noIndice = await db.addresses.toArray();
    expect(noIndice.filter(r => r.codigo_endereco === 'SALA 101')).toHaveLength(1);
    expect(noIndice.find(r => r.codigo_endereco === 'SALA 101')).toMatchObject({
      tenantid: TENANT,
      filial: UNIT
    });
  });

  it('é idempotente: repetir o mesmo local não duplica a linha', async () => {
    await putAssets([assetRow('CORREDOR A', 'K1')]);

    expect(await localDb.assets.ensureLocalAddress(UNIT, 'SALA 101')).toBe(true);
    expect(await localDb.assets.ensureLocalAddress(UNIT, 'SALA 101')).toBe(false);

    const iguais = (await db.addresses.toArray()).filter(r => r.codigo_endereco === 'SALA 101');
    expect(iguais).toHaveLength(1);

    const rows = await localDb.assets.getLocationsWithStats(UNIT);
    expect(rows.filter(r => r.displayName === 'SALA 101')).toHaveLength(1);
  });

  it('reconhece a filial gravada com `_` e não duplica o que já está no índice', async () => {
    await db.addresses.bulkAdd([{
      tenantid: TENANT,
      filial: UNIT_GRAVADA,
      codigo_endereco: 'CORREDOR A',
      setor: '',
      bloco: '',
      _is_synced: 1
    }] as Parameters<typeof db.addresses.bulkAdd>[0]);

    await localDb.assets.ensureLocalAddress(UNIT, 'SALA 101');

    const rows = await localDb.assets.getLocationsWithStats(UNIT_GRAVADA);
    expect(rows.map(r => r.displayName)).toEqual(['CORREDOR A', 'SALA 101']);

    // A consulta pelo nome com espaços também vê as duas linhas.
    const pelaUnidadeDoCartao = await localDb.assets.getLocationsWithStats(UNIT);
    expect(pelaUnidadeDoCartao.map(r => r.displayName)).toEqual(['CORREDOR A', 'SALA 101']);
  });

  it('não escreve no índice de outro contrato', async () => {
    sessionStorage.setItem('tenantid', 'OUTRO_TENANT');

    await localDb.assets.ensureLocalAddress(UNIT, 'SALA 101');

    const rows = await db.addresses.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantid).toBe('OUTRO_TENANT');

    sessionStorage.setItem('tenantid', TENANT);
    expect(await localDb.assets.getLocationsWithStats(UNIT)).toHaveLength(0);
  });

  it('não persiste o «SEM LOCAL» sintético, mas mantém-no na lista', async () => {
    await putAssets([
      { tenantid: TENANT, primarykey: 'K1', id: 'K1', filial: UNIT_GRAVADA, _is_deleted: 0, _conferido: 0 }
    ]);

    await localDb.assets.ensureLocalAddress(UNIT, 'SALA 101');

    const codigos = (await db.addresses.toArray()).map(r => r.codigo_endereco);
    expect(codigos).toEqual(['SALA 101']);
    expect(codigos).not.toContain('SEM LOCAL');

    const rows = await localDb.assets.getLocationsWithStats(UNIT);
    expect(rows.map(r => r.displayName)).toEqual(['SEM LOCAL', 'SALA 101']);
    expect(rows.find(r => r.displayName === 'SEM LOCAL')).toMatchObject({ total: 1, checked: 0 });
  });

  it('exige contrato, filial e nome do local', async () => {
    await expect(localDb.assets.ensureLocalAddress(UNIT, '   ')).rejects.toThrow(/nome do local/i);

    sessionStorage.clear();
    await expect(localDb.assets.ensureLocalAddress(UNIT, 'SALA 101')).rejects.toThrow(/contrato/i);
  });
});
