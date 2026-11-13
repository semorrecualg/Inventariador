// @vitest-environment jsdom
// ============================================================================
// fetchUnitNamesFromCloud.test.ts — a lista de filiais da tela de seleção sai
// SÓ da coluna `filial` (nunca dos ativos), página a página com `Range`, e
// nunca corre sem contrato resolvido (muro SRE).
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

type Pagina = { data?: Array<{ filial?: string | null }> | null; error?: { message: string } | null };

let fetchUnitNamesFromCloud: typeof SupabaseService.fetchUnitNamesFromCloud;
let supabaseStub: { from: (table: string) => unknown };

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

function linha(filial: string) {
  return { filial };
}

describe('fetchUnitNamesFromCloud — filiais do contrato sem baixar ativos', () => {
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    fetchUnitNamesFromCloud = mod.fetchUnitNamesFromCloud;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  });

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sem tenantid NÃO consulta nada (nem lista, nem toca na tabela)', async () => {
    const fromSpy = vi.spyOn(supabaseStub, 'from');

    expect(await fetchUnitNamesFromCloud(undefined)).toEqual([]);
    expect(await fetchUnitNamesFromCloud(null)).toEqual([]);
    expect(await fetchUnitNamesFromCloud('')).toEqual([]);
    expect(await fetchUnitNamesFromCloud('   ')).toEqual([]);

    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('offline não consulta nada', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const fromSpy = vi.spyOn(supabaseStub, 'from');

    expect(await fetchUnitNamesFromCloud('CICOPAL')).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
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
    const { ranges, fromSpy } = stubPaginacao([
      { data: cheia, error: null },
      { data: [linha('FILIAL 0'), linha('ULTIMA FILIAL')], error: null }
    ]);

    const nomes = await fetchUnitNamesFromCloud('CICOPAL');

    expect(fromSpy).toHaveBeenCalledTimes(2);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(nomes).toHaveLength(1001); // 1000 + 1: a repetida foi deduplicada
    expect(nomes).toContain('ULTIMA FILIAL');
    expect(nomes.filter(n => n === 'FILIAL 0')).toHaveLength(1);
  });

  it('erro na consulta não rebenta e devolve lista vazia', async () => {
    stubPaginacao([{ data: null, error: { message: 'permission denied' } }]);

    await expect(fetchUnitNamesFromCloud('CICOPAL')).resolves.toEqual([]);
  });
});
