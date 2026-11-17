// @vitest-environment jsdom
// ============================================================================
// campaignManagerInitialAction.test.tsx — botão CAMPANHA do cartão da filial.
//
// Regra do produto: o botão verde (campanha já ativa) abre a CAMPANHA daquela
// filial direto na ficha; o vermelho (sem campanha) abre a tela já no cadastro.
// O parâmetro `initialAction` é o que distingue os dois — sem ele a tela abria
// sempre no cadastro, mesmo quando a campanha já existia.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';

const { fetchCampaignsMock } = vi.hoisted(() => ({
  fetchCampaignsMock: vi.fn()
}));

vi.mock('motion/react', async () => {
  const ReactMod = await import('react');
  const MOTION_ONLY = new Set([
    'initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout', 'layoutId', 'variants'
  ]);
  const make = (tag: string) =>
    ReactMod.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const rest: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(props)) {
        if (!MOTION_ONLY.has(key)) rest[key] = value;
      }
      return ReactMod.createElement(tag, { ...rest, ref });
    });
  return {
    motion: new Proxy({}, { get: (_target, tag: string) => make(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      ReactMod.createElement(ReactMod.Fragment, null, children)
  };
});

vi.mock('@capacitor/device', () => ({
  Device: { getBatteryInfo: vi.fn().mockResolvedValue({ batteryLevel: 1, isCharging: true }) }
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../services/rbacService', () => ({
  isAdminUser: () => true,
  userHasPermission: () => true,
  isAuditorUser: () => false,
  hasPermission: () => false
}));

vi.mock('../services/sqliteService', () => ({
  db: {},
  sqliteService: { getIsInitialized: () => true, persist: vi.fn() }
}));

vi.mock('../services/localDbService', () => ({
  localDb: {
    campaigns: { delete: vi.fn(), toArray: vi.fn().mockResolvedValue([]) },
    assets: { removeCampaignFromAssets: vi.fn() }
  }
}));

vi.mock('../services/supabaseService', () => ({
  createCampaign: vi.fn(),
  updateCampaignStatus: vi.fn(),
  fetchCampaignStats: vi.fn().mockResolvedValue({ total: 0, inventoried: 0, divergences: 0 }),
  deleteCampaign: vi.fn(),
  getCampaignSnapshot: vi.fn(),
  createCampaignSnapshot: vi.fn(),
  fetchCampaigns: fetchCampaignsMock,
  fetchAllCampaigns: vi.fn().mockResolvedValue([]),
  campaignAuditWorkCount: vi.fn().mockResolvedValue(0)
}));

import CampaignManager from '../components/CampaignManager';
import type { InventoryCampaign, User } from '../types';

const FILIAL = '010101 CICOPAL GO';

const user = {
  id: 'u-1',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  tenantid: 'CICOPAL'
} as unknown as User;

const activeCampaign = (): InventoryCampaign => ({
  id: 'camp-a',
  name: 'Inventário nov 2026',
  description: '',
  status: 'ACTIVE',
  tenantid: 'CICOPAL',
  filial: FILIAL,
  unit_id: FILIAL,
  start_date: '2026-11-11T10:00:00.000Z',
  end_date: null
}) as unknown as InventoryCampaign;

const renderManager = (initialAction: 'CREATE' | 'OPEN') => (
  <CampaignManager
    user={user}
    onBack={vi.fn()}
    onActivate={vi.fn()}
    campaigns={[]}
    initialUnit={FILIAL}
    initialAction={initialAction}
    tenantid="CICOPAL"
  />
);

describe('CampaignManager — intenção do botão CAMPANHA', () => {
  beforeEach(() => {
    cleanup();
    fetchCampaignsMock.mockReset();
  });

  afterEach(() => cleanup());

  it('OPEN com campanha ativa abre direto a ficha da campanha', async () => {
    fetchCampaignsMock.mockResolvedValue([activeCampaign()]);
    render(renderManager('OPEN'));

    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();
    // Ficha da campanha (não a lista, nem o cadastro).
    expect(await screen.findByText('Excluir Campanha')).toBeTruthy();
    expect(screen.queryByText('Nova Campanha')).toBeNull();
    expect(screen.queryByText('Iniciar Nova Auditoria')).toBeNull();
  });

  it('CREATE abre a tela já no cadastro de campanha', async () => {
    fetchCampaignsMock.mockResolvedValue([activeCampaign()]);
    render(renderManager('CREATE'));

    expect(await screen.findByText('Nova Campanha')).toBeTruthy();
    expect(screen.getByText('Nome da Campanha')).toBeTruthy();
    expect(screen.queryByText('Excluir Campanha')).toBeNull();
  });

  it('OPEN sem campanha nesta filial cai no cadastro', async () => {
    fetchCampaignsMock.mockResolvedValue([]);
    render(renderManager('OPEN'));

    expect(await screen.findByText('Nova Campanha')).toBeTruthy();
  });
});
