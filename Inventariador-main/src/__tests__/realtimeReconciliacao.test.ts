// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';

/**
 * H1 · Fase 4 — o tempo real volta a ler o que perdeu.
 *
 * O canal avisa quando cai e quando volta (`SUBSCRIBED`). Ao reconectar, o app
 * pede à nuvem as linhas com `updated_at > checkpoint` — esta é a leitura que
 * fecha a janela de perda. Aqui fixa-se o contrato do serviço: o filtro do
 * checkpoint, a paginação, o mapeamento da linha crua e a passagem do estado do
 * canal a quem assina.
 */

// Credenciais fake → o cliente Supabase existe e o caminho de nuvem é exercitado.
vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

type ChannelCallback = (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => void;
type StatusCallback = (status: string) => void;

let cloudRows: Record<string, unknown>[] = [];
let failCloud = false;
let filtros: { coluna: string; valor: unknown }[] = [];
let ordem: [string, unknown] | undefined;
let intervalo: [number, number] | undefined;
let canais: { callback?: ChannelCallback; status?: StatusCallback }[] = [];

function buildFakeSupabase() {
  const channel = vi.fn((name: string) => {
    const ch: { name: string; callback?: ChannelCallback; status?: StatusCallback; unsubscribe: ReturnType<typeof vi.fn> } = {
      name,
      unsubscribe: vi.fn()
    };
    Object.assign(ch, {
      on: (_event: string, _config: unknown, callback: ChannelCallback) => {
        ch.callback = callback;
        return ch;
      },
      subscribe: (status?: StatusCallback) => {
        ch.status = status;
        return ch;
      }
    });
    canais.push(ch);
    return ch;
  });

  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.in = (coluna: string, valor: unknown) => {
      filtros.push({ coluna: `in:${coluna}`, valor });
      return q;
    };
    q.gt = (coluna: string, valor: unknown) => {
      filtros.push({ coluna: `gt:${coluna}`, valor });
      return q;
    };
    q.order = (coluna: string, opts: unknown) => {
      ordem = [coluna, opts];
      return q;
    };
    q.range = (a: number, b: number) => {
      intervalo = [a, b];
      return Promise.resolve(
        failCloud ? { data: null, error: { message: 'rede em baixo' } } : { data: cloudRows, error: null }
      );
    };
    return q;
  });

  return { channel, from };
}

let subscribeToAssetChanges: typeof SupabaseService.subscribeToAssetChanges;
let fetchAssetsChangedSince: typeof SupabaseService.fetchAssetsChangedSince;

beforeAll(async () => {
  createClientMock.mockReturnValue(buildFakeSupabase() as never);
  const mod = await import('../services/supabaseService');
  subscribeToAssetChanges = mod.subscribeToAssetChanges;
  fetchAssetsChangedSince = mod.fetchAssetsChangedSince;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  cloudRows = [];
  failCloud = false;
  filtros = [];
  ordem = undefined;
  intervalo = undefined;
  canais = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('subscribeToAssetChanges — o estado do canal chega a quem assina', () => {
  it('entrega SUBSCRIBED/CACHED para a reconciliação e continua a filtrar o contrato', () => {
    const onUpdate = vi.fn();
    const onStatus = vi.fn();

    subscribeToAssetChanges('CICOPAL', onUpdate, onStatus);
    const canal = canais[0];

    canal.status?.('SUBSCRIBED');
    expect(onStatus).toHaveBeenCalledWith('SUBSCRIBED');

    canal.callback?.({ new: { id: 'PK-1', tenantid: 'CICOPAL' }, old: {}, eventType: 'UPDATE' });
    expect(onUpdate).toHaveBeenCalledTimes(1);

    canal.callback?.({ new: { id: 'PK-9', tenantid: 'OUTRO' }, old: {}, eventType: 'UPDATE' });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('fetchAssetsChangedSince — a leitura por checkpoint do realtime', () => {
  it('filtra updated_at > checkpoint e o contrato, e mapeia a linha crua', async () => {
    cloudRows = [
      {
        id: 'PK-1',
        primarykey: 'PK-1',
        tenantid: 'cicopal',
        filial: '010101 CICOPAL GO',
        etiqueta: '007222',
        status: 'CONFERIDO',
        conferido: true,
        auditor: 'BRUNO',
        data_leitura: '2026-11-20T10:00:00.000Z',
        gps_lat: -15.8,
        gps_lng: -47.9,
        is_deleted: false,
        updated_at: '2026-11-20T10:01:00.000Z'
      }
    ];

    const linhas = await fetchAssetsChangedSince('CICOPAL', '2026-11-20T09:00:00.000Z');

    expect(filtros).toContainEqual({ coluna: 'in:tenantid', valor: ['CICOPAL'] });
    expect(filtros).toContainEqual({ coluna: 'gt:updated_at', valor: '2026-11-20T09:00:00.000Z' });
    expect(ordem).toEqual(['updated_at', { ascending: true }]);
    expect(intervalo).toEqual([0, 999]);

    expect(linhas).toHaveLength(1);
    const linha = linhas![0];
    expect(linha._auditor).toBe('BRUNO');
    expect(linha._dataLeitura).toBe('2026-11-20T10:00:00.000Z');
    expect(linha.latitude).toBe(-15.8);
    expect(linha.longitude).toBe(-47.9);
    expect(linha._is_deleted).toBe(0);
  });

  it('sem checkpoint não vai à nuvem', async () => {
    const linhas = await fetchAssetsChangedSince('CICOPAL', '   ');
    expect(linhas).toBeNull();
  });

  it('devolve null quando a leitura falha (o checkpoint não avança)', async () => {
    failCloud = true;
    const linhas = await fetchAssetsChangedSince('CICOPAL', '2026-11-20T09:00:00.000Z');
    expect(linhas).toBeNull();
  });
});
