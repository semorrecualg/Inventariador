// @vitest-environment jsdom
// ============================================================================
// A EXCLUSÃO VENCE A SUBIDA (lado do envio)
//
// O upsert não lê o estado remoto. Um aparelho que ficou offline com a cópia
// ativa de um ativo apagado noutro lado reenviava-a e reactivava a linha em
// todos os aparelhos — a exclusão nunca era definitiva.
//
// Antes de escrever, o envio consulta a nuvem (`fetchCloudDeletedKeys`, uma
// consulta por lote) e deixa de fora as chaves apagadas. O restauro explícito é
// a única exceção (`allowUndelete`).
// ============================================================================
import 'fake-indexeddb/auto';
import { autenticarClienteDeTeste } from './helpers/sessaoNuvemCliente';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';
import type { Asset } from '../types';
import { devePreservarPendencia } from '../utils/pendencia';

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
let supabaseStub: { from: (table: string) => unknown };
let db: typeof import('../services/sqliteService').db;

const asset = (over: Record<string, unknown> = {}) =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'PENDENTE',
    descricaodoativo: 'ATIVO',
    ...over
  }) as unknown as Asset;

/**
 * Stub de `from('assets')`: o upsert devolve o resultado pedido e o `select`
 * responde conforme as colunas — a consulta de identidades (etiquetas) devolve
 * vazio, a guarda de exclusão devolve o que o teste disser.
 */
const stubTables = (upsertResult: unknown, apagadasNaNuvem: Array<Record<string, unknown>> = []) => {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const select = vi.fn((cols: string) => {
    const resposta = String(cols).includes('is_deleted')
      ? { data: apagadasNaNuvem, error: null }
      : { data: [], error: null };
    return { in: () => ({ in: () => Promise.resolve(resposta) }) };
  });
  vi.spyOn(supabaseStub, 'from').mockImplementation(() => ({ upsert, select }));
  return { upsert, select };
};

const linhaApagada = { tenantid: 'CICOPAL', primarykey: 'PK-1', is_deleted: true };

describe('exclusão vence a subida — o upsert consulta a nuvem antes de escrever', () => {
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    syncAssetsToCloud = mod.syncAssetsToCloud;
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
    await db.audit_logs.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('não reenvia a cópia ativa de um ativo apagado na nuvem', async () => {
    const { upsert } = stubTables({ error: null }, [linhaApagada]);

    const enviados = await syncAssetsToCloud([asset({ _is_deleted: 0 })], 'CICOPAL');

    expect(upsert).not.toHaveBeenCalled();
    expect(enviados).toEqual([]);
  });

  // Sem aplicar a exclusão ao registo local, ele ficava pendente e a fila
  // voltava a tentá-lo a cada ciclo até um pull chegar.
  it('a exclusão descartada é aplicada ao registo local (sai da fila)', async () => {
    stubTables({ error: null }, [linhaApagada]);
    await db.local_assets.put({
      id: 'PK-1',
      primarykey: 'PK-1',
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      etiqueta: '007222',
      _is_deleted: 0,
      _is_synced: 0
    } as never);

    const enviados = await syncAssetsToCloud([asset({ _is_deleted: 0 })], 'CICOPAL');

    const local = await db.local_assets.where('primarykey').equals('PK-1').first();
    expect(Number(local?._is_deleted)).toBe(1);
    expect(Number(local?._is_synced)).toBe(1);
    expect(enviados).toEqual([]);
  });

  it('o lote só leva as linhas que a nuvem não tem como apagadas', async () => {
    const { upsert } = stubTables({ error: null }, [linhaApagada]);

    const enviados = await syncAssetsToCloud(
      [asset({ _is_deleted: 0 }), asset({ id: 'PK-2', primarykey: 'PK-2', etiqueta: '007223' })],
      'CICOPAL'
    );

    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(payload.map(r => r.primarykey)).toEqual(['PK-2']);
    // Envio normal não leva a marca de restauro.
    expect(payload[0]).not.toHaveProperty('restored_at');
    expect(enviados).toEqual(['PK-2']);
  });

  it('o restauro explícito pode reativar (allowUndelete)', async () => {
    const { upsert } = stubTables({ error: null }, [linhaApagada]);

    const enviados = await syncAssetsToCloud(
      [asset({ _is_deleted: false })],
      'CICOPAL',
      undefined,
      { allowUndelete: true }
    );

    expect(upsert).toHaveBeenCalledTimes(1);
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(payload[0]).toMatchObject({ primarykey: 'PK-1', is_deleted: false });
    // A trava do servidor (`assets_bloquear_ressurreicao`) só aceita a reativação
    // com uma marca de restauro nova; o restauro explícito é quem a envia.
    expect(typeof payload[0].restored_at).toBe('string');
    expect(enviados).toEqual(['PK-1']);
  });

  it('nuvem sem exclusões: o envio segue como antes', async () => {
    const { upsert } = stubTables({ error: null }, []);

    const enviados = await syncAssetsToCloud([asset()], 'CICOPAL');

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(enviados).toEqual(['PK-1']);
  });

  it('a consulta falhar (schema antigo) não bloqueia o envio', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const select = vi.fn(() => ({ in: () => ({ in: () => Promise.resolve({ data: null, error: { code: '42703' } }) }) }));
    vi.spyOn(supabaseStub, 'from').mockImplementation(() => ({ upsert, select }));

    const enviados = await syncAssetsToCloud([asset()], 'CICOPAL');

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(enviados).toEqual(['PK-1']);
  });
});

describe('devePreservarPendencia — a exclusão vence a pendência local', () => {
  it('nuvem apagada: não preserva (o registo não volta a ficar pendente)', () => {
    expect(devePreservarPendencia({ _is_deleted: 1 }, { _is_synced: 0 })).toBe(false);
    expect(devePreservarPendencia({ _is_deleted: true }, { _is_synced: 0 })).toBe(false);
    expect(devePreservarPendencia({ _is_deleted: '1' }, { _is_synced: 0 })).toBe(false);
  });

  it('nuvem viva e registo pendente: preserva (trabalho de campo não se perde)', () => {
    expect(devePreservarPendencia({ _is_deleted: 0 }, { _is_synced: 0 })).toBe(true);
    expect(devePreservarPendencia({}, { _is_synced: 0 })).toBe(true);
  });

  it('registo já sincronizado ou sem cópia local: não há pendência a preservar', () => {
    expect(devePreservarPendencia({ _is_deleted: 0 }, { _is_synced: 1 })).toBe(false);
    expect(devePreservarPendencia({ _is_deleted: 0 }, null)).toBe(false);
    expect(devePreservarPendencia({ _is_deleted: 0 }, undefined)).toBe(false);
  });
});
