// @vitest-environment jsdom
// ============================================================================
// bootPullSeloSynced.test.ts — o save do arranque rebaixava o selo do download.
//
// `fetchFullInventory` grava a base com `{ markSynced: true }` (selo 1) e devolve
// as MESMAS linhas já mapeadas por `mapCloudAssetRow`. O bloco do arranque monta
// o estado com elas e chamava `saveInventory(newState)` sem lista — e o
// `mapAssetToDexie` só mantém o selo quando a linha o traz
// (`sqliteService.ts:996`). Como `mapCloudAssetRow` não produz `_is_synced`, a
// segunda escrita devolvia a base inteira a 0.
//
// Este ficheiro prova a causa na API (reprodução) e fixa a correção nos dois
// caminhos do arranque: `saveInventory(newState, undefined, false, true)`.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

vi.mock('localforage', () => ({
  default: {
    setItem: vi.fn(async () => {}),
    getItem: vi.fn(async () => null),
    removeItem: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    config: vi.fn()
  }
}));

vi.mock('../services/securityService', () => ({
  encryption: {
    encrypt: vi.fn(async (valor: unknown) => valor),
    decrypt: vi.fn(async (valor: unknown) => valor)
  }
}));

vi.mock('../services/localDbService', () => ({
  localDb: { assets: { put: vi.fn(async () => {}), bulkPut: vi.fn(async () => {}) } },
  backupDatabaseToPhysicalStorage: vi.fn()
}));

vi.mock('../services/FileSystemStorageService', () => ({
  FileSystemStorageService: class {
    static async salvarEmDiretorioLocal(): Promise<void> {}
  }
}));

vi.mock('../services/utils', () => ({ generateChecksum: vi.fn(async () => 'hash-de-teste') }));

import { db, sqliteService } from '../services/sqliteService';
import { saveInventory } from '../services/persistenceService';
import { mapCloudAssetRow } from '../services/supabaseService';
import { DatabaseMode } from '../types';

/** Linha CRUA do Postgres, como sai da tabela `assets` (sem `_is_synced`). */
const linhaCrua = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  etiqueta: '007222',
  status: 'P',
  descricaodoativo: 'Notebook',
  gps_lat: -16.68,
  gps_lng: -49.25,
  is_deleted: false,
  ...over
});

/** Selo nas duas tabelas do cache. */
const selo = async (primarykey: string): Promise<[number, number]> => {
  const local = await db.local_assets.where('primarykey').equals(primarykey).first();
  const vivo = await db.ativos.where('primarykey').equals(primarykey).first();
  return [Number(local?._is_synced), Number(vivo?._is_synced)];
};

/** A escrita do download, como `fetchFullInventory` a faz. */
const baixar = async () => {
  const nuvem = mapCloudAssetRow(linhaCrua());
  await sqliteService.bulkInsertAssetsOfflineFirst(
    [nuvem as unknown as Record<string, unknown>],
    undefined,
    { markSynced: true }
  );
  return nuvem;
};

const estado = (assets: unknown[]) =>
  ({ databaseMode: DatabaseMode.INTERNAL, assets }) as never;

describe('o selo do download e o save do arranque', () => {
  beforeEach(async () => {
    for (const tabela of [db.ativos, db.local_assets]) await tabela.clear();
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  it('o download deixa a linha com o selo 1 nas duas tabelas', async () => {
    await baixar();

    expect(await selo('PK-1')).toEqual([1, 1]);
  });

  it('a linha mapeada da nuvem não traz `_is_synced` — é a causa', async () => {
    const nuvem = mapCloudAssetRow(linhaCrua());

    expect((nuvem as unknown as Record<string, unknown>)._is_synced).toBeUndefined();
  });

  it('saveInventory sem lista rebaixa o selo do download a 0 (reprodução)', async () => {
    const nuvem = await baixar();

    await saveInventory(estado([nuvem]));

    expect(await selo('PK-1')).toEqual([0, 0]);
  });

  it('com skipSqlAssetsInsert o selo do download fica em 1 (correção)', async () => {
    const nuvem = await baixar();

    await saveInventory(estado([nuvem]), undefined, false, true);

    expect(await selo('PK-1')).toEqual([1, 1]);
  });
});

describe('contrato do arranque — os dois pulls gravam só configuração', () => {
  const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
  // Sem comentários: as explicações citam a chamada antiga de propósito.
  const codigo = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('nenhum save imediatamente a seguir ao estado do arranque fica sem lista', () => {
    // Só os dois blocos do arranque fazem `setInventory(newState)` seguido de
    // save; o onboarding (fora deste PR) usa `setInventory(prev => …)`.
    const semLista = codigo.match(/setInventory\(newState\);[\s\S]{0,200}?saveInventory\(newState\)/g) ?? [];

    expect(semLista).toEqual([]);
  });

  it('os dois pulls do arranque gravam o estado com skipSqlAssetsInsert', () => {
    const pulls = codigo.match(
      /setInventory\(newState\);\s*await saveInventory\(newState, undefined, false, true\);/g
    );

    expect(pulls).toHaveLength(2);
  });
});
