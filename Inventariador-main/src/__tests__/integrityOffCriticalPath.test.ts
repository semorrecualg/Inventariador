// @vitest-environment jsdom
// ============================================================================
// integrityOffCriticalPath.test.ts — §A.4 da agenda: o checksum de integridade
// sai do caminho crítico do `saveInventory` e a comparação passa a ser feita
// sob pedido no diagnóstico. Este teste fixa o contrato:
//  - o save já não calcula SHA-256 nenhum;
//  - o hash do último save é gravado em ocioso, ao lado do cache (nunca dentro
//    da config cifrada);
//  - um save posterior invalida o hash atrasado;
//  - `loadInventory` deixou de re-hashear a base no arranque;
//  - `checkInventoryIntegrity` distingue confere / divergente / sem registo / erro.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// `vi.hoisted`: o factory de `vi.mock` é içado acima destes `const`, e sem
// isto a referência chegava antes da inicialização.
const { memStore, generateChecksum, dbStubs } = vi.hoisted(() => ({
  memStore: new Map<string, unknown>(),
  generateChecksum: vi.fn(async (data: unknown) => `hash-${Array.isArray(data) ? data.length : 0}`),
  dbStubs: {
    saveInventoryConfig: vi.fn(async () => {}),
    bulkInsertAssets: vi.fn(async () => {}),
    getAssetCount: vi.fn(async () => 0),
    setSystemStatus: vi.fn(async () => {}),
    getFileStatus: vi.fn(async () => ({ status: 'linked' })),
    getIsInitialized: vi.fn(() => true),
    getAllAssets: vi.fn(async () => [] as unknown[]),
    getInventoryConfig: vi.fn(async () => ({}) as Record<string, unknown>),
    getStorageSource: vi.fn(() => 'CACHE')
  }
}));

vi.mock('localforage', () => ({
  default: {
    setItem: vi.fn(async (key: string, value: unknown) => {
      memStore.set(key, value);
    }),
    getItem: vi.fn(async (key: string) => (memStore.has(key) ? memStore.get(key) : null)),
    removeItem: vi.fn(async (key: string) => {
      memStore.delete(key);
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

vi.mock('../services/utils', () => ({ generateChecksum }));

vi.mock('../services/FileSystemStorageService', () => ({
  FileSystemStorageService: class {
    static async write(): Promise<void> {}
  }
}));

import localforage from 'localforage';
import {
  saveInventory,
  loadInventory,
  flushIntegrityFingerprint,
  checkInventoryIntegrity
} from '../services/persistenceService';
import { DatabaseMode } from '../types';

const CHAVE_CONFIG = 'inventory_config_v24_internal_secure';
const CHAVE_INTEGRIDADE = `${CHAVE_CONFIG}_integrity`;

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

const gravacoesDeIntegridade = () =>
  vi.mocked(localforage.setItem).mock.calls.filter(([chave]) => chave === CHAVE_INTEGRIDADE);

describe('checksum de integridade fora do caminho crítico (§A.4)', () => {
  beforeEach(() => {
    memStore.clear();
    generateChecksum.mockClear();
    vi.mocked(localforage.setItem).mockClear();
    // jsdom não traz `requestIdleCallback`; fixa-se o caminho `setTimeout(0)`
    // para o teste não depender do motor.
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  it('não calcula o checksum dentro do save', async () => {
    await salvar(300);

    expect(generateChecksum).not.toHaveBeenCalled();

    await flushIntegrityFingerprint();

    expect(generateChecksum).toHaveBeenCalledTimes(1);
    expect(generateChecksum.mock.calls[0][0] as unknown[]).toHaveLength(300);
    expect(memStore.get(CHAVE_INTEGRIDADE)).toBe('hash-300');
  });

  it('guarda o hash ao lado do cache e não dentro da config cifrada', async () => {
    await salvar(2);
    await flushIntegrityFingerprint();

    const configGravada = memStore.get(CHAVE_CONFIG) as Record<string, unknown>;
    expect(configGravada).toBeTruthy();
    expect(configGravada).not.toHaveProperty('_integrity_hash');
    expect(memStore.get(CHAVE_INTEGRIDADE)).toBe('hash-2');
  });

  it('um save posterior invalida o hash atrasado', async () => {
    await salvar(1);
    await salvar(300);
    await flushIntegrityFingerprint();

    // O primeiro hash é calculado mas não pode ocupar o lugar do mais recente.
    expect(generateChecksum).toHaveBeenCalledTimes(2);
    expect(gravacoesDeIntegridade()).toHaveLength(1);
    expect(memStore.get(CHAVE_INTEGRIDADE)).toBe('hash-300');
  });

  it('a carga não recalcula o checksum da base', async () => {
    dbStubs.getAllAssets.mockResolvedValueOnce(ativos(3));
    memStore.set(CHAVE_CONFIG, { _integrity_hash: 'hash-antigo' });

    const carregado = await loadInventory(DatabaseMode.INTERNAL);

    expect(carregado?.assets).toHaveLength(3);
    expect(generateChecksum).not.toHaveBeenCalled();
  });
});

describe('checkInventoryIntegrity — veredicto sob pedido', () => {
  beforeEach(() => {
    memStore.clear();
    generateChecksum.mockClear();
    vi.stubGlobal('requestIdleCallback', undefined);
  });

  it('confere quando o hash do último save corresponde', async () => {
    memStore.set(CHAVE_INTEGRIDADE, 'hash-3');

    expect(await checkInventoryIntegrity(DatabaseMode.INTERNAL, ativos(3) as never)).toEqual({
      status: 'confere',
      hash: 'hash-3',
      total: 3
    });
  });

  it('assinala divergência sem esconder os dois hashes', async () => {
    memStore.set(CHAVE_INTEGRIDADE, 'hash-2');

    expect(await checkInventoryIntegrity(DatabaseMode.INTERNAL, ativos(3) as never)).toMatchObject({
      status: 'divergente',
      gravado: 'hash-2',
      atual: 'hash-3',
      total: 3
    });
  });

  it('distingue «sem registo» de divergência', async () => {
    expect(await checkInventoryIntegrity(DatabaseMode.INTERNAL, ativos(1) as never)).toEqual({
      status: 'sem-registo',
      total: 1
    });
  });

  it('assinala erro quando o crypto.subtle não responde', async () => {
    memStore.set(CHAVE_INTEGRIDADE, 'hash-1');
    generateChecksum.mockResolvedValueOnce('checksum_error');

    expect((await checkInventoryIntegrity(DatabaseMode.INTERNAL, ativos(1) as never)).status).toBe('erro');
  });
});
