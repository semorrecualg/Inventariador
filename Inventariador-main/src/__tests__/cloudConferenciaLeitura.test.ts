// @vitest-environment jsdom
// ============================================================================
// cloudConferenciaLeitura.test.ts — a conferência que volta da nuvem.
//
// `getAssetByTag` devolvia a linha crua do Postgres como `Asset`: abrir um ativo
// por QR Code mostrava «pendente» mesmo com `conferido = true` na nuvem, e
// perdia autor e data da leitura (os nomes da nuvem são `conferido`, `auditor`
// e `data_leitura`, não `_conferido`, `_auditor`, `_dataLeitura`).
//
// `fetchCampaignStats` contava `status = 'CONFERIDO'`, que deixou de acompanhar
// a conferência: quem confere no aparelho grava `_conferido` e não mexe no
// `status`, por isso o número do laudo ficava abaixo do real.
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

// O módulo lê `localStorage` no topo (getDatabaseMode).
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

let mod: typeof SupabaseService;
let client: { from: (table: string) => unknown };

/** Cadeia do PostgREST para `getAssetByTag`: select/eq/or encadeiam, single resolve. */
const tagChain = (step: () => Promise<{ data: unknown; error: unknown }>) => {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = self;
  builder.eq = self;
  builder.or = self;
  builder.single = () => step();
  return builder;
};

type Resposta = { count: number | null; error: unknown };

/** Cadeia do PostgREST para `fetchCampaignStats`: os filtros decidem a resposta. */
const statsBuilder = (resolve: (filtros: Array<[string, unknown]>) => Resposta) => {
  const filtros: Array<[string, unknown]> = [];
  const builder = {
    eq: (coluna: string, valor: unknown) => {
      filtros.push([coluna, valor]);
      return builder;
    },
    not: (coluna: string, operador: string, valor: unknown) => {
      filtros.push([coluna, `${operador} ${String(valor)}`]);
      return builder;
    },
    then: (onFulfilled: (valor: Resposta) => unknown) => Promise.resolve(resolve(filtros)).then(onFulfilled),
  };
  return builder;
};

const stubStats = (opcoes: {
  conferido?: Resposta;
  status?: Resposta;
  total?: Resposta;
  divergencias?: Resposta;
}) => {
  const filtrosVistos: string[][] = [];
  vi.spyOn(client, 'from').mockImplementation(() => ({
    select: () => statsBuilder((filtros) => {
      const colunas = filtros.map(([coluna]) => coluna);
      filtrosVistos.push(colunas);
      if (colunas.includes('conferido')) return opcoes.conferido ?? { count: 0, error: null };
      if (colunas.includes('status')) return opcoes.status ?? { count: 0, error: null };
      if (colunas.includes('databaixa')) return opcoes.divergencias ?? { count: 0, error: null };
      return opcoes.total ?? { count: 0, error: null };
    })
  }) as never);
  return filtrosVistos;
};

describe('getAssetByTag — a linha da nuvem chega convertida para o app', () => {
  beforeAll(async () => {
    mod = await import('../services/supabaseService');
    client = mod.supabase as unknown as { from: (table: string) => unknown };
  }, 120000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mostra conferido, autor e data a partir das colunas da nuvem', async () => {
    const row = {
      id: 'X1',
      tenantid: 'cicopal',
      filial: '010101 cicopal go',
      status: 'PENDENTE', // conferir no aparelho não mexe no status
      conferido: true,
      auditor: 'ana@gbr.com',
      data_leitura: '2026-11-01T10:00:00.000Z',
    };
    vi.spyOn(client, 'from').mockImplementation(() => ({
      select: () => tagChain(async () => ({ data: row, error: null })),
    }) as never);

    const asset = await mod.getAssetByTag('004229', 'CICOPAL');

    expect(asset?._conferido).toBe(true);
    expect(asset?._auditor).toBe('ana@gbr.com');
    expect(asset?._dataLeitura).toBe('2026-11-01T10:00:00.000Z');
    // O contrato continua normalizado pela conversão comum.
    expect(asset?.tenantid).toBe('CICOPAL');
  });

  it('sem a coluna (script pendente), status CONFERIDO continua a valer', async () => {
    const row = { id: 'X2', tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', status: 'CONFERIDO' };
    vi.spyOn(client, 'from').mockImplementation(() => ({
      select: () => tagChain(async () => ({ data: row, error: null })),
    }) as never);

    const asset = await mod.getAssetByTag('004231');

    expect(asset?._conferido).toBe(true);
  });

  it('converte também a linha do segundo pedido (sem filtro de _is_deleted)', async () => {
    const row = { id: 'X3', tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', status: 'PENDENTE', conferido: true };
    let chamadas = 0;
    vi.spyOn(client, 'from').mockImplementation(() => ({
      select: () => tagChain(async () => {
        chamadas += 1;
        return chamadas === 1
          ? { data: null, error: { code: '42703', message: 'column "_is_deleted" does not exist' } }
          : { data: row, error: null };
      }),
    }) as never);

    const asset = await mod.getAssetByTag('004232');

    expect(chamadas).toBe(2);
    expect(asset?._conferido).toBe(true);
  });
});

describe('fetchCampaignStats — o laudo conta pela coluna conferido', () => {
  beforeAll(async () => {
    mod = await import('../services/supabaseService');
    client = mod.supabase as unknown as { from: (table: string) => unknown };
  }, 120000);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('conta conferido = true e não volta ao status', async () => {
    const filtros = stubStats({ total: { count: 10, error: null }, conferido: { count: 5, error: null } });

    const stats = await mod.fetchCampaignStats('camp-a', 'CICOPAL');

    expect(stats).toMatchObject({ total: 10, inventoried: 5 });
    expect(filtros.some((colunas) => colunas.includes('conferido'))).toBe(true);
    expect(filtros.some((colunas) => colunas.includes('status') && colunas.includes('conferido'))).toBe(false);
    // O status só é consultado no caminho de divergências.
    expect(filtros.filter((colunas) => colunas.includes('status')).every((colunas) => colunas.includes('databaixa'))).toBe(true);
  });

  it('cai no status quando a coluna ainda não existe (42703)', async () => {
    stubStats({
      total: { count: 10, error: null },
      conferido: { count: null, error: { code: '42703', message: 'column "conferido" does not exist' } },
      status: { count: 7, error: null },
    });

    const stats = await mod.fetchCampaignStats('camp-a', 'CICOPAL');

    expect(stats).toMatchObject({ total: 10, inventoried: 7 });
  });

  it('não inventa conferidos quando nem a coluna nem o status respondem', async () => {
    stubStats({
      conferido: { count: null, error: { code: '42703', message: 'column "conferido" does not exist' } },
      status: { count: null, error: { message: 'network down' } },
    });

    const stats = await mod.fetchCampaignStats('camp-a', 'CICOPAL');

    expect(stats).toMatchObject({ inventoried: 0 });
  });
});
