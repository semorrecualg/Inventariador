// @vitest-environment jsdom
// ============================================================================
// cloudCampaignRelease.test.tsx — CASO REAL: campanha que existe SÓ na nuvem.
//
// Cenário das figuras: contrato CICOPAL, filial `010101 CICOPAL GO` com âncora
// GPS configurada, e uma campanha ACTIVE gravada na nuvem com a coluna
// `filial = 010101_CICOPAL_GO` (nunca baixada para o `campaigns` local). O
// cartão dizia «AGUARDANDO LIBERAÇÃO · FALTA CAMPANHA», o botão da campanha
// nascia vermelho e o ACESSAR ficava travado.
//
// A cadeia percorrida aqui é a de produção, sem atalhos:
//   fetchCampaigns (nuvem, filtro tolerante)
//     → loadCampaignUnitsForRelease (local sem filtro + contrato/nuvem)
//       → isUnitInReleaseSet + buildUnitReleaseMap + readUnitRelease
//         → WorkContextSelector (o cartão a ficar LIBERADA)
//
// O último teste fixa o limite do produto: em modo INTERNAL a nuvem não é
// consultada (soberania) — a campanha TEM de existir localmente.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { User } from '../types';
import type { UnitReleaseMap } from '../utils/unitRelease';

// Credenciais fake → `isInternalMode` falso → o caminho de nuvem é exercitado.
vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

const TENANT = 'CICOPAL';
/** Rótulo do cartão (com espaços) — o que o utilizador vê. */
const CARD_FILIAL = '010101 CICOPAL GO';
/** Grafia da coluna na nuvem. */
const CLOUD_FILIAL = '010101_CICOPAL_GO';

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

function buildFakeCloud(): { from: (table: string) => FakeQuery } {
  const from = (table: string): FakeQuery => {
    const query: FakeQuery = {
      select: () => query,
      eq: () => query,
      order: () =>
        table === 'campaigns'
          ? Promise.resolve({ data: cloudCampaigns, error: null })
          : Promise.resolve({ data: [], error: null }),
      or: () => query
    };
    return query;
  };
  return { from };
}

type SupabaseModule = typeof import('../services/supabaseService');
type ReleaseModule = typeof import('../utils/campaignRelease');
type UnitReleaseModule = typeof import('../utils/unitRelease');
type SelectorModule = typeof import('../components/WorkContextSelector');
type TypesModule = typeof import('../types');

let supabaseModule: SupabaseModule;
let sqliteService: typeof import('../services/sqliteService').sqliteService;
let campaignRelease: ReleaseModule;
let unitRelease: UnitReleaseModule;
let WorkContextSelector: SelectorModule['default'];
let AppModule: TypesModule['AppModule'];
let UserRole: TypesModule['UserRole'];

/** Linha da nuvem: campanha ACTIVE da filial, gravada com underscore. */
const cloudCampaign = (over: Record<string, unknown> = {}) => ({
  id: 'camp-010101',
  name: 'Inventário CICOPAL nov/2026',
  status: 'ACTIVE',
  tenantid: TENANT,
  filial: CLOUD_FILIAL,
  created_at: '2026-11-18T10:00:00.000Z',
  start_date: '2026-11-18T10:00:00.000Z',
  ...over
});

/**
 * Cadeia de produção: lê o local (vazio neste aparelho) + o contrato na nuvem
 * e devolve as unidades que libertam o cartão.
 */
async function releaseUnitsFromSources(): Promise<{
  active: Set<string>;
  recorded: Set<string>;
}> {
  return campaignRelease.loadCampaignUnitsForRelease({
    scope: TENANT,
    readLocal: () => sqliteService.getCampaigns(),
    fetchScoped: (tenantid) => supabaseModule.fetchCampaigns(tenantid, null)
  });
}

/** Mapa de liberação como o App o monta a partir das flags da unidade. */
function releaseMapFor(units: { active: Set<string>; recorded: Set<string> }) {
  return unitRelease.buildUnitReleaseMap([
    {
      name: CARD_FILIAL,
      tenantid: TENANT,
      hasAnchor: true,
      hasCampaign: unitRelease.isUnitInReleaseSet(units.active, CARD_FILIAL),
      hasCampaignRecord: unitRelease.isUnitInReleaseSet(units.recorded, CARD_FILIAL)
    }
  ]);
}

