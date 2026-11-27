// @vitest-environment jsdom
// ============================================================================
// syncAssetsToCloudFalha.test.ts — o carimbo da recusa também vale no envio
// em massa (autosave, push delta de boot, Gestor, fila da nuvem).
//
// O selo vermelho nasceu no ciclo de fundo (`processDataSyncQueue`), mas
// `syncAssetsToCloud` é o outro caminho de envio e rejeita ativo por ativo no
// isolamento de lote. Sem carimbo aqui, um ativo recusado por esta via
// continuava a parecer apenas «Pendente Nuvem», e um carimbo antigo podia
// sobreviver a um envio aceite por este caminho.
// ============================================================================
import 'fake-indexeddb/auto';
import { autenticarClienteDeTeste } from './helpers/sessaoNuvemCliente';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';
import type { Asset } from '../types';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
};
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());

let syncAssetsToCloud: typeof SupabaseService.syncAssetsToCloud;
let syncAssetsToCloudAndMark: typeof SupabaseService.syncAssetsToCloudAndMark;
let supabaseStub: { from: (table: string) => unknown };
let db: typeof import('../services/sqliteService').db;

const asset = (over: Record<string, unknown> = {}) =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'CONFERIDO',
    descricaodoativo: 'ATIVO',
    ...over
  }) as unknown as Asset;

/** Stub de `from('assets')`: upsert + a leitura de identidades (select/in/in). */
const stubTables = (upsertResult: unknown) => stubTablesSequence([upsertResult]);

/** Igual, mas com uma resposta diferente por chamada (as repetições). */
const stubTablesSequence = (upsertResults: unknown[]) => {
  const upsert = vi.fn();
  for (const resultado of upsertResults) upsert.mockResolvedValueOnce(resultado);
  upsert.mockResolvedValue(upsertResults[upsertResults.length - 1]);
  const byEtiqueta = vi.fn().mockResolvedValue({ data: [], error: null });
  const byTenant = vi.fn(() => ({ in: byEtiqueta }));
  const select = vi.fn(() => ({ in: byTenant }));
  vi.spyOn(supabaseStub, 'from').mockImplementation(() => ({ upsert, select }));
  return { upsert };
};

const registoLocal = (primarykey = 'PK-1') =>
  db.local_assets.where('primarykey').equals(primarykey).first();

const semear = async (over: Record<string, unknown> = {}) => {
  await db.local_assets.put({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'CONFERIDO',
    _is_synced: 0,
    _is_deleted: 0,
    ...over
  } as never);
};

describe('syncAssetsToCloud — carimbo da recusa no registo local', () => {
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    syncAssetsToCloud = mod.syncAssetsToCloud;
    syncAssetsToCloudAndMark = mod.syncAssetsToCloudAndMark;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
    db = (await import('../services/sqliteService')).db;
  }, 120000);

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    // O envio exige sessão da nuvem: estes testes correm com utilizador autenticado.
    autenticarClienteDeTeste(supabaseStub);
    await db.local_assets.clear();
    await db.ativos.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('carimba o ativo que o envio em massa rejeitou', async () => {
    const { upsert } = stubTables({ error: { code: 'XX000', message: 'rls denied for assets' } });
    await semear();

    await expect(syncAssetsToCloud([asset()], 'CICOPAL')).rejects.toBeTruthy();

    // Falhou no lote e no reenvio individual — o carimbo vem do isolamento.
    expect(upsert).toHaveBeenCalledTimes(2);
    const local = await registoLocal();
    expect(typeof local?._syncFailAt).toBe('string');
    expect(String(local?._syncFailReason)).toContain('rls denied');
  });

  it('não carimba o ativo aceito pela nuvem', async () => {
    stubTables({ error: null });
    await semear();

    const result = await syncAssetsToCloud([asset()], 'CICOPAL');

    expect(result).toEqual(['PK-1']);
    const local = await registoLocal();
    expect(local?._syncFailAt).toBeUndefined();
  });

  // 23505 dizia «já está sincronizado» e o payload era deitado fora: o aparelho
  // ficava verde e a nuvem por actualizar, com a conferência perdida em silêncio.
  it('23505 com outro id: repete pelo (tenantid, primarykey) e actualiza a linha', async () => {
    const duplicado = {
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "assets_tenant_primarykey_key"'
      }
    };
    // Lote recusado → isolamento por linha recusado → repetição aceite.
    const { upsert } = stubTablesSequence([duplicado, duplicado, { error: null }]);
    await semear();

    const result = await syncAssetsToCloud([asset()], 'CICOPAL');

    expect(result).toEqual(['PK-1']);
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(upsert.mock.calls[2][1]).toEqual({ onConflict: 'tenantid, primarykey' });
    expect(upsert.mock.calls[2][0][0]).toMatchObject({ primarykey: 'PK-1', conferido: true });

    const local = await registoLocal();
    expect(local?._syncFailAt).toBeUndefined();
  });

  it('23505 que a repetição também recusa não conta como sincronizado', async () => {
    const duplicado = {
      error: { code: '23505', message: 'duplicate key value violates unique constraint' }
    };
    stubTablesSequence([duplicado, duplicado, duplicado]);
    await semear();

    await expect(syncAssetsToCloud([asset()], 'CICOPAL')).rejects.toThrow(/chave de origem já existe/);

    const local = await registoLocal();
    expect(Number(local?._is_synced)).toBe(0);
    expect(typeof local?._syncFailAt).toBe('string');
  });

  it('o envio seguinte apaga o carimbo quando a nuvem aceita', async () => {
    stubTables({ error: { code: 'XX000', message: 'rls denied for assets' } });
    await semear();
    await expect(syncAssetsToCloud([asset()], 'CICOPAL')).rejects.toBeTruthy();
    expect((await registoLocal())?._syncFailAt).toBeTruthy();

    vi.restoreAllMocks();
    // O `restoreAllMocks` também devolve a sessão ao cliente sem token.
    autenticarClienteDeTeste(supabaseStub);
    stubTables({ error: null });
    await syncAssetsToCloudAndMark([asset()], 'CICOPAL');

    const local = await registoLocal();
    expect(local?._syncFailAt).toBeUndefined();
    expect(local?._syncFailReason).toBeUndefined();
    expect(Number(local?._is_synced)).toBe(1);
  });
});
