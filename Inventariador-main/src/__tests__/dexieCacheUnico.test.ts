// @vitest-environment jsdom
// ============================================================================
// dexieCacheUnico.test.ts — §A.5 da agenda: o fim da escrita dupla.
//
// `saveInventory` gravava o inventário inteiro duas vezes: cifrado no
// localforage e nas tabelas do Dexie (e `local_assets` ainda era regravada pelo
// espelho em lotes). O contrato que este teste fixa:
//  - o save grava os ativos no cache Dexie e NÃO escreve o blob cifrado;
//  - não há segunda escrita das mesmas linhas nas tabelas do cache;
//  - a falha do Dexie aciona o blob (recuo) e a falha das duas vias propaga;
//  - a carga lê o cache primeiro — inclusive no modo oficial, escopada ao
//    contrato da sessão — e recua ao blob só quando o cache está vazio;
//  - as duas chaves de ambiente devolvem a leitura/escrita antigas;
//  - backup e limpeza parcial continuam a funcionar sem o blob.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// `vi.hoisted`: o factory de `vi.mock` é içado acima destes `const`.
const { memStore, cacheDexie, dbStubs, bulkPutEspelho } = vi.hoisted(() => {
  const memStore = new Map<string, unknown>();
  const cacheDexie: Record<string, unknown>[] = [];
  const bulkPutEspelho = vi.fn(async () => {});
  const dbStubs = {
    saveInventoryConfig: vi.fn(async () => {}),
    bulkInsertAssets: vi.fn(async (assets: Record<string, unknown>[]) => {
      cacheDexie.length = 0;
      cacheDexie.push(...assets.map((asset) => ({ ...asset })));
    }),
    getAssetCount: vi.fn(async () => cacheDexie.length),
    setSystemStatus: vi.fn(async () => {}),
    getAllAssets: vi.fn(async () =>
      cacheDexie.filter((asset) => Number(asset._is_deleted ?? 0) !== 1)
    ),
    getInventoryConfig: vi.fn(async () => ({}) as Record<string, unknown>),
    getFileStatus: vi.fn(async () => ({ status: 'linked' })),
    getIsInitialized: vi.fn(() => true),
    getStorageSource: vi.fn(() => 'CACHE'),
    deleteLocalAssetsByUnits: vi.fn(async (unidades: string[]) => {
      const alvo = new Set(unidades.map((unidade) => unidade.toUpperCase()));
      for (let i = cacheDexie.length - 1; i >= 0; i -= 1) {
        if (alvo.has(String(cacheDexie[i].filial ?? '').toUpperCase())) cacheDexie.splice(i, 1);
      }
    })
  };
  return { memStore, cacheDexie, dbStubs, bulkPutEspelho };
});

vi.mock('localforage', () => ({
  default: {
    setItem: vi.fn(async (chave: string, valor: unknown) => {
      memStore.set(chave, valor);
    }),
    getItem: vi.fn(async (chave: string) => (memStore.has(chave) ? memStore.get(chave) : null)),
    removeItem: vi.fn(async (chave: string) => {
      memStore.delete(chave);
    }),
    clear: vi.fn(async () => {
      memStore.clear();
    }),
    config: vi.fn()
  }
}));

vi.mock('../services/sqliteService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/sqliteService')>();
  return {
    ...actual,
    sqliteService: { ...actual.sqliteService, ...dbStubs }
  };
});

vi.mock('../services/securityService', () => ({
  encryption: {
    encrypt: vi.fn(async (valor: unknown) => valor),
    decrypt: vi.fn(async (valor: unknown) => valor)
  }
}));

vi.mock('../services/localDbService', () => ({
  localDb: { assets: { put: vi.fn(async () => {}), bulkPut: bulkPutEspelho } },
  backupDatabaseToPhysicalStorage: vi.fn()
}));

vi.mock('../services/supabaseService', () => ({
  syncAssetsToCloudAndMark: vi.fn(async () => {}),
  syncConfigToCloud: vi.fn(async () => {})
}));

vi.mock('../services/utils', () => ({ generateChecksum: vi.fn(async () => 'hash-de-teste') }));

vi.mock('../services/FileSystemStorageService', () => ({
  FileSystemStorageService: class {
    static async salvarEmDiretorioLocal(): Promise<void> {}
  }
}));

import localforage from 'localforage';
import {
  saveInventory,
  loadInventory,
  backupInventory,
  clearInventory,
  READ_FROM_DEXIE_FIRST_KEY,
  LEGACY_ASSETS_MIRROR_KEY
} from '../services/persistenceService';
import { DatabaseMode } from '../types';

const CHAVE_ATIVOS = 'inventory_assets_v24_internal_secure';
const CHAVE_ATIVOS_NUVEM = 'inventory_assets_v24_supabase_secure';

