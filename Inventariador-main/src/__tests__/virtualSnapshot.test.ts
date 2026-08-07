// src/__tests__/virtualSnapshot.test.ts
// Testes unitários para saveVirtualSnapshot/readVirtualSnapshot (localDbService).
//
// Cobre os cenários SRE de resiliência do espelho virtual:
//  - quota do localStorage excedida → fallback IndexedDB + limpeza da chave órfã
//  - JSON corrompido/parcial no localStorage → limpeza e leitura do IndexedDB
//  - prioridade de leitura: localStorage válido primeiro, IndexedDB como fallback
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const SNAPSHOT_KEY = 'gbr_virtual_snapshot_backup';

// Storage simulado (localStorage) + mock do snapshotStore (localforage/IndexedDB).
const { storageMap, mockStorage, snapshotStoreMock } = vi.hoisted(() => {
  const storageMap = new Map<string, string>();

  const mockStorage = {
    getItem: vi.fn((k: string) => storageMap.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => {
      storageMap.set(k, v);
    }),
    removeItem: vi.fn((k: string) => {
      storageMap.delete(k);
    }),
    clear: vi.fn(() => {
      storageMap.clear();
    }),
    key: vi.fn((i: number) => Array.from(storageMap.keys())[i] ?? null),
    get length() {
      return storageMap.size;
    }
  };

  const snapshotStoreMock = {
    setItem: vi.fn().mockResolvedValue(undefined),
    getItem: vi.fn().mockResolvedValue(null),
    removeItem: vi.fn().mockResolvedValue(undefined)
  };

  return { storageMap, mockStorage, snapshotStoreMock };
});

// localDbService importa localforage (default) para criar usersStore/snapshotStore.
vi.mock('localforage', () => ({
  default: {
    createInstance: vi.fn(() => snapshotStoreMock)
  }
}));

// Dependências pesadas/indesejadas no ambiente node: SQLite/Dexie, Capacitor,
// Filesystem, logger e NavigationGuardService são mockados (não exercitados aqui).
vi.mock('../services/sqliteService', () => ({
  db: {},
  sqliteService: { setImportingMode: vi.fn() }
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) }
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {},
  Directory: {},
  Encoding: {}
}));
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock('../services/NavigationGuardService', () => ({
  showRecoveryToast: vi.fn()
}));

import { saveVirtualSnapshot, readVirtualSnapshot } from '../services/localDbService';

describe('saveVirtualSnapshot — persistência resiliente do espelho virtual', () => {
  beforeEach(() => {
    storageMap.clear();
    mockStorage.getItem.mockReset();
    mockStorage.setItem.mockReset();
    mockStorage.removeItem.mockReset();
    mockStorage.getItem.mockImplementation((k: string) => storageMap.get(k) ?? null);
    mockStorage.setItem.mockImplementation((k: string, v: string) => {
      storageMap.set(k, v);
    });
    mockStorage.removeItem.mockImplementation((k: string) => {
      storageMap.delete(k);
    });
    snapshotStoreMock.setItem.mockReset().mockResolvedValue(undefined);
    snapshotStoreMock.getItem.mockReset().mockResolvedValue(null);
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persiste no localStorage quando a quota é suficiente (sem tocar no IndexedDB)', async () => {
    const payload = [{ id: 'A1', tenantid: 'CICOPAL' }, { id: 'A2', tenantid: 'CICOPAL' }];

    const ok = await saveVirtualSnapshot(payload);

    expect(ok).toBe(true);
    expect(mockStorage.setItem).toHaveBeenCalledWith(SNAPSHOT_KEY, JSON.stringify(payload));
    expect(snapshotStoreMock.setItem).not.toHaveBeenCalled();
    expect(storageMap.get(SNAPSHOT_KEY)).toBe(JSON.stringify(payload));
  });

  it('quota excedida → limpa a chave órfã do localStorage e persiste no IndexedDB', async () => {
    // Simula um snapshot antigo (menor) preso no localStorage + quota estourada
    storageMap.set(SNAPSHOT_KEY, JSON.stringify([{ id: 'STALE', tenantid: 'OLD' }]));
    mockStorage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError: Setting the value exceeded the quota');
    });

    const payload = Array.from({ length: 12636 }, (_, i) => ({ id: `ATIVO-${i}` }));

    const ok = await saveVirtualSnapshot(payload);

    expect(ok).toBe(true);
    // A chave órfã/parcial foi removida do localStorage
    expect(mockStorage.removeItem).toHaveBeenCalledWith(SNAPSHOT_KEY);
    expect(storageMap.get(SNAPSHOT_KEY)).toBeUndefined();
    // O espelho novo foi para o IndexedDB (localforage/snapshotStore)
    expect(snapshotStoreMock.setItem).toHaveBeenCalledWith(SNAPSHOT_KEY, payload);
  });

  it('após fallback por quota, readVirtualSnapshot retorna o espelho do IndexedDB (sem duplicidade)', async () => {
    storageMap.set(SNAPSHOT_KEY, JSON.stringify([{ id: 'STALE', tenantid: 'OLD' }]));
    mockStorage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError: quota exceeded');
    });
    const payload = [{ id: 'NOVO-1', tenantid: 'CICOPAL' }, { id: 'NOVO-2', tenantid: 'CICOPAL' }];

    await saveVirtualSnapshot(payload);

    snapshotStoreMock.getItem.mockResolvedValue(payload);
    const result = await readVirtualSnapshot();

    // O dado lido é o NOVO (IndexedDB), nunca o stale do localStorage
    expect(result).toEqual(payload);
    expect(result?.[0].id).toBe('NOVO-1');
  });

  it('removeItem best-effort não quebra o fallback (mesmo se a remoção falhar)', async () => {
    mockStorage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    mockStorage.removeItem.mockImplementation(() => {
      throw new Error('SecurityError: storage disabled');
    });
    const payload = [{ id: 'X1' }];

    const ok = await saveVirtualSnapshot(payload);

    expect(ok).toBe(true);
    expect(snapshotStoreMock.setItem).toHaveBeenCalledWith(SNAPSHOT_KEY, payload);
  });

  it('quota excedida E IndexedDB falhando → retorna false (sem lançar exceção)', async () => {
    mockStorage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    snapshotStoreMock.setItem.mockRejectedValue(new Error('IndexedDB quota/blocked'));

    const ok = await saveVirtualSnapshot([{ id: 'Y1' }]);

    expect(ok).toBe(false);
    expect(mockStorage.removeItem).toHaveBeenCalledWith(SNAPSHOT_KEY);
  });
});

