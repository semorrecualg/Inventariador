// @vitest-environment jsdom
// ============================================================================
// syncAssetsToCloudGps.test.ts — o envio só leva `gps_lat`/`gps_lng` quando o
// ativo tem leitura válida no aparelho.
//
// Um upsert com `gps_lat: null` no `ON CONFLICT DO UPDATE` APAGA a coordenada
// que outro aparelho já gravou na nuvem. Por isso a coluna tem de ficar fora do
// payload — e não a `null` — quando o ativo não tem ponto local.
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
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
let supabaseStub: { from: (table: string) => unknown };

const asset = (over: Record<string, unknown>) =>
  ({
    id: '001288',
    primarykey: '001288',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'CONFERIDO',
    descricaodoativo: 'ATIVO',
    ...over
  }) as unknown as Asset;

/** Stub de `from('assets')`: upsert + a leitura de identidades (select/in/in). */
const stubTables = () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const byEtiqueta = vi.fn().mockResolvedValue({ data: [], error: null });
  const byTenant = vi.fn(() => ({ in: byEtiqueta }));
  const select = vi.fn(() => ({ in: byTenant }));
  vi.spyOn(supabaseStub, 'from').mockImplementation(() => ({ upsert, select }));
  return { upsert, select };
};

/** O payload da (única) escrita: o envio faz upsert de um lote de linhas. */
const sentRow = async (payload: Asset): Promise<Record<string, unknown>> => {
  const { upsert } = stubTables();
  await syncAssetsToCloud([payload], 'CICOPAL');
  const rows = upsert.mock.calls[0][0] as Record<string, unknown>[];
  expect(rows).toHaveLength(1);
  return rows[0];
};

describe('syncAssetsToCloud — a coordenada só sobe quando há leitura local', () => {
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    syncAssetsToCloud = mod.syncAssetsToCloud;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  }, 120000);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converte latitude/longitude da conferência em gps_lat/gps_lng', async () => {
    const row = await sentRow(asset({ latitude: -15.7942, longitude: -47.8825 }));

    expect(row.gps_lat).toBeCloseTo(-15.7942);
    expect(row.gps_lng).toBeCloseTo(-47.8825);
  });

  it('sem leitura local OMITE as colunas e não apaga a coordenada da nuvem', async () => {
    const row = await sentRow(asset({}));

    expect(Object.prototype.hasOwnProperty.call(row, 'gps_lat')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, 'gps_lng')).toBe(false);
  });

  it('não trata ausência, o par (0,0) nem leitura fora da faixa como coordenada', async () => {
    for (const [index, payload] of [
      asset({ id: 'SEM-LEITURA', primarykey: 'SEM-LEITURA', latitude: null, longitude: null, gps_lat: null, gps_lng: null }),
      asset({ id: 'ZERO-ZERO', primarykey: 'ZERO-ZERO', latitude: 0, longitude: 0 }),
      asset({ id: 'FORA-DA-FAIXA', primarykey: 'FORA-DA-FAIXA', latitude: 91, longitude: -47.8825 }),
      asset({ id: 'VAZIO', primarykey: 'VAZIO', latitude: '', longitude: '' })
    ].entries()) {
      const row = await sentRow(payload);
      expect(Object.prototype.hasOwnProperty.call(row, 'gps_lat'), `caso ${index}`).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(row, 'gps_lng'), `caso ${index}`).toBe(false);
    }
  });

  it('mantém a leitura que já estava na grafia da nuvem', async () => {
    const row = await sentRow(asset({ gps_lat: -16.68, gps_lng: -49.25 }));

    expect(row.gps_lat).toBeCloseTo(-16.68);
    expect(row.gps_lng).toBeCloseTo(-49.25);
  });
});
