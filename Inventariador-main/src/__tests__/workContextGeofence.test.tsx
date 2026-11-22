// @vitest-environment jsdom
// ============================================================================
// workContextGeofence.test.tsx — GEOCERCA do cartão da filial no CONTRATO.
//
// O cartão mostra a distância até a âncora gravada em `unit_configs` (turf),
// DENTRO quando está no raio e FORA quando não está. A âncora tem de vir das
// linhas CRUAS da tabela: o espelho `localDb.unitConfigs.toArray()` normaliza
// `lat`/`lng` para 0 e a geocerca nunca encontrava configuração para medir
// (o bug que deixou o perímetro invisível na extinta Unidade Operacional).
//
// Este teste falha se a tela voltar a ler o espelho: aqui só existe `db`
// (linhas cruas) — o espelho ficaria vazio e nenhum perímetro seria desenhado.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import WorkContextSelector from '../components/WorkContextSelector';
import { UserRole } from '../types';
import type { User } from '../types';
import { buildUnitReleaseMap } from '../utils/unitRelease';

const FILIAL = '010101 CICOPAL GO';
const TENANT = 'CICOPAL';

// Âncora em Goiânia (mesma do cenário real) e um ponto a ~811 km (São Paulo).
const ANCORA = { lat: -16.6869, lng: -49.2648 };
const LONGE = { lat: -23.5505, lng: -46.6333 };

const { unitConfigsToArray } = vi.hoisted(() => ({ unitConfigsToArray: vi.fn() }));

// A tela lê o catálogo da base local no mount; por padrão vazio.
vi.mock('../utils/tenantCatalog', () => ({
  listContracts: vi.fn().mockResolvedValue([])
}));

// Só `unit_configs` interessa aqui: a tabela crua onde `lat`/`lng`/`radius`
// vivem preenchidos (o espelho não é usado por esta tela).
vi.mock('../services/sqliteService', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    db: {
      unit_configs: { toArray: unitConfigsToArray },
      local_assets: { each: vi.fn().mockResolvedValue(undefined) }
    }
  };
});

const auditor = (): User =>
  ({
    tenantid: TENANT,
    email: 'auditor@example.com',
    username: 'auditor',
    name: 'Auditor',
    role: UserRole.AUDITOR,
    filial: FILIAL,
    units: [FILIAL]
  }) as unknown as User;

// Unidade liberada (âncora + campanha): o cartão é escolha, não trava.
const releasedMap = buildUnitReleaseMap([
  { name: FILIAL, tenantid: TENANT, hasAnchor: true, hasCampaign: true }
]);

const renderSelector = () =>
  render(
    React.createElement(WorkContextSelector, {
      user: auditor(),
      contexts: [{ tenantid: TENANT, filial: FILIAL }],
      unitRelease: releasedMap,
      onSelect: vi.fn(),
      onLogout: vi.fn(),
      onOpenAdmin: vi.fn()
    })
  );

/** Posição do terminal entregue pelo GPS do aparelho. */
const posicionar = (coords: { lat: number; lng: number } | null) => {
  const geolocation = coords
    ? {
        getCurrentPosition: (ok: PositionCallback) =>
          ok({ coords: { latitude: coords.lat, longitude: coords.lng } } as GeolocationPosition),
        watchPosition: (ok: PositionCallback) => {
          ok({ coords: { latitude: coords.lat, longitude: coords.lng } } as GeolocationPosition);
          return 1;
        },
        clearWatch: () => undefined
      }
    : undefined;
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
};

const geofence = () => screen.getByTestId(`filial-geofence-${FILIAL}`);

beforeEach(() => {
  unitConfigsToArray.mockReset();
  unitConfigsToArray.mockResolvedValue([
    { filial: FILIAL, tenantid: TENANT, lat: ANCORA.lat, lng: ANCORA.lng, radius_meters: 500 }
  ]);
});

afterEach(() => {
  cleanup();
  posicionar(null);
});

describe('CONTRATO DE TRABALHO · geocerca lê as linhas cruas de unit_configs', () => {
  it('na âncora: DENTRO DO PERÍMETRO com 0 m', async () => {
    posicionar(ANCORA);
    renderSelector();

    await waitFor(() => expect(geofence().textContent).toBe('DENTRO DO PERÍMETRO (0m)'));
    // A âncora veio de `unit_configs` (linhas cruas), não do espelho.
    expect(unitConfigsToArray).toHaveBeenCalled();
  });

  it('longe da âncora: FORA DO PERÍMETRO SRE com a distância e o raio máximo', async () => {
    posicionar(LONGE);
    renderSelector();

    await waitFor(() =>
      expect(geofence().textContent).toBe('FORA DO PERÍMETRO SRE (811.1km/max 500m)')
    );
    expect(geofence().className).toContain('text-amber-600');
  });

  it('sem âncora gravada (lat/lng a zero) não inventa perímetro', async () => {
    unitConfigsToArray.mockResolvedValue([
      { filial: FILIAL, tenantid: TENANT, lat: 0, lng: 0, radius_meters: 500 }
    ]);
    posicionar(ANCORA);
    renderSelector();

    await waitFor(() => expect(unitConfigsToArray).toHaveBeenCalled());
    expect(screen.queryByTestId(`filial-geofence-${FILIAL}`)).toBeNull();
  });
});
