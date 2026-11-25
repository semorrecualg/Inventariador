// @vitest-environment jsdom
// ============================================================================
// carimboNoReset.test.ts — o carimbo da falha morre com o registo, nunca antes.
//
// Uma limpeza local («Limpeza Total» do MainMenu, limpeza em
// massa por unidade, expurgo do Gestor de Base, «Desvincular e Reiniciar»)
// filtrava o cache do localforage e o estado React, mas deixava as linhas da
// unidade nos três espelhos Dexie — e o `_syncFailAt` agarrado a elas. O selo
// continuava a somar falhas de ativos que já não existiam no inventário e a
// fila de fundo voltava a tentar enviá-los. A cópia de contingência em
// `localStorage` (`gbr_backup_<tenant>_<filial>`) fazia pior: o «Recovery Boot»
// do Inventory reinseria o ativo removido no arranque seguinte, com o carimbo.
//
// Cada teste fecha um caminho de remoção, com a contra-prova: o ativo que fica
// mantém o carimbo e a pendência intactos.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { memoria, localforageMock } = vi.hoisted(() => {
  const memoria = new Map<string, unknown>();
  const localforageMock = {
    config: () => undefined,
    createInstance: () => localforageMock,
    getItem: async (chave: string) => (memoria.has(chave) ? memoria.get(chave) : null),
    setItem: async (chave: string, valor: unknown) => {
      memoria.set(chave, valor);
    },
    removeItem: async (chave: string) => {
      memoria.delete(chave);
    },
    clear: async () => {
      memoria.clear();
    },
    keys: async () => [...memoria.keys()]
  };
  return { memoria, localforageMock };
});

