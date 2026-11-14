// @vitest-environment jsdom
// ============================================================================
// cloudPath.test.ts — Canário das duas passagens do CI.
//
// O CI corre `npm test` em INTERNAL e em SUPABASE_PLUS (TEST_DB_MODE). Sem este
// canário a segunda passagem podia ficar verde sem tocar na nuvem. Aqui os três
// entrypoints de nuvem são exigidos no modo SUPABASE_PLUS e proibidos no
// INTERNAL:
//   1. `fetchTenantFiliais`  — listagem de filiais;
//   2. `syncConfigToCloud`   — configuração do contrato;
//   3. `fetchFullInventory`  — pull incremental (`since` → `updated_at >`).
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const MODO_NUVEM = process.env.TEST_DB_MODE === 'supabase';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

/** Tabelas tocadas pelo transporte: é isto que prova a nuvem exercitada. */
const tabelasChamadas: string[] = [];
/** Colunas usadas em `.gt()` — prova que o delta usou `updated_at > since`. */
const colunasGt: string[] = [];

type Builder = {
  select: (cols?: string, opts?: { count?: string }) => Builder;
  eq: (col: string, val: unknown) => Builder;
  in: (col: string, vals: unknown[]) => Builder;
  not: (col: string, op: string, val: unknown) => Builder;
  gt: (col: string, val: unknown) => Builder;
  range: (from: number, to: number) => Builder;
  order: (col: string, opts?: unknown) => Builder;
  limit: (n: number) => Builder;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
  upsert: (payload: unknown, opts?: unknown) => Promise<{ error: null }>;
  insert: (payload: unknown) => Promise<{ error: null }>;
  then: (resolve: (value: unknown) => void) => Promise<unknown>;
};

const ASSET_FAKE = {
  id: 'a1',
  primarykey: 'a1',
  etiqueta: 'A1',
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  updated_at: '2026-02-01T00:00:00.000Z',
};

function clienteFake() {
  const from = vi.fn((table: string) => {
    let count: number | undefined;
    const q = {} as Builder;
    q.select = (...args: unknown[]) => {
      const opts = args[1] as { count?: string } | undefined;
      if (opts?.count) count = 7;
      return q;
    };
    q.eq = () => q;
    q.in = () => q;
    q.not = () => q;
    q.gt = (col: string) => {
      colunasGt.push(col);
      return q;
    };
    q.range = () => q;
    q.order = () => q;
    q.limit = () => q;
    q.maybeSingle = () => {
      tabelasChamadas.push(table);
      return Promise.resolve({
        data: table === 'inventory_config' ? { id: 'config_CICOPAL', status_operacao: 'ATIVO' } : null,
        error: null,
      });
    };
    q.upsert = () => {
      tabelasChamadas.push(table);
      return Promise.resolve({ error: null });
    };
    q.insert = () => {
      tabelasChamadas.push(table);
      return Promise.resolve({ error: null });
    };
    q.then = (resolve) => {
      tabelasChamadas.push(table);
      const data = table === 'assets' && count === undefined ? [ASSET_FAKE] : [];
      return Promise.resolve({ data: count === undefined ? data : null, count, error: null }).then(resolve);
    };
    return q;
  });
  return { from, auth: { getSession: async () => ({ data: { session: null } }) } };
}

let mod: typeof import('../services/supabaseService');

beforeAll(async () => {
  // createClient é chamado no import do módulo: o fake tem de existir antes.
  createClientMock.mockReturnValue(clienteFake());
  mod = await import('../services/supabaseService');
});

beforeEach(() => {
  tabelasChamadas.length = 0;
  colunasGt.length = 0;
  localStorage.clear();
  sessionStorage.clear();
});

describe('canário das passagens INTERNAL/SUPABASE_PLUS', () => {
  it('arranca no modo pedido pela passagem', () => {
    expect(mod.isInternalMode).toBe(!MODO_NUVEM);
    expect(mod.getDatabaseMode()).toBe(MODO_NUVEM ? 'SUPABASE' : 'INTERNAL');
  });

  it('lista filiais pela nuvem apenas no modo SUPABASE_PLUS', async () => {
    const filiais = await mod.fetchTenantFiliais('CICOPAL');

    if (MODO_NUVEM) {
      // Sem estas asserções a passagem de nuvem podia repetir a INTERNAL.
      expect(tabelasChamadas).toContain('assets');
      expect(tabelasChamadas).toContain('unit_configs');
      expect(filiais).toEqual([
        expect.objectContaining({ filial: '010101 CICOPAL GO', source: 'cloud', assetCount: 7 }),
      ]);
    } else {
      expect(tabelasChamadas).toEqual([]);
      expect(filiais).toEqual([]);
    }
  });

  it('grava a configuração na nuvem apenas no modo SUPABASE_PLUS', async () => {
    await mod.syncConfigToCloud(
      {
        status: 'IN_USE',
        companies: ['010101 CICOPAL GO'],
        lastUpdated: '2026-01-01T00:00:00.000Z',
      } as never,
      'CICOPAL'
    );

    if (MODO_NUVEM) {
      expect(tabelasChamadas).toEqual(['inventory_config']);
    } else {
      expect(tabelasChamadas).toEqual([]);
    }
  });

  it('faz o pull incremental pela nuvem apenas no modo SUPABASE_PLUS', async () => {
    const since = '2026-01-01T00:00:00.000Z';
    const pull = await mod.fetchFullInventory('CICOPAL', undefined, undefined, undefined, {
      since,
      trackCheckpoint: true,
    });

    if (MODO_NUVEM) {
      expect(tabelasChamadas).toContain('assets');
      expect(tabelasChamadas).toContain('inventory_config');
      // Delta de verdade: o filtro por checkpoint foi aplicado na consulta.
      expect(colunasGt).toEqual(['updated_at']);
      expect(pull?.assets).toEqual([expect.objectContaining({ id: 'a1' })]);
    } else {
      expect(tabelasChamadas).toEqual([]);
      expect(colunasGt).toEqual([]);
      expect(pull).toBeNull();
    }
  });
});
