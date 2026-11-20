// @vitest-environment jsdom
// ============================================================================
// fetchUnitNamesFromCloud.test.ts — a lista de filiais da tela de seleção sai
// dos NOMES do contrato: uma consulta (`unit_names`), com a paginação antiga
// (`assets?select=filial`, página a página com `Range`) só como reserva quando a
// função ainda não existe no projeto. Nunca corre sem contrato resolvido (muro
// SRE).
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

type Pagina = { data?: Array<{ filial?: string | null }> | null; error?: { message: string } | null };
type RespostaRpc = { data?: unknown; error?: { message?: string; code?: string } | null };

let fetchUnitNamesFromCloud: typeof SupabaseService.fetchUnitNamesFromCloud;
let supabaseStub: {
  from: (table: string) => unknown;
  rpc?: (fn: string, args: Record<string, unknown>) => Promise<RespostaRpc>;
};

/** A função não existe na base (migração por aplicar) — resposta do PostgREST. */
const RPC_AUSENTE: RespostaRpc = {
  data: null,
  error: { code: 'PGRST202', message: 'Could not find the function public.unit_names(p_tenantid)' }
};

/** Builder fake que devolve uma página por chamada de `range` e grava os limites. */
function stubPaginacao(paginas: Pagina[]) {
  const ranges: Array<[number, number]> = [];
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn((inicio: number, fim: number) => {
    ranges.push([inicio, fim]);
    return Promise.resolve(paginas[ranges.length - 1] ?? { data: [], error: null });
  });
  const fromSpy = vi.spyOn(supabaseStub, 'from').mockImplementation(() => builder);
  return { builder, ranges, fromSpy };
}

/** Substitui `rpc` no cliente: é assim que cada caso escolhe a via a exercitar. */
function stubUnitNamesRpc(resposta: RespostaRpc) {
  const rpc = vi.fn(async () => resposta);
  supabaseStub.rpc = rpc as unknown as typeof supabaseStub.rpc;
  return rpc;
}

function linha(filial: string) {
  return { filial };
}

describe('fetchUnitNamesFromCloud — filiais do contrato sem baixar ativos', () => {
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    fetchUnitNamesFromCloud = mod.fetchUnitNamesFromCloud;
    supabaseStub = mod.supabase as unknown as {
      from: (table: string) => unknown;
      rpc?: (fn: string, args: Record<string, unknown>) => Promise<RespostaRpc>;
    };
  });

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    // Por omissão, a função ainda não existe: os casos antigos continuam a
    // exercitar a paginação (a reserva), que é o caminho de quem não migrou.
    stubUnitNamesRpc(RPC_AUSENTE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem tenantid NÃO consulta nada (nem a função, nem a tabela)', async () => {
    const fromSpy = vi.spyOn(supabaseStub, 'from');
    const rpc = stubUnitNamesRpc({ data: ['NAO DEVERIA SER PEDIDO'], error: null });

    expect(await fetchUnitNamesFromCloud(undefined)).toEqual([]);
    expect(await fetchUnitNamesFromCloud(null)).toEqual([]);
    expect(await fetchUnitNamesFromCloud('')).toEqual([]);
    expect(await fetchUnitNamesFromCloud('   ')).toEqual([]);

    expect(fromSpy).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('offline não consulta nada', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const fromSpy = vi.spyOn(supabaseStub, 'from');
    const rpc = stubUnitNamesRpc({ data: ['NAO DEVERIA SER PEDIDO'], error: null });

    expect(await fetchUnitNamesFromCloud('CICOPAL')).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('com a função unit_names faz UM pedido e não pagina', async () => {
    const rpc = stubUnitNamesRpc({
      data: ['010201 snacks pa', '010101 CICOPAL GO', '010101 CICOPAL GO', '  '],
      error: null
    });
    const fromSpy = vi.spyOn(supabaseStub, 'from');

    const nomes = await fetchUnitNamesFromCloud('  cicopal ');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('unit_names', { p_tenantid: 'CICOPAL' });
    expect(fromSpy).not.toHaveBeenCalled();
    expect(nomes).toEqual(['010101 CICOPAL GO', '010201 SNACKS PA']);
  });

  it('função que responde vazio NÃO volta a paginar (contrato sem filiais)', async () => {
    stubUnitNamesRpc({ data: [], error: null });
    const fromSpy = vi.spyOn(supabaseStub, 'from');

    await expect(fetchUnitNamesFromCloud('CICOPAL')).resolves.toEqual([]);

    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('sem a função (PGRST202) cai na paginação e devolve o mesmo resultado', async () => {
    const rpc = stubUnitNamesRpc(RPC_AUSENTE);
    const { ranges } = stubPaginacao([{ data: [linha('010101 CICOPAL GO')], error: null }]);

    const nomes = await fetchUnitNamesFromCloud('CICOPAL');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(ranges).toEqual([[0, 999]]);
    expect(nomes).toEqual(['010101 CICOPAL GO']);
  });

  it('pede só a coluna filial, do contrato em UPPER, ordenada', async () => {
    const { builder } = stubPaginacao([{ data: [linha('010101 CICOPAL GO')], error: null }]);

    await fetchUnitNamesFromCloud('  cicopal ');

    expect(builder.select).toHaveBeenCalledWith('filial');
    expect(builder.eq).toHaveBeenCalledWith('tenantid', 'CICOPAL');
    expect(builder.order).toHaveBeenCalledWith('filial', { ascending: true });
  });

  it('pagina com Range até a página vir incompleta', async () => {
    const cheia = Array.from({ length: 1000 }, (_, i) => linha(`FILIAL ${i}`));
    const { ranges } = stubPaginacao([
      { data: cheia, error: null },
      { data: [linha('FILIAL 0'), linha('ULTIMA FILIAL')], error: null }
    ]);

    const nomes = await fetchUnitNamesFromCloud('CICOPAL');

    expect(ranges).toEqual([[0, 999], [1000, 1999]]); // duas páginas, e para
    expect(nomes).toHaveLength(1001); // 1000 + 1: a repetida foi deduplicada
    expect(nomes).toContain('ULTIMA FILIAL');
    expect(nomes.filter(n => n === 'FILIAL 0')).toHaveLength(1);
  });

  it('erro na consulta não rebenta e devolve lista vazia', async () => {
    stubPaginacao([{ data: null, error: { message: 'permission denied' } }]);

    await expect(fetchUnitNamesFromCloud('CICOPAL')).resolves.toEqual([]);
  });
});
