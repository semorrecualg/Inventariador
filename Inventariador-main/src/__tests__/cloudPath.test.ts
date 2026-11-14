// @vitest-environment jsdom
// ============================================================================
// cloudPath.test.ts — Canário das duas passagens do CI.
//
// O CI corre `npm test` em INTERNAL e em SUPABASE_PLUS (TEST_DB_MODE). Sem este
// canário a segunda passagem podia ficar verde sem tocar na nuvem: bastava
// `isInternalMode` continuar true e `fetchTenantFiliais` sair cedo. Aqui a
// exigência é explícita — no modo nuvem o transporte TEM de ser usado e o dado
// TEM de vir marcado como `cloud`; no modo INTERNAL não pode haver chamada.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const MODO_NUVEM = process.env.TEST_DB_MODE === 'supabase';

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

/** Tabelas tocadas pelo transporte: é isto que prova a nuvem exercitada. */
const tabelasChamadas: string[] = [];

type Builder = {
  select: (cols?: string, opts?: { count?: string }) => Builder;
  eq: (col: string, val: string) => Builder;
  not: (col: string, op: string, val: unknown) => Builder;
  range: (from: number, to: number) => Builder;
  then: (resolve: (value: unknown) => void) => Promise<unknown>;
};

/** Cliente falso: uma filial e 7 ativos, o suficiente para o caminho de nuvem. */
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
    q.not = () => q;
    q.range = () => q;
    q.then = (resolve) => {
      tabelasChamadas.push(table);
      const data = table === 'assets' && count === undefined ? [{ filial: '010101 CICOPAL GO' }] : [];
      return Promise.resolve({ data: count === undefined ? data : null, count, error: null }).then(resolve);
    };
    return q;
  });
  return { from };
}

let mod: typeof import('../services/supabaseService');

beforeAll(async () => {
  // createClient é chamado no import do módulo: o fake tem de existir antes.
  createClientMock.mockReturnValue(clienteFake());
  mod = await import('../services/supabaseService');
});

beforeEach(() => {
  tabelasChamadas.length = 0;
  localStorage.clear();
  sessionStorage.clear();
});

describe('canário das passagens INTERNAL/SUPABASE_PLUS', () => {
  it('arranca no modo pedido pela passagem', () => {
    expect(mod.isInternalMode).toBe(!MODO_NUVEM);
    expect(mod.getDatabaseMode()).toBe(MODO_NUVEM ? 'SUPABASE' : 'INTERNAL');
  });

  it('usa o transporte da nuvem apenas no modo SUPABASE_PLUS', async () => {
    const filiais = await mod.fetchTenantFiliais('CICOPAL');

    if (MODO_NUVEM) {
      // Sem estas duas asserções a passagem de nuvem podia repetir a INTERNAL.
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
});