describe('readVirtualSnapshot — leitura com fallback e higienização', () => {
  beforeEach(() => {
    storageMap.clear();
    mockStorage.getItem.mockReset();
    mockStorage.setItem.mockReset();
    mockStorage.removeItem.mockReset();
    mockStorage.getItem.mockImplementation((k: string) => storageMap.get(k) ?? null);
    mockStorage.setItem.mockImplementation((k: string, v: string) => {
      storageMap.set(k, v);
    });
    mockStorage.removeItem.mockImplementation((k: string) => {
      storageMap.delete(k);
    });
    snapshotStoreMock.getItem.mockReset().mockResolvedValue(null);
    snapshotStoreMock.setItem.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('localStorage', mockStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna o snapshot válido do localStorage sem consultar o IndexedDB', async () => {
    const payload = [{ id: 'A1', tenantid: 'CICOPAL' }];
    storageMap.set(SNAPSHOT_KEY, JSON.stringify(payload));
    snapshotStoreMock.getItem.mockResolvedValue([{ id: 'IDB', tenantid: 'OUTRO' }]);

    const result = await readVirtualSnapshot();

    expect(result).toEqual(payload);
    expect(snapshotStoreMock.getItem).not.toHaveBeenCalled();
  });

  it('JSON corrompido no localStorage → remove a chave e cai no IndexedDB', async () => {
    storageMap.set(SNAPSHOT_KEY, '{corrompido sem fechar'); // escrita parcial/quota interrompida
    snapshotStoreMock.getItem.mockResolvedValue([{ id: 'IDB-1', tenantid: 'CICOPAL' }]);

    const result = await readVirtualSnapshot();

    expect(mockStorage.removeItem).toHaveBeenCalledWith(SNAPSHOT_KEY);
    expect(storageMap.get(SNAPSHOT_KEY)).toBeUndefined();
    expect(result).toEqual([{ id: 'IDB-1', tenantid: 'CICOPAL' }]);
  });

  it('chave órfã (JSON válido porém não-array) → remove e cai no IndexedDB', async () => {
    storageMap.set(SNAPSHOT_KEY, JSON.stringify({ versao: 'antiga', dados: [] })); // objeto, não array
    snapshotStoreMock.getItem.mockResolvedValue([{ id: 'IDB-2', tenantid: 'CICOPAL' }]);

    const result = await readVirtualSnapshot();

    expect(mockStorage.removeItem).toHaveBeenCalledWith(SNAPSHOT_KEY);
    expect(storageMap.get(SNAPSHOT_KEY)).toBeUndefined();
    expect(result).toEqual([{ id: 'IDB-2', tenantid: 'CICOPAL' }]);
  });

  it('localStorage vazio e IndexedDB vazio → retorna null', async () => {
    const result = await readVirtualSnapshot();

    expect(result).toBeNull();
    expect(mockStorage.removeItem).not.toHaveBeenCalled();
  });

  it('localStorage com snapshot válido tem prioridade sobre o IndexedDB', async () => {
    const lsPayload = [{ id: 'LS', tenantid: 'CICOPAL' }];
    storageMap.set(SNAPSHOT_KEY, JSON.stringify(lsPayload));
    snapshotStoreMock.getItem.mockResolvedValue([{ id: 'IDB', tenantid: 'CICOPAL' }]);

    const result = await readVirtualSnapshot();

    expect(result).toEqual(lsPayload);
    expect(snapshotStoreMock.getItem).not.toHaveBeenCalled();
  });
});
