// @vitest-environment jsdom
// ============================================================================
// campaignUnitFilter.test.ts — a campanha da NUVEM não podia ser filtrada pelo
// rótulo literal do cartão.
//
// Bug real (figuras): o contrato CICOPAL aparecia com as filiais configuradas,
// mas o cartão dizia «AGUARDANDO LIBERAÇÃO · FALTA CAMPANHA» e o botão da
// campanha nascia vermelho. `fetchCampaigns` pedia à nuvem
// `.or('filial.eq.010101 CICOPAL GO,filial.is.null')`: a coluna pode gravar
// `010101_CICOPAL_GO`, e o valor com espaços nem é sintaxe válida no PostgREST
// — o erro devolvia ZERO campanhas. Agora a unidade é filtrada depois do
// merge, com a mesma chave tolerante do caminho local (`matchUnitKeys`).
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Credenciais fake → `isInternalMode` falso → o caminho de nuvem é exercitado.
vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

interface FakeQuery {
  select: (cols: string) => FakeQuery;
  eq: (col: string, val: string) => FakeQuery;
  order: (
    col: string,
    opts?: { ascending?: boolean }
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  or: (expr: string) => FakeQuery;
}

let cloudCampaigns: Record<string, unknown>[] = [];
let failCloud = false;
let usedOrFilter = false;

function buildFakeSupabase(): { from: (table: string) => FakeQuery } {
  const from = (table: string): FakeQuery => {
    const query: FakeQuery = {
      select: () => query,
      eq: () => query,
      order: () =>
        table === 'campaigns' && !failCloud
          ? Promise.resolve({ data: cloudCampaigns, error: null })
          : Promise.resolve({ data: null, error: { message: 'network down' } }),
      or: () => {
        usedOrFilter = true;
        return query;
      }
    };
    return query;
  };
  return { from };
}

let fetchCampaigns: typeof import('../services/supabaseService').fetchCampaigns;

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  cloudCampaigns = [];
  failCloud = false;
  usedOrFilter = false;
  createClientMock.mockReturnValue(buildFakeSupabase() as never);
  // Import dinâmico: garante a ordem stubEnv → mock → avaliação do módulo.
  const mod = await import('../services/supabaseService');
  fetchCampaigns = mod.fetchCampaigns;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const campaign = (filial: string, status = 'ACTIVE') => ({
  id: `camp-${filial}`,
  name: `Inventário ${filial}`,
  status,
  tenantid: 'CICOPAL',
  filial,
  created_at: '2026-11-18T10:00:00.000Z',
  start_date: '2026-11-18T10:00:00.000Z'
});

describe('fetchCampaigns — unidade comparada por chave, não pelo rótulo literal', () => {
  it('encontra a campanha da nuvem gravada com underscore para o cartão com espaços', async () => {
    cloudCampaigns = [campaign('010101_CICOPAL_GO')];

    const rows = await fetchCampaigns('CICOPAL', '010101 CICOPAL GO');

    expect(rows.map((c) => c.filial)).toEqual(['010101_CICOPAL_GO']);
    // O filtro por unidade NÃO vai para o PostgREST (valor com espaços/quebra).
    expect(usedOrFilter).toBe(false);
  });

  it('não deixa a campanha de outra filial vazar para a unidade pedida', async () => {
    cloudCampaigns = [campaign('010101_CICOPAL_GO'), campaign('010201_SNACKS_PA')];

    const rows = await fetchCampaigns('CICOPAL', '010101 CICOPAL GO');

    expect(rows.map((c) => c.filial)).toEqual(['010101_CICOPAL_GO']);
  });

  it('sem unidade pedida devolve o contrato inteiro (mapa de liberação)', async () => {
    cloudCampaigns = [campaign('010101_CICOPAL_GO'), campaign('010201_SNACKS_PA', 'CREATED')];

    const rows = await fetchCampaigns('CICOPAL', null);

    expect(rows).toHaveLength(2);
  });

  it('mantém as campanhas GLOBAL (sem filial) em qualquer unidade', async () => {
    cloudCampaigns = [campaign('')];

    const rows = await fetchCampaigns('CICOPAL', '010101 CICOPAL GO');

    expect(rows).toHaveLength(1);
  });

  it('falha de nuvem devolve lista vazia sem lançar', async () => {
    failCloud = true;

    await expect(fetchCampaigns('CICOPAL', '010101 CICOPAL GO')).resolves.toEqual([]);
  });
});
