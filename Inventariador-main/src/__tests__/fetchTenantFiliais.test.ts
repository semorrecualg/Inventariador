// @vitest-environment jsdom
// ============================================================================
// fetchTenantFiliais.test.ts — Regressão do distinct PAGINADO de filiais do
// contrato (bug real: PostgREST limita cada request a ~1000 linhas; sem range()
// um tenant com >1000 ativos listava apenas as filiais das primeiras linhas).
//
// Também cobre: contagem exata por filial, merge das units do perfil e
// exclusão de sentinelas (DEFAULT/NULL/0/UNDEFINED/TODAS).
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Credenciais reais → isInternalMode=false → o caminho de nuvem é exercitado
// contra o cliente fake (createClient mockado).
vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

// Estado por teste (controlado pelo builder fake)
let assetFiliais: (string | null)[] = [];
let countsByFilial: Record<string, number> = {};
let unitConfigFiliais: { filial: string }[] = [];
let failCloud = false; // simula falha de rede/listagem na nuvem
let queriesLog: { table: string; cols: string; range?: [number, number]; eqFilial?: string; countOpt?: boolean }[] = [];

function buildFakeSupabase() {
  const from = vi.fn((table: string) => {
    const q: Record<string, unknown> = {};
    q._cols = '';
    q._opts = undefined as { count?: boolean } | undefined;
    q._eq = {} as Record<string, string>;
    q._range = undefined as [number, number] | undefined;
    q.select = (cols: string, opts?: { count?: boolean }) => { q._cols = cols; q._opts = opts; return q; };
    q.eq = (col: string, val: string) => { (q._eq as Record<string, string>)[col] = val; return q; };
    q.not = () => q;
    q.range = (a: number, b: number) => { q._range = [a, b]; return q; };
    q.then = (resolve: (v: unknown) => void) => {
      queriesLog.push({
        table,
        cols: String(q._cols),
        range: q._range as [number, number] | undefined,
        eqFilial: (q._eq as Record<string, string>).filial,
        countOpt: !!(q._opts as { count?: boolean })?.count,
      });
      let result: { data: unknown; count?: number; error: { message: string } | null };
      if (failCloud) {
        result = { data: null, error: { message: 'network down' } };
      } else if (table === 'assets' && (q._opts as { count?: boolean })?.count) {
        const f = (q._eq as Record<string, string>).filial;
        result = { data: null, count: f ? countsByFilial[f] ?? 0 : 0, error: null };
      } else if (table === 'assets') {
        const [a, b] = (q._range as [number, number]) || [0, 999];
        result = { data: assetFiliais.slice(a, b + 1).map((filial) => ({ filial })), error: null };
      } else if (table === 'unit_configs') {
        result = { data: unitConfigFiliais, error: null };
      } else {
        result = { data: [], error: null };
      }
      return Promise.resolve(result).then(resolve);
    };
    return q;
  });
  return { from };
}

let fetchTenantFiliais: typeof import('../services/supabaseService').fetchTenantFiliais;

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  assetFiliais = [];
  countsByFilial = {};
  unitConfigFiliais = [];
  queriesLog = [];
  failCloud = false;
  createClientMock.mockReturnValue(buildFakeSupabase());
  // Import dinâmico: garante a ordem stubEnv → mock → avaliação do módulo.
  const mod = await import('../services/supabaseService');
  fetchTenantFiliais = mod.fetchTenantFiliais;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('fetchTenantFiliais — distinct paginado + contagens + merge de perfil', () => {
  it('retorna TODAS as filiais mesmo com mais de 1000 ativos (bug do limite do PostgREST)', async () => {
    // 2.500 linhas: cada página de 1000 contém UMA filial diferente. Sem a
    // paginação, só a primeira filial (das primeiras 1000 linhas) apareceria.
    assetFiliais = [
      ...Array.from({ length: 1000 }, () => '010101 CICOPAL GO'),
      ...Array.from({ length: 1000 }, () => '010105 CICOPAL PA'),
      ...Array.from({ length: 500 }, () => '010201 SNACKS PA'),
    ];
    countsByFilial = {
      '010101 CICOPAL GO': 1000,
      '010105 CICOPAL PA': 1000,
      '010201 SNACKS PA': 500,
    };

    const res = await fetchTenantFiliais('CICOPAL');

    expect(res.map((f) => f.filial)).toEqual([
      '010101 CICOPAL GO',
      '010105 CICOPAL PA',
      '010201 SNACKS PA',
    ]);
    // As contagens exatas vieram da nuvem
    expect(res.find((f) => f.filial === '010101 CICOPAL GO')?.assetCount).toBe(1000);
    expect(res.find((f) => f.filial === '010201 SNACKS PA')?.assetCount).toBe(500);
    // Foram feitas requisições paginadas (mais de uma página de 1000)
    const rangeQueries = queriesLog.filter((q) => q.table === 'assets' && !q.countOpt && q.cols === 'filial');
    expect(rangeQueries.length).toBeGreaterThanOrEqual(3);
  });

  it('mescla as units autorizadas do perfil mesmo fora da nuvem', async () => {
    assetFiliais = [
      ...Array.from({ length: 1000 }, () => '010101 CICOPAL GO'),
      ...Array.from({ length: 1000 }, () => '010105 CICOPAL PA'),
    ];
    countsByFilial = { '010101 CICOPAL GO': 1000, '010105 CICOPAL PA': 1000 };

    const res = await fetchTenantFiliais('CICOPAL', { profileUnits: ['010301 FEIRA BOA BA'] });

    const nomes = res.map((f) => f.filial);
    expect(nomes).toContain('010101 CICOPAL GO');
    expect(nomes).toContain('010105 CICOPAL PA');
    expect(nomes).toContain('010301 FEIRA BOA BA');
  });

  it('ignora sentinelas e valores vazios como filial', async () => {
    assetFiliais = [
      '010101 CICOPAL GO',
      'DEFAULT',
      'NULL',
      '0',
      'UNDEFINED',
      'TODAS',
      '',
      null,
      '010105 CICOPAL PA',
    ];
    countsByFilial = { '010101 CICOPAL GO': 1, '010105 CICOPAL PA': 1 };

    const res = await fetchTenantFiliais('CICOPAL');

    expect(res.map((f) => f.filial)).toEqual(['010101 CICOPAL GO', '010105 CICOPAL PA']);
  });

  it('retorna [] para tenant vazio e tolera erro de listagem na nuvem sem quebrar', async () => {
    expect(await fetchTenantFiliais('  ')).toEqual([]);

    // Falha na nuvem → o erro é tratado e o perfil ainda é mesclado
    failCloud = true;
    const res = await fetchTenantFiliais('CICOPAL', { profileUnits: ['FILIAL X'] });
    expect(res.map((f) => f.filial)).toEqual(['FILIAL X']);
  });
});