const ativo = (id: string, tenantid = 'CICOPAL', filial = '010101 CICOPAL GO') => ({
  id,
  primarykey: id,
  tenantid,
  filial,
  etiqueta: id,
  status: 'P',
  qt: 1,
  _is_synced: 1,
  _is_deleted: 0
});

const ativos = (quantidade: number, tenantid = 'CICOPAL', filial = '010101 CICOPAL GO') =>
  Array.from({ length: quantidade }, (_, i) => ativo(`PK-${i}`, tenantid, filial));

const salvar = (quantidade: number) =>
  saveInventory(
    { databaseMode: DatabaseMode.INTERNAL, assets: ativos(quantidade) } as never,
    undefined,
    false,
    false
  );

const leuOBloDeAtivos = () =>
  vi.mocked(localforage.getItem).mock.calls.some(([chave]) => chave === CHAVE_ATIVOS);

describe('§A.5 — o save grava uma vez e o blob fica como recuo', () => {
  beforeEach(() => {
    memStore.clear();
    cacheDexie.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('grava os ativos no cache Dexie e não duplica o inventário no localforage', async () => {
    await salvar(3);

    expect(dbStubs.bulkInsertAssets).toHaveBeenCalledTimes(1);
    expect((dbStubs.bulkInsertAssets.mock.calls[0][0] as unknown[]).length).toBe(3);
    expect(memStore.has(CHAVE_ATIVOS)).toBe(false);
    // A config (pequena) continua no cache cifrado — é o que o arranque lê
    // antes de ter contrato.
    expect(memStore.has('inventory_config_v24_internal_secure')).toBe(true);
  });

  it('não regrava as mesmas linhas numa segunda passagem do Dexie', async () => {
    await salvar(2);

    // O espelho em lotes regravava `local_assets` depois do `bulkInsertAssets`.
    expect(bulkPutEspelho).not.toHaveBeenCalled();
  });

  it('aciona o blob cifrado quando a escrita no Dexie falha', async () => {
    dbStubs.bulkInsertAssets.mockRejectedValueOnce(new Error('dexie indisponível'));

    await expect(salvar(2)).resolves.toBeUndefined();

    const blob = memStore.get(CHAVE_ATIVOS) as unknown[];
    expect(blob).toHaveLength(2);
  });

  it('propaga o erro quando nem o Dexie nem o blob gravam', async () => {
    dbStubs.bulkInsertAssets.mockRejectedValueOnce(new Error('dexie indisponível'));
    const setItem = vi.mocked(localforage.setItem);
    // Primeira escrita é a config (passa); a do blob de ativos é que falha.
    setItem.mockImplementationOnce(async (chave: string, valor: unknown) => {
      memStore.set(chave, valor);
    });
    setItem.mockRejectedValueOnce(new Error('quota excedida'));

    await expect(salvar(2)).rejects.toThrow('quota excedida');
  });

  it('o espelho legado ligado por chave volta a gravar o blob', async () => {
    localStorage.setItem(LEGACY_ASSETS_MIRROR_KEY, '1');

    await salvar(2);

    expect(memStore.get(CHAVE_ATIVOS) as unknown[]).toHaveLength(2);
  });
});

describe('§A.5 — a carga lê o cache e recua ao blob', () => {
  beforeEach(() => {
    memStore.clear();
    cacheDexie.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('não decifra o blob de ativos quando o cache tem linhas', async () => {
    cacheDexie.push(...ativos(2));
    memStore.set(CHAVE_ATIVOS, ativos(99));

    const carregado = await loadInventory(DatabaseMode.INTERNAL);

    expect(carregado?.assets).toHaveLength(2);
    expect(leuOBloDeAtivos()).toBe(false);
  });

  it('recua ao blob das versões anteriores quando o cache está vazio', async () => {
    memStore.set(CHAVE_ATIVOS, ativos(3));

    const carregado = await loadInventory(DatabaseMode.INTERNAL);

    expect(carregado?.assets).toHaveLength(3);
  });

  it('no modo oficial o cache é lido primeiro, escopado ao contrato da sessão', async () => {
    sessionStorage.setItem('tenantid', 'CICOPAL');
    cacheDexie.push(...ativos(2, 'CICOPAL'), ativo('PK-OUTRO', 'OUTRO'));

    const carregado = await loadInventory(DatabaseMode.SUPABASE);

    expect(carregado?.assets).toHaveLength(2);
    expect(carregado?.assets?.every((asset) => asset.tenantid === 'CICOPAL')).toBe(true);
    expect(vi.mocked(localforage.getItem).mock.calls.some(([chave]) => chave === CHAVE_ATIVOS_NUVEM)).toBe(false);
  });

  it('a chave de ambiente devolve a leitura antiga pelo blob', async () => {
    localStorage.setItem(READ_FROM_DEXIE_FIRST_KEY, '0');
    sessionStorage.setItem('tenantid', 'CICOPAL');
    cacheDexie.push(...ativos(2, 'CICOPAL'));
    memStore.set(CHAVE_ATIVOS_NUVEM, [...ativos(3, 'CICOPAL'), ...ativos(2, 'OUTRO')]);

    const carregado = await loadInventory(DatabaseMode.SUPABASE);

    expect(carregado?.assets).toHaveLength(5);
    expect(dbStubs.getAllAssets).not.toHaveBeenCalled();
  });
});

describe('§A.5 — backup e limpeza sem o blob', () => {
  beforeEach(() => {
    memStore.clear();
    cacheDexie.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('o backup usa o cache quando o blob já não existe', async () => {
    cacheDexie.push(...ativos(2));
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:backup'),
      revokeObjectURL: vi.fn()
    });

    await expect(backupInventory(DatabaseMode.INTERNAL, 'teste')).resolves.toBe(true);
    expect(memStore.has(CHAVE_ATIVOS)).toBe(false);
  });

  it('a limpeza parcial da unidade acontece no Dexie mesmo sem blob', async () => {
    cacheDexie.push(
      ativo('PK-A', 'CICOPAL', 'UNIDADE-A'),
      ativo('PK-B', 'CICOPAL', 'UNIDADE-B')
    );

    await clearInventory(DatabaseMode.INTERNAL, 'UNIDADE-A');

    expect(dbStubs.deleteLocalAssetsByUnits).toHaveBeenCalledWith(['UNIDADE-A']);
    expect(cacheDexie.map((asset) => asset.primarykey)).toEqual(['PK-B']);
    expect(memStore.has(CHAVE_ATIVOS)).toBe(false);
  });
});

// ============================================================================
// §A.5 — critério «escritas por save: de 5 para 3» da Etapa A da agenda.
//
// Antes da A.5 um save completo escrevia o payload em CINCO passos:
//   1. config no Dexie (`saveInventoryConfig`);
//   2. `bulkInsertAssets` (ativos + local_assets, uma transação);
//   3. o espelho em lotes regravava `local_assets` (`localDb.assets.bulkPut`,
//      um lote de 1000 em 1000 — 12 escritas numa base de 12.636);
//   4. blob cifrado da config no localforage;
//   5. blob cifrado dos ativos no localforage.
// A A.5 deixou TRÊS: 1, 2 e 4. O blob dos ativos (5) passou a ser recuo.
//
// Fora da conta, nas duas versões: `setSystemStatus` (livro de estado do banco)
// e o checksum pós-save da A.4 (em ocioso) — nenhum deles carrega o inventário.
// ============================================================================
const CHAVE_CONFIG_INTERNA = 'inventory_config_v24_internal_secure';

/** Conta as escritas do payload deste save, uma por passo. */
const escritasDoInventario = () => {
  const setItem = vi.mocked(localforage.setItem);
  const escritas = {
    configDexie: dbStubs.saveInventoryConfig.mock.calls.length,
    ativosDexie: dbStubs.bulkInsertAssets.mock.calls.length,
    espelhoEmLotes: bulkPutEspelho.mock.calls.length,
    blobConfig: setItem.mock.calls.filter(([chave]) => chave === CHAVE_CONFIG_INTERNA).length,
    blobAtivos: setItem.mock.calls.filter(([chave]) => chave === CHAVE_ATIVOS).length
  };
  return { ...escritas, total: Object.values(escritas).reduce((soma, n) => soma + n, 0) };
};

describe('§A.5 — escritas por save: de 5 para 3 (critério da Etapa A)', () => {
  beforeEach(() => {
    memStore.clear();
    cacheDexie.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('um save completo escreve o inventário três vezes', async () => {
    await salvar(3);

    expect(escritasDoInventario()).toEqual({
      configDexie: 1,
      ativosDexie: 1,
      espelhoEmLotes: 0,
      blobConfig: 1,
      blobAtivos: 0,
      total: 3
    });
  });

  it('a contagem não cresce com a base: o espelho em lotes já não corre', async () => {
    // 2.500 ativos seriam três lotes (`bulkPut`) no espelho antigo.
    await salvar(2500);

    const escritas = escritasDoInventario();
    expect(escritas.espelhoEmLotes).toBe(0);
    expect(escritas.ativosDexie).toBe(1);
    expect(escritas.blobAtivos).toBe(0);
    expect(escritas.total).toBe(3);
  });

  it('o recuo pela chave legada acrescenta só o blob dos ativos (quatro escritas)', async () => {
    localStorage.setItem(LEGACY_ASSETS_MIRROR_KEY, '1');

    await salvar(2);

    const escritas = escritasDoInventario();
    expect(escritas.blobAtivos).toBe(1);
    expect(escritas.espelhoEmLotes).toBe(0);
    expect(escritas.total).toBe(4);
  });
});
