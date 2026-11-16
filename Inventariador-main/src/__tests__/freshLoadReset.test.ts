// @vitest-environment jsdom
// ============================================================================
// freshLoadReset.test.ts — preparação do dispositivo para nova carga
//
// Depois de a nuvem ser reiniciada, a base local continua com as linhas e as
// chaves antigas, e as flags de migração ficam `done`: o primeiro sync reenvia
// tudo e o reset da nuvem perde o efeito. A rotina do Gestor de Base limpa o
// inventário local, o espelho virtual e as flags.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { clearVirtualSnapshotMock } = vi.hoisted(() => ({
  clearVirtualSnapshotMock: vi.fn(async () => undefined)
}));
vi.mock('../services/localDbService', () => ({
  clearVirtualSnapshot: clearVirtualSnapshotMock
}));

import { db } from '../services/sqliteService';
import { resetLocalBaseForFreshLoad, FRESH_LOAD_FLAGS } from '../services/localBaseReset';

const asset = (primarykey: string) =>
  ({
    id: primarykey,
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    primarykey,
    etiqueta: primarykey,
    registro: '1001',
    subreg: '1',
    _is_synced: 1,
    _is_deleted: 0
  }) as never;

describe('resetLocalBaseForFreshLoad', () => {
  beforeEach(async () => {
    localStorage.clear();
    clearVirtualSnapshotMock.mockClear();
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.addresses.clear();
    await db.audit_logs.clear();
  });

  it('limpa os três espelhos, os endereços e a auditoria local', async () => {
    await db.local_assets.bulkPut([asset('000420'), asset('000421')]);
    await db.ativos.bulkPut([asset('000420'), asset('000421')]);
    await db.assets.bulkPut([asset('000420'), asset('000421')]);
    await db.addresses.put({ tenantid: 'CICOPAL', filial: '010101', codigo_endereco: 'A-1' } as never);
    await db.audit_logs.put({
      id: 'LOG_1', usuario: 'x', acao: 'SYNC', tabela: 'local_assets',
      registro_id: '000420', details: 'teste', delta: null, updated_at: new Date().toISOString()
    } as never);

    const result = await resetLocalBaseForFreshLoad();

    expect(result.clearedAssets).toBe(2);
    expect(await db.local_assets.count()).toBe(0);
    expect(await db.ativos.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
    expect(await db.addresses.count()).toBe(0);
    expect(await db.audit_logs.count()).toBe(0);
    expect(clearVirtualSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('remove as flags de migração para voltarem a correr na carga seguinte', async () => {
    for (const flag of FRESH_LOAD_FLAGS) localStorage.setItem(flag, 'done');
    localStorage.setItem('gbr_chave_da_app', 'manter');

    const result = await resetLocalBaseForFreshLoad();

    expect(result.clearedFlags.sort()).toEqual([...FRESH_LOAD_FLAGS].sort());
    for (const flag of FRESH_LOAD_FLAGS) expect(localStorage.getItem(flag)).toBeNull();
    // Nada além das flags é tocado.
    expect(localStorage.getItem('gbr_chave_da_app')).toBe('manter');
  });

  it('sem flags definidas não inventa remoções', async () => {
    const result = await resetLocalBaseForFreshLoad();

    expect(result.clearedFlags).toEqual([]);
    expect(result.clearedAssets).toBe(0);
  });

  it('corre duas vezes sem erro (base já limpa)', async () => {
    await db.local_assets.put(asset('000420'));
    await resetLocalBaseForFreshLoad();

    const segunda = await resetLocalBaseForFreshLoad();
    expect(segunda.clearedAssets).toBe(0);
    expect(await db.local_assets.count()).toBe(0);
  });
});