vi.mock('localforage', () => ({ default: localforageMock }));
vi.mock('../services/securityService', () => ({
  encryption: {
    encrypt: async (dados: unknown) => dados,
    decrypt: async (dados: unknown) => dados
  }
}));
vi.mock('../services/supabaseService', () => ({
  syncAssetsToCloudAndMark: vi.fn().mockResolvedValue(undefined),
  syncConfigToCloud: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('../services/localDbService', () => ({
  localDb: { assets: { put: vi.fn(), bulkPut: vi.fn() } },
  backupDatabaseToPhysicalStorage: vi.fn()
}));
vi.mock('../services/FileSystemStorageService', () => ({
  FileSystemStorageService: { salvarEmDiretorioLocal: vi.fn() }
}));
vi.mock('../services/recnoGuardService', () => ({
  reportRecnoConflictForAsset: vi.fn()
}));
vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { db, sqliteService } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import {
  clearInventory,
  clearMultipleInventories,
  queueAssetBackupMirror,
  flushAssetBackupMirror
} from '../services/persistenceService';
import { DatabaseMode } from '../types';
import type { Asset } from '../types';

const CHAVE_ATIVOS = 'inventory_assets_v24_internal_secure';
const CARIMBO = '2026-11-20T10:00:00.000Z';
const MOTIVO = '42501: permissão negada';

const ativo = (primarykey: string, filial: string, extra: Partial<Asset> = {}): Asset =>
  ({
    id: primarykey,
    primarykey,
    tenantid: 'CICOPAL',
    filial,
    status: 'P',
    etiqueta: primarykey,
    qt: 1,
    descricaodoativo: 'Ativo de prova',
    serial: '',
    dataaqusic: '',
    cnpj: '',
    nomefornecedor: '',
    notafiscal: '',
    endereco: '',
    registro: '',
    subreg: '',
    databaixa: '',
    contacontabil: '',
    centrodecusto: '',
    vlraquisic: 0,
    sn1_recno: null,
    sn3_recno: null,
    _is_synced: 0,
    _is_deleted: 0,
    _syncFailAt: CARIMBO,
    _syncFailReason: MOTIVO,
    ...extra
  }) as Asset;

const semear = async (ativos: Asset[]): Promise<void> => {
  for (const asset of ativos) {
    const linha = { ...asset, tenantid: String(asset.tenantid).toUpperCase() } as unknown as DexieAsset;
    await db.local_assets.put(linha);
    await db.ativos.put(linha);
  }
  await localforageMock.setItem(CHAVE_ATIVOS, ativos);
};

const semearContingencia = (ativos: Asset[]): void => {
  const porUnidade = new Map<string, Asset[]>();
  for (const asset of ativos) {
    const chave = `gbr_backup_${String(asset.tenantid).toUpperCase()}_${String(asset.filial).toUpperCase()}`;
    porUnidade.set(chave, [...(porUnidade.get(chave) || []), asset]);
  }
  porUnidade.forEach((lista, chave) => localStorage.setItem(chave, JSON.stringify(lista)));
};

const chavesDeContingencia = (): string[] => {
  const chaves: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const chave = localStorage.key(i);
    if (chave && chave.startsWith('gbr_backup_')) chaves.push(chave);
  }
  return chaves.sort();
};

type Espelho = 'local_assets' | 'ativos';
const ESPELHOS: Espelho[] = ['local_assets', 'ativos'];

const chavesDoEspelho = async (tabela: Espelho): Promise<string[]> => {
  const linhas = (await db[tabela].toArray()) as unknown as Array<Record<string, unknown>>;
  return linhas.map(l => String(l.primarykey ?? l.id ?? '')).sort();
};

const carimbosPorEspelho = async (): Promise<Record<Espelho, string[]>> => {
  const resultado = { local_assets: [], ativos: [] } as Record<Espelho, string[]>;
  for (const tabela of ESPELHOS) {
    const linhas = (await db[tabela].toArray()) as unknown as Array<Record<string, unknown>>;
    resultado[tabela] = linhas
      .filter(l => !!l._syncFailAt)
      .map(l => `${String(l.primarykey ?? l.id)}:${String(l._syncFailAt)}`)
      .sort();
  }
  return resultado;
};

/** O que o selo conta: pendentes (`_is_synced = 0`, não apagadas) com carimbo. */
const falhasVisiveisNoSelo = async (): Promise<string[]> => {
  const pendentes = await db.local_assets
    .where('_is_synced')
    .equals(0)
    .filter(a => a._is_deleted !== 1 && !!a._syncFailAt)
    .toArray();
  return pendentes.map(a => String(a.primarykey ?? a.id)).sort();
};

describe('carimbo da falha no reset/limpeza local', () => {
  beforeEach(async () => {
    memoria.clear();
    localStorage.clear();
    flushAssetBackupMirror();
    await db.local_assets.clear();
    await db.ativos.clear();
  });

  afterEach(() => {
    flushAssetBackupMirror();
  });

  it('«Limpeza Total» sem unidade: não sobra linha, carimbo nem rascunho de contingência', async () => {
    const a1 = ativo('PK-A1', 'UNIDADE-A');
    const b1 = ativo('PK-B1', 'UNIDADE-B');
    await semear([a1, b1]);
    semearContingencia([a1, b1]);
    queueAssetBackupMirror(a1, a1.tenantid, a1.filial);

    await clearInventory(DatabaseMode.INTERNAL);

    for (const tabela of ESPELHOS) {
      expect(await chavesDoEspelho(tabela)).toEqual([]);
    }
    expect(await falhasVisiveisNoSelo()).toEqual([]);
    expect(chavesDeContingencia()).toEqual([]);
    expect(await localforageMock.getItem(CHAVE_ATIVOS)).toBeNull();

    // A escrita coalescida pendente não pode regravar o ativo removido.
    flushAssetBackupMirror();
    expect(chavesDeContingencia()).toEqual([]);
  });

  it('«Limpeza Total» de uma unidade: sai dos três espelhos e da contingência; as outras ficam intactas', async () => {
    const a1 = ativo('PK-A1', 'UNIDADE-A');
    const a2 = ativo('PK-A2', 'UNIDADE-A', { _syncFailReason: 'PGRST204: coluna ausente' });
    const b1 = ativo('PK-B1', 'UNIDADE-B');
    await semear([a1, a2, b1]);
    semearContingencia([a1, a2, b1]);
    queueAssetBackupMirror(a2, a2.tenantid, a2.filial);

    // O handler passa a unidade como está no selector: a remoção normaliza.
    await clearInventory(DatabaseMode.INTERNAL, 'unidade-a');

    for (const tabela of ESPELHOS) {
      expect(await chavesDoEspelho(tabela)).toEqual(['PK-B1']);
    }
    // O ativo mantido guarda o carimbo e continua pendente (o selo não mente).
    expect(await falhasVisiveisNoSelo()).toEqual(['PK-B1']);
    const carimbos = await carimbosPorEspelho();
    for (const tabela of ESPELHOS) {
      expect(carimbos[tabela]).toEqual([`PK-B1:${CARIMBO}`]);
    }

    expect(chavesDeContingencia()).toEqual(['gbr_backup_CICOPAL_UNIDADE-B']);
    const restantes = (await localforageMock.getItem(CHAVE_ATIVOS)) as Asset[];
    expect(restantes.map(a => a.primarykey)).toEqual(['PK-B1']);

    flushAssetBackupMirror();
    expect(chavesDeContingencia()).toEqual(['gbr_backup_CICOPAL_UNIDADE-B']);
    const contingenciaB = JSON.parse(localStorage.getItem('gbr_backup_CICOPAL_UNIDADE-B') || '[]') as Asset[];
    expect(contingenciaB.map(a => a.primarykey)).toEqual(['PK-B1']);
  });

  it('«Limpeza em massa» por unidade: só as unidades escolhidas perdem o carimbo', async () => {
    const a1 = ativo('PK-A1', 'UNIDADE-A');
    const b1 = ativo('PK-B1', 'UNIDADE-B');
    const c1 = ativo('PK-C1', 'UNIDADE-C');
    await semear([a1, b1, c1]);
    semearContingencia([a1, b1, c1]);

    await clearMultipleInventories(['UNIDADE-A', 'UNIDADE-B'], DatabaseMode.INTERNAL);

    for (const tabela of ESPELHOS) {
      expect(await chavesDoEspelho(tabela)).toEqual(['PK-C1']);
    }
    expect(await falhasVisiveisNoSelo()).toEqual(['PK-C1']);
    expect(chavesDeContingencia()).toEqual(['gbr_backup_CICOPAL_UNIDADE-C']);
    const restantes = (await localforageMock.getItem(CHAVE_ATIVOS)) as Asset[];
    expect(restantes.map(a => a.primarykey)).toEqual(['PK-C1']);
  });

  it('«Desvincular e Reiniciar Sistema»: o expurgo total não deixa carimbo em espelho nenhum', async () => {
    await semear([ativo('PK-A1', 'UNIDADE-A'), ativo('PK-B1', 'UNIDADE-B')]);

    await sqliteService.hardResetDatabase();

    const carimbos = await carimbosPorEspelho();
    for (const tabela of ESPELHOS) {
      expect(carimbos[tabela]).toEqual([]);
    }
  });

  it('higienização do Gestor de Base: as duas tabelas saem juntas e nenhum carimbo sobrevive', async () => {
    await semear([ativo('PK-A1', 'UNIDADE-A'), ativo('PK-B1', 'UNIDADE-B')]);

    // Mesma transação de `DatabaseManagerScreen.handleCompleteDatabasePurge`.
    await db.transaction('rw', [db.local_assets, db.ativos], async () => {
      await db.local_assets.clear();
      await db.ativos.clear();
    });

    const carimbos = await carimbosPorEspelho();
    for (const tabela of ESPELHOS) {
      expect(carimbos[tabela]).toEqual([]);
    }
  });
});
