// @vitest-environment jsdom
// ============================================================================
// ancoraEntreDispositivos.test.ts — portão da F5: «a âncora volta noutro
// aparelho».
//
// O caminho crítico é: marcar a âncora sem rede (ou em BASE LOCAL) → reconectar
// → a fila sobe para `inventory_config` e `unit_configs` → um aparelho sem nada
// no disco recebe a âncora pelo `fetchUnitConfigs`.
//
// As credenciais falsas são fixadas ANTES do import dinâmico (mesmo padrão de
// syncConfigToCloud.test.ts) porque `isInternalMode` é calculado no carregamento
// do módulo: sem elas o serviço nasce em INTERNAL e nada sincroniza.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';
import { contarAncorasPendentes, lerAncorasPendentes } from '../utils/ancoraPendente';
import type { UnitConfig } from '../types';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

let saveUnitConfig: typeof SupabaseService.saveUnitConfig;
let fetchUnitConfigs: typeof SupabaseService.fetchUnitConfigs;
let flushAncorasPendentes: typeof SupabaseService.flushAncorasPendentes;
let supabaseStub: { from: (table: string) => unknown };

type Row = Record<string, unknown>;
type Upsert = { table: string; payload: Row; options: unknown };

let online = true;
let upsertError: { code: string; message: string } | null = null;
let rows: { inventory_config: Row[]; unit_configs: Row[] } = { inventory_config: [], unit_configs: [] };
let upserts: Upsert[] = [];

/**
 * Stub mínimo do PostgREST: o serviço usa `select(...).eq(...).eq(...).limit(1)`
 * (flags guardadas) e `select(...).eq(...)` (pull da nuvem), além do `upsert`.
 */
function stubSupabase() {
  vi.spyOn(supabaseStub, 'from').mockImplementation((table: string) => {
    const result = { data: (rows as Record<string, Row[]>)[table] ?? [], error: null };
    const chain = {
      select: () => chain,
      eq: () => chain,
      limit: () => Promise.resolve(result),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
      upsert: (payload: Row, options: unknown) => {
        upserts.push({ table, payload, options });
        return Promise.resolve({ error: upsertError });
      }
    };
    return chain;
  });
}

const ancora: UnitConfig = {
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  unit_id: '010101 CICOPAL GO',
  lat: -16.706719,
  lng: -49.106422,
  radius_meters: 500,
  is_active: true,
  source: 'manual',
  updated_by: 'auditor@x'
};

beforeAll(async () => {
  const mod = await import('../services/supabaseService');
  saveUnitConfig = mod.saveUnitConfig;
  fetchUnitConfigs = mod.fetchUnitConfigs;
  flushAncorasPendentes = mod.flushAncorasPendentes;
  supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };

  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => online
  });
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('app_database_mode', 'SUPABASE');
  online = true;
  upsertError = null;
  rows = { inventory_config: [], unit_configs: [] };
  upserts = [];
  stubSupabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('âncora entre dispositivos (F5)', () => {
  it('sem rede não chama a nuvem: a âncora fica no aparelho e na fila por subir', async () => {
    online = false;

    const res = await saveUnitConfig(ancora);

    expect(res).toBe(true);
    expect(upserts).toEqual([]);
    // Gravada no aparelho na mesma (o operador pode continuar a trabalhar).
    expect(localStorage.getItem('local_unit_configs')).toContain('010101 CICOPAL GO');
    const fila = lerAncorasPendentes(localStorage);
    expect(fila).toHaveLength(1);
    expect(fila[0].config.lat).toBeCloseTo(-16.706719);
  });

  it('em BASE LOCAL a fila espera sem uma única chamada de rede (F1)', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');

    await saveUnitConfig(ancora);

    expect(upserts).toEqual([]);
    expect(contarAncorasPendentes(localStorage)).toBe(1);

    // Ligar a base local não deixa a fila escapar.
    await expect(flushAncorasPendentes()).resolves.toBe(0);
    expect(upserts).toEqual([]);
    expect(contarAncorasPendentes(localStorage)).toBe(1);
  });

  it('erro do servidor devolve a âncora à fila em vez de a perder', async () => {
    upsertError = { code: '500', message: 'boom' };

    await saveUnitConfig(ancora);

    expect(upserts.map(u => u.table)).toContain('inventory_config');
    expect(contarAncorasPendentes(localStorage)).toBe(1);
  });

  it('ao reconectar a fila sobe e a âncora volta noutro aparelho', async () => {
    // 1. Aparelho A marca a âncora em modo avião.
    online = false;
    await saveUnitConfig(ancora);
    expect(contarAncorasPendentes(localStorage)).toBe(1);

    // 2. Reconnecta: a fila sobe para as DUAS tabelas (âncora + regras).
    online = true;
    await expect(flushAncorasPendentes()).resolves.toBe(1);
    expect(contarAncorasPendentes(localStorage)).toBe(0);

    const envioConfig = upserts.find(u => u.table === 'inventory_config');
    const envioUnidade = upserts.find(u => u.table === 'unit_configs');
    expect(envioConfig).toBeTruthy();
    expect(envioUnidade).toBeTruthy();
    expect(Number((envioConfig?.payload.data as Row).lat)).toBeCloseTo(-16.706719);
    expect(Number(envioUnidade?.payload.lat)).toBeCloseTo(-16.706719);
    expect((envioUnidade?.payload.flags as Row).hasGps).toBe(true);

    // 3. A nuvem guardou o que subiu.
    rows.inventory_config = [
      {
        tenantid: 'CICOPAL',
        filial: ancora.filial,
        data: envioConfig?.payload.data,
        updated_at: new Date().toISOString()
      }
    ];
    rows.unit_configs = [{ ...envioUnidade?.payload }];

    // 4. Aparelho B: reinstalação, nada no disco, mesma conta/contrato.
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');

    const configs = await fetchUnitConfigs('CICOPAL');
    const encontrada = configs.find(c => c.filial === '010101 CICOPAL GO');

    expect(encontrada).toBeTruthy();
    expect(Number(encontrada?.lat)).toBeCloseTo(-16.706719);
    expect(Number(encontrada?.lng)).toBeCloseTo(-49.106422);
    expect(Number(encontrada?.radius_meters)).toBe(500);
    expect(encontrada?.hasGps).toBe(true);
  });

  it('a fila é reenviada no arranque, dentro do fetchUnitConfigs', async () => {
    online = false;
    await saveUnitConfig(ancora);
    online = true;

    // Nenhum ecrã de configuração aberto: o pull do boot já drena a fila.
    await fetchUnitConfigs('CICOPAL');

    expect(contarAncorasPendentes(localStorage)).toBe(0);
    expect(upserts.some(u => u.table === 'inventory_config')).toBe(true);
    expect(upserts.some(u => u.table === 'unit_configs')).toBe(true);
  });
});