function renderCard(map: UnitReleaseMap) {
  const onSelect = vi.fn();
  const user = {
    tenantid: TENANT,
    email: 'admin@example.com',
    username: 'admin',
    name: 'ADMIN',
    role: UserRole.ADMIN,
    filial: '',
    units: []
  } as unknown as User;
  render(
    React.createElement(WorkContextSelector, {
      user,
      contexts: [{ tenantid: TENANT, filial: '' }],
      unitRelease: map,
      availableFiliais: { [TENANT]: [CARD_FILIAL] },
      onSelect,
      onLogout: vi.fn(),
      onOpenAdmin: vi.fn()
    })
  );
  return { onSelect };
}

const accessButton = () =>
  screen.getByText('Acessar o Módulo').closest('button') as HTMLButtonElement;

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  cloudCampaigns = [];
  createClientMock.mockReturnValue(buildFakeCloud() as never);

  // Import dinâmico: stubEnv → mock → avaliação dos módulos.
  supabaseModule = await import('../services/supabaseService');
  sqliteService = (await import('../services/sqliteService')).sqliteService;
  campaignRelease = await import('../utils/campaignRelease');
  unitRelease = await import('../utils/unitRelease');
  WorkContextSelector = (await import('../components/WorkContextSelector')).default;
  const types = await import('../types');
  AppModule = types.AppModule;
  UserRole = types.UserRole;
});

afterEach(() => cleanup());

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('campanha que existe SÓ na nuvem liberta o cartão', () => {
  it('a cadeia nuvem → mapa de liberação devolve LIBERADA para 010101 CICOPAL GO', async () => {
    cloudCampaigns = [cloudCampaign()];

    const units = await releaseUnitsFromSources();
    expect(units.active.size).toBe(1);

    const status = unitRelease.readUnitRelease(
      releaseMapFor(units),
      TENANT,
      CARD_FILIAL
    );

    expect(status?.released).toBe(true);
    expect(status?.missing).toEqual([]);
    expect(status?.hasAnchor).toBe(true);
    expect(status?.hasCampaign).toBe(true);
  });

  it('o cartão 010101 CICOPAL GO mostra LIBERADA PARA INVENTÁRIO e libera o ACESSAR', async () => {
    cloudCampaigns = [cloudCampaign()];

    const map = releaseMapFor(await releaseUnitsFromSources());
    const { onSelect } = renderCard(map);

    expect(await screen.findByText(CARD_FILIAL)).toBeTruthy();
    expect(screen.getByText('LIBERADA PARA INVENTÁRIO')).toBeTruthy();
    expect(screen.queryByText(/FALTA CAMPANHA/)).toBeNull();
    expect(screen.queryByTestId('unit-release-warning')).toBeNull();

    fireEvent.click(screen.getByText('INVENTARIADOR').closest('button') as HTMLButtonElement);
    expect(accessButton().disabled).toBe(false);
    fireEvent.click(accessButton());
    expect(onSelect).toHaveBeenCalledWith({ tenantid: TENANT, filial: CARD_FILIAL }, AppModule.INVENTORY);
  });

  it('campanha da nuvem com filial de OUTRA unidade não liberta esta', async () => {
    cloudCampaigns = [cloudCampaign({ id: 'camp-outra', filial: '010201_SNACKS_PA' })];

    const units = await releaseUnitsFromSources();
    const status = unitRelease.readUnitRelease(releaseMapFor(units), TENANT, CARD_FILIAL);

    expect(status?.released).toBe(false);
    expect(status?.missing).toEqual(['CAMPAIGN']);
  });
});

describe('limite do produto: modo INTERNAL não consulta a nuvem', () => {
  it('com a campanha apenas na nuvem, o cartão continua FALTA CAMPANHA', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    cloudCampaigns = [cloudCampaign()];

    const units = await releaseUnitsFromSources();
    expect(units.active.size).toBe(0);

    const map = releaseMapFor(units);
    expect(unitRelease.readUnitRelease(map, TENANT, CARD_FILIAL)?.released).toBe(false);

    renderCard(map);
    expect(await screen.findByText(CARD_FILIAL)).toBeTruthy();
    expect(screen.getAllByText(/FALTA CAMPANHA/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('unit-release-warning')).toBeTruthy();

    fireEvent.click(screen.getByText('INVENTARIADOR').closest('button') as HTMLButtonElement);
    expect(accessButton().disabled).toBe(true);
  });
});
