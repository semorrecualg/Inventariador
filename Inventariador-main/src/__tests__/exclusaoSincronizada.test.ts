// @vitest-environment jsdom
// ============================================================================
// exclusaoSincronizada.test.ts — apagar num aparelho apaga nos outros.
//
// O app faz soft delete (`_is_deleted = 1`) e esconde a linha no ecrã, mas a
// tabela `assets` não tinha onde guardar a flag e o payload não a enviava: a
// linha da nuvem ficava intacta, o pull seguinte devolvia-a ativa e o ativo
// «ressuscitava» no outro telemóvel — e, ao reiniciar, no aparelho que o apagou.
//
// O contrato tem três pontas: o envio leva `is_deleted`, a leitura da nuvem
// devolve `_is_deleted` e a coluna existe no schema.
// ============================================================================
import 'fake-indexeddb/auto';
import { autenticarClienteDeTeste } from './helpers/sessaoNuvemCliente';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
let mapCloudAssetRow: typeof SupabaseService.mapCloudAssetRow;
let supabaseStub: { from: (table: string) => unknown };

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

/** Stub de `from('assets')`: upsert + a leitura de identidades (select/in/in). */
const stubTables = (upsertResult: unknown) => {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const byEtiqueta = vi.fn().mockResolvedValue({ data: [], error: null });
  const byTenant = vi.fn(() => ({ in: byEtiqueta }));
  const select = vi.fn(() => ({ in: byTenant }));
  vi.spyOn(supabaseStub, 'from').mockImplementation(() => ({ upsert, select }));
  return { upsert };
};

describe('exclusão sincronizada — o soft delete chega à nuvem e aos outros aparelhos', () => {
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    syncAssetsToCloud = mod.syncAssetsToCloud;
    mapCloudAssetRow = mod.mapCloudAssetRow;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  }, 120000);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    // O envio exige sessão da nuvem: estes testes correm com utilizador autenticado.
    autenticarClienteDeTeste(supabaseStub);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o envio em massa leva is_deleted = true no ativo apagado', async () => {
    const { upsert } = stubTables({ error: null });

    await syncAssetsToCloud([asset({ _is_deleted: true })], 'CICOPAL');

    const payload = upsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(payload[0]).toMatchObject({ primarykey: 'PK-1', is_deleted: true });
  });

  it('o envio leva is_deleted = false no ativo que continua na base', async () => {
    const { upsert } = stubTables({ error: null });

    await syncAssetsToCloud([asset({ _is_deleted: 0 })], 'CICOPAL');

    const payload = upsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(payload[0]).toMatchObject({ primarykey: 'PK-1', is_deleted: false });
  });

  it('a linha apagada desce da nuvem com _is_deleted = 1 (a lista esconde-a)', () => {
    const linha = mapCloudAssetRow({
      id: 'PK-1',
      tenantid: 'cicopal',
      filial: '010101 cicopal go',
      primarykey: 'PK-1',
      is_deleted: true
    });

    expect(Number(linha._is_deleted)).toBe(1);
  });

  it('base sem a coluna (schema antigo) não apaga o ativo por omissão', () => {
    const linha = mapCloudAssetRow({
      id: 'PK-1',
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      primarykey: 'PK-1'
    });

    expect(Number(linha._is_deleted)).toBe(0);
  });

  it('o schema tem a coluna: bootstrap das bases novas e script da base actual', () => {
    const bootstrap = readFileSync(join(process.cwd(), 'docs', 'supabase_bootstrap.sql'), 'utf8');
    const script = readFileSync(join(process.cwd(), 'scripts', 'assets-exclusao.sql'), 'utf8');

    expect(bootstrap).toContain('is_deleted        boolean NOT NULL DEFAULT false');
    expect(bootstrap).toContain('ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false');

    expect(script).toContain('ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false');
    expect(script).toContain('UPDATE public.assets SET is_deleted = false WHERE is_deleted IS NULL');
  });
});
