// @vitest-environment jsdom
// ============================================================================
// emptyTenantKeys.test.ts — fecha a classe das chaves `['', primarykey]`.
//
// Três caminhos gravavam a linha com o `tenantid` que vinha do ficheiro:
// a carga da planilha (linha-a-linha), o restauro manual de backup no painel do
// gestor e o `localDb.assets.add` (via `toDexieAsset`). Com `tenantid` vazio a
// chave composta ficava `['', primarykey]` — invisível para a contagem e fora do
// alcance da migração de case. Todos passam a adoptar o contrato da sessão.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { localDb } from '../services/localDbService';
import { DatabaseLoaderService, restoreBackupSnapshot } from '../services/DatabaseLoaderService';
import type { Asset } from '../types';

const TENANT = 'CICOPAL';
const ESPELHOS = ['local_assets', 'ativos', 'assets'] as const;

const chaveVazia = async (): Promise<boolean> => {
  for (const table of ESPELHOS) {
    if (await db[table].get(['', 'SEM-TENANT'])) return true;
  }
  return false;
};

const emTodosOsEspelhos = async (): Promise<number> => {
  let total = 0;
  for (const table of ESPELHOS) {
    if (await db[table].get([TENANT, 'SEM-TENANT'])) total += 1;
  }
  return total;
};

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: TENANT }));
  for (const table of ESPELHOS) await db[table].clear();
});

describe('carga da planilha — linha sem tenantid', () => {
  it('adopta o contrato da sessão em vez de gravar a chave vazia', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      { filial: 'MATRIZ', primarykey: 'SEM-TENANT', etiqueta: 'SEM-TENANT', descricaodoativo: 'CADEIRA', qt: 1 },
      { tenantid: TENANT, filial: 'MATRIZ', primarykey: 'COM-TENANT', etiqueta: 'COM-TENANT', qt: 1 }
    ]);

    expect(await emTodosOsEspelhos()).toBe(3);
    expect(await chaveVazia()).toBe(false);
  });

  it('normaliza o casing do tenantid da linha', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      { tenantid: 'cicopal', filial: 'MATRIZ', primarykey: 'MINUSCULO', etiqueta: 'MINUSCULO', qt: 1 }
    ]);

    expect(await db.local_assets.get([TENANT, 'MINUSCULO'])).toBeDefined();
    expect(await db.local_assets.get(['cicopal', 'MINUSCULO'])).toBeUndefined();
  });
});

describe('restauro manual de backup — linha sem tenantid', () => {
  it('canoniza antes de repor os três espelhos', async () => {
    const linhas: DexieAsset[] = [
      { id: 'SEM-TENANT', primarykey: 'SEM-TENANT', tenantid: '', filial: 'MATRIZ' } as DexieAsset,
      { id: 'MINUSCULO', primarykey: 'MINUSCULO', tenantid: 'cicopal', filial: 'MATRIZ' } as DexieAsset
    ];

    expect(await restoreBackupSnapshot(linhas)).toBe(2);

    expect(await emTodosOsEspelhos()).toBe(3);
    expect(await chaveVazia()).toBe(false);
    for (const table of ESPELHOS) {
      expect(await db[table].get([TENANT, 'MINUSCULO'])).toBeDefined();
      expect(await db[table].get(['cicopal', 'MINUSCULO'])).toBeUndefined();
    }
  });

  it('backup vazio não limpa a base nem conta como restauro', async () => {
    await db.local_assets.put({ id: 'X', primarykey: 'X', tenantid: TENANT } as DexieAsset);

    expect(await restoreBackupSnapshot([])).toBe(0);
    expect(await db.local_assets.get([TENANT, 'X'])).toBeDefined();
  });
});

describe('localDb.assets.add — toDexieAsset', () => {
  it('grava com o tenant da sessão quando o ativo não traz tenantid', async () => {
    await localDb.assets.add({
      id: 'SEM-TENANT',
      primarykey: 'SEM-TENANT',
      etiqueta: 'SEM-TENANT',
      filial: 'MATRIZ'
    } as unknown as Asset);

    expect(await emTodosOsEspelhos()).toBe(3);
    expect(await chaveVazia()).toBe(false);
  });

  it('normaliza o casing do tenantid recebido', async () => {
    await localDb.assets.add({
      id: 'MINUSCULO',
      primarykey: 'MINUSCULO',
      tenantid: 'cicopal',
      etiqueta: 'MINUSCULO',
      filial: 'MATRIZ'
    } as unknown as Asset);

    expect(await db.ativos.get([TENANT, 'MINUSCULO'])).toBeDefined();
    expect(await db.ativos.get(['cicopal', 'MINUSCULO'])).toBeUndefined();
  });
});
