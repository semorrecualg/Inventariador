// @vitest-environment jsdom
// ============================================================================
// freshLoadReset.test.ts — preparação do dispositivo para nova carga
//
// Depois de a nuvem ser reiniciada, a base local continua com as linhas
// antigas: o primeiro sync reenvia tudo e o reset da nuvem perde o efeito.
// A rotina do Gestor de Base limpa o inventário local, o espelho virtual, a
// trilha e a fila da âncora.
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
import { resetLocalBaseForFreshLoad } from '../services/localBaseReset';
import { ANCORA_PENDENTE_KEY } from '../utils/ancoraPendente';

const asset = (primarykey: string) =>
  ({
    id: primarykey,
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    primarykey,
    etiqueta: primarykey,
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

  it('remove a fila da âncora por subir e não toca no resto do storage', async () => {
    localStorage.setItem(ANCORA_PENDENTE_KEY, JSON.stringify([{ tenantid: 'CICOPAL' }]));
    localStorage.setItem('gbr_chave_da_app', 'manter');

    const result = await resetLocalBaseForFreshLoad();

    expect(result.clearedPendingAnchors).toBe(true);
    expect(localStorage.getItem(ANCORA_PENDENTE_KEY)).toBeNull();
    expect(localStorage.getItem('gbr_chave_da_app')).toBe('manter');
  });

  it('sem fila nem ativos não inventa remoções', async () => {
    const result = await resetLocalBaseForFreshLoad();

    expect(result.clearedAssets).toBe(0);
    expect(result.clearedPendingAnchors).toBe(false);
    expect(await db.local_assets.count()).toBe(0);
  });

  it('corre duas vezes sem erro (base já limpa)', async () => {
    await db.local_assets.put(asset('000420'));
    await resetLocalBaseForFreshLoad();

    const segunda = await resetLocalBaseForFreshLoad();
    expect(segunda.clearedAssets).toBe(0);
    expect(await db.local_assets.count()).toBe(0);
  });
});
