// @vitest-environment jsdom
// ============================================================================
// legacyBackupRestore.test.ts — restauro do inventário legado do FileSystem.
//
// O loop vivia dentro do useEffect de boot do App: gravava `local_assets` e
// conciliava o espelho `ativos` pela chave composta [tenantid+primarykey]. Com a
// chave simples o `update` não encontrava a linha e o ativo restaurado ficava
// por conferir, sem que nada falhasse à vista.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { restoreLegacyPhysicalInventory } from '../services/DatabaseLoaderService';

const TENANT = 'CICOPAL';

const row = (over: Partial<DexieAsset> & { primarykey: string }): DexieAsset =>
  ({
    id: over.primarykey,
    tenantid: TENANT,
    filial: '010101 CICOPAL GO',
    etiqueta: over.primarykey,
    _conferido: 0,
    _is_synced: 1,
    ...over
  }) as DexieAsset;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: TENANT }));
  for (const t of ['ativos', 'assets', 'local_assets'] as const) {
    await db[t].clear();
  }
});

describe('restoreLegacyPhysicalInventory — backup físico legado', () => {
  it('restaura local_assets e concilia ativos pelo par composto', async () => {
    // `ativos` já tem a linha operacional, ainda por conferir.
    await db.ativos.put(row({ primarykey: 'A1', _conferido: 0 }));
    const backup = [row({ primarykey: 'A1' }), row({ primarykey: 'A2' })];

    const total = await restoreLegacyPhysicalInventory(backup);

    expect(total).toBe(2);
    expect(await db.local_assets.get([TENANT, 'A1'])).toBeDefined();
    expect(await db.local_assets.get([TENANT, 'A2'])).toBeDefined();

    const ativo = await db.ativos.get([TENANT, 'A1']);
    expect(ativo?._conferido).toBe(1);
    expect(ativo?._is_synced).toBe(0);
  });

  it('linha sem tenantid usa o contrato da sessão (não grava chave vazia)', async () => {
    await db.ativos.put(row({ primarykey: 'SEM-TENANT', _conferido: 0 }));

    await restoreLegacyPhysicalInventory([row({ primarykey: 'SEM-TENANT', tenantid: '' })]);

    expect(await db.local_assets.get([TENANT, 'SEM-TENANT'])).toBeDefined();
    expect(await db.ativos.get([TENANT, 'SEM-TENANT'])).toMatchObject({ _conferido: 1, _is_synced: 0 });
    expect(await db.ativos.get(['', 'SEM-TENANT'])).toBeUndefined();
    expect(await db.local_assets.get(['', 'SEM-TENANT'])).toBeUndefined();
  });

  it('não toca em outro contrato (mesma primarykey, outro tenant)', async () => {
    await db.ativos.put(row({ primarykey: 'A1', tenantid: 'OUTRO', _conferido: 0 }));

    await restoreLegacyPhysicalInventory([row({ primarykey: 'A1' })]);

    const outro = await db.ativos.get(['OUTRO', 'A1']);
    expect(outro?._conferido).toBe(0);
    expect(outro?._is_synced).toBe(1);
  });

  it('backup vazio não grava nada e devolve 0', async () => {
    expect(await restoreLegacyPhysicalInventory([])).toBe(0);
    expect(await db.local_assets.count()).toBe(0);
    expect(await db.ativos.count()).toBe(0);
  });
});
