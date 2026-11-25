// @vitest-environment jsdom
// ============================================================================
// saveInventoryPerf.test.ts — o tempo do save no cronómetro de §8.
//
// A agenda de sincronização precisa de duas linhas que não tinham instrumento:
// «saveInventory com 1 ativo (ms)» e «com 300 ativos (ms)». O `perfMetrics` só
// gravava boot/pull/push, por isso estas linhas ficavam sem como serem medidas.
// Este teste fixa o contrato: cada `saveInventory` grava uma amostra `save`
// com o tamanho do inventário no `count` — inclusive quando o save falha.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// `vi.hoisted`: o factory de `vi.mock` é içado acima destes `const`, e sem
// isto a referência chegava antes da inicialização.
const { saveInventoryConfig, bulkInsertAssets, getAssetCount, setSystemStatus } = vi.hoisted(() => ({
  saveInventoryConfig: vi.fn(async () => {}),
  bulkInsertAssets: vi.fn(async () => {}),
  getAssetCount: vi.fn(async () => 0),
  setSystemStatus: vi.fn(async () => {})
}));

vi.mock('localforage', () => ({
  default: {
    setItem: vi.fn(async () => {}),
    getItem: vi.fn(async () => null),
    removeItem: vi.fn(async () => {}),
    config: vi.fn()
  }
}));

vi.mock('../services/sqliteService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/sqliteService')>();
  return {
    ...actual,
    sqliteService: {
      ...actual.sqliteService,
      saveInventoryConfig,
      bulkInsertAssets,
      getAssetCount,
      setSystemStatus
    }
  };
});

vi.mock('../services/securityService', () => ({
  encryption: { encrypt: vi.fn(async (value: unknown) => value), decrypt: vi.fn(async (value: unknown) => value) }
}));

vi.mock('../services/localDbService', () => ({
  localDb: { assets: { bulkPut: vi.fn(async () => {}) } },
  backupDatabaseToPhysicalStorage: vi.fn()
}));

vi.mock('../services/supabaseService', () => ({
  syncAssetsToCloudAndMark: vi.fn(async () => {}),
  syncConfigToCloud: vi.fn(async () => {})
}));

vi.mock('../services/utils', () => ({ generateChecksum: vi.fn(async () => 'hash-de-teste') }));

vi.mock('../services/FileSystemStorageService', () => ({
  FileSystemStorageService: class {
    static async write(): Promise<void> {}
  }
}));

import { saveInventory } from '../services/persistenceService';
import { DatabaseMode } from '../types';
import { getPerfSamples } from '../utils/perfMetrics';

const ativos = (quantidade: number) =>
  Array.from({ length: quantidade }, (_, i) => ({
    id: `PK-${i}`,
    primarykey: `PK-${i}`,
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    status: 'Em uso',
    _is_synced: 1,
    _is_deleted: 0
  }));

const salvar = (quantidade: number) =>
  saveInventory(
    { databaseMode: DatabaseMode.INTERNAL, assets: ativos(quantidade) } as never,
    undefined,
    false,
    true
  );

const amostrasSave = () => getPerfSamples().filter((amostra) => amostra.name === 'save');

describe('saveInventory no cronómetro (§8)', () => {
  beforeEach(() => {
    localStorage.clear();
    saveInventoryConfig.mockClear();
    bulkInsertAssets.mockClear();
    getAssetCount.mockClear();
  });

  it('grava uma amostra save com o número de ativos do inventário', async () => {
    await salvar(300);

    const amostras = amostrasSave();
    expect(amostras).toHaveLength(1);
    expect(amostras[0].count).toBe(300);
    expect(amostras[0].ms).toBeGreaterThanOrEqual(0);
  });

  it('distingue 1 ativo de 300 ativos pelo count da amostra', async () => {
    await salvar(1);
    await salvar(300);

    // É esta separação que permite ler as duas linhas de §8 do mesmo retrato,
    // sem inventar uma métrica por tamanho de base.
    expect(amostrasSave().map((amostra) => amostra.count)).toEqual([1, 300]);
  });

  it('grava a amostra mesmo quando o save falha', async () => {
    saveInventoryConfig.mockRejectedValueOnce(new Error('disco cheio'));

    await expect(salvar(1)).rejects.toThrow('disco cheio');

    const amostras = amostrasSave();
    expect(amostras).toHaveLength(1);
    expect(amostras[0].count).toBe(1);
  });
});
