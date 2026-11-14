// @vitest-environment jsdom
// ============================================================================
// campaignDelete.test.tsx — "cliquei em CONFIRMAR EXCLUSÃO e nada aconteceu".
//
// A exclusão apagava a campanha do Dexie, mas o componente reaplicava a lista
// que vem do App (`campaigns` prop), ainda com a campanha dentro, sempre que
// `isSaving`/`isRefreshing` mudava. A campanha reaparecia no ecrã e a sensação
// era de botão morto. Estes testes fixam o comportamento: a linha sai da lista,
// não volta com o prop antigo e a nuvem é chamada para apagar também.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { deleteCampaignMock, localDeleteMock, removeCampaignFromAssetsMock, fetchCampaignsMock, getContextValueMock, setContextValueMock, adminFlag, manageCampaignsFlag } = vi.hoisted(() => ({
  deleteCampaignMock: vi.fn().mockResolvedValue(true),
  localDeleteMock: vi.fn().mockResolvedValue(undefined),
  removeCampaignFromAssetsMock: vi.fn().mockResolvedValue(undefined),
  fetchCampaignsMock: vi.fn(),
  getContextValueMock: vi.fn(),
  setContextValueMock: vi.fn().mockResolvedValue(undefined),
  // Controlam o gate de exclusão: isAdminUser (RBAC) e manage_campaigns.
  adminFlag: { value: true },
  manageCampaignsFlag: { value: true }
}));

vi.mock('motion/react', async () => {
  const ReactMod = await import('react');
  const MOTION_ONLY = new Set(['initial', 'animate', 'exit', 'transition', 'whileTap', 'whileHover', 'layout', 'layoutId', 'variants']);
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

vi.mock('../utils/authUtils', () => ({
  isAdminUser: () => adminFlag.value,
  userHasPermission: () => manageCampaignsFlag.value
}));

// O gate de exclusão vive no RBAC (mesmo módulo que o ecrã usa em App.tsx).
vi.mock('../services/rbacService', () => ({
  isAdminUser: () => adminFlag.value,
  userHasPermission: (...args: [unknown, string]) =>
    args[1] === 'manage_campaigns' ? manageCampaignsFlag.value : false,
  isAuditorUser: () => false,
  hasPermission: () => false
}));

vi.mock('../services/sqliteService', () => ({
  db: {},
  sqliteService: {
    getIsInitialized: () => true,
    persist: vi.fn(),
    getContextValue: getContextValueMock,
    setContextValue: setContextValueMock
  }
}));

vi.mock('../services/localDbService', () => ({
  localDb: {
    campaigns: { delete: localDeleteMock, toArray: vi.fn().mockResolvedValue([]) },
    assets: { removeCampaignFromAssets: removeCampaignFromAssetsMock }
  }
}));

vi.mock('../services/supabaseService', () => ({
  createCampaign: vi.fn(),
  updateCampaignStatus: vi.fn(),
  fetchCampaignStats: vi.fn().mockResolvedValue({ total: 0, inventoried: 0, divergences: 0 }),
  deleteCampaign: deleteCampaignMock,
  getCampaignSnapshot: vi.fn(),
  createCampaignSnapshot: vi.fn(),
  fetchCampaigns: fetchCampaignsMock,
  fetchAllCampaigns: vi.fn().mockResolvedValue([])
}));

import CampaignManager from '../components/CampaignManager';
import type { InventoryCampaign, User } from '../types';

const user = {
  id: 'u-1',
  name: 'Admin',
  email: 'admin@example.com',
  role: 'ADMIN',
  tenantid: 'CICOPAL'
} as unknown as User;

const campaign = (id: string, name: string): InventoryCampaign => ({
  id,
  name,
  description: '',
  status: 'ACTIVE',
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  unit_id: '010101 CICOPAL GO',
  start_date: '2026-11-11T10:00:00.000Z',
  end_date: null
}) as unknown as InventoryCampaign;

const campaigns = [campaign('camp-a', 'Inventário nov 2026'), campaign('camp-b', 'Nova campanha nov 2026')];

const renderManager = (list: InventoryCampaign[], onRefresh = vi.fn()) => (
  <CampaignManager
    user={user}
    onBack={vi.fn()}
    onActivate={vi.fn()}
    campaigns={list}
    onRefresh={onRefresh}
    initialUnit={null}
    tenantid="CICOPAL"
  />
);

describe('CampaignManager — exclusão de campanha', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    adminFlag.value = true;
    manageCampaignsFlag.value = true;
    deleteCampaignMock.mockClear();
    localDeleteMock.mockClear();
    removeCampaignFromAssetsMock.mockClear();
    getContextValueMock.mockReset();
    getContextValueMock.mockResolvedValue(null);
    setContextValueMock.mockClear();
    // A nuvem continua a devolver as duas (delete remoto pode ser recusado/atrasado):
    // a linha apagada não pode voltar para a lista por causa disso.
    fetchCampaignsMock.mockResolvedValue([...campaigns]);
  });

  afterEach(() => cleanup());

  it('remove a campanha da lista e não a deixa voltar com o prop antigo', async () => {
    const onRefresh = vi.fn();
    const view = render(renderManager(campaigns, onRefresh));

    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();
    expect(screen.getByText('Nova campanha nov 2026')).toBeTruthy();

    fireEvent.click(screen.getAllByText('Excluir')[0]);
    expect(await screen.findByText('ALERTA CRÍTICO')).toBeTruthy();

    fireEvent.click(screen.getByText('Confirmar Exclusão'));

    await waitFor(() => {
      expect(screen.queryByText('Inventário nov 2026')).toBeNull();
    });
    expect(screen.getByText('Nova campanha nov 2026')).toBeTruthy();

    expect(localDeleteMock).toHaveBeenCalledWith('camp-a');
    expect(deleteCampaignMock).toHaveBeenCalledWith('camp-a');
    expect(removeCampaignFromAssetsMock).toHaveBeenCalledWith('camp-a');
    // O App é avisado para esquecer a campanha no estado dele.
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());

    // Re-render com a lista antiga (é o que o App ainda tem antes do refresh):
    // a campanha excluída não pode reaparecer.
    view.rerender(renderManager(campaigns, onRefresh));
    await waitFor(() => {
      expect(screen.queryByText('Inventário nov 2026')).toBeNull();
    });
    expect(screen.getByText('Nova campanha nov 2026')).toBeTruthy();
  });

  it('mostra Excluir no cartão e na ficha com manage_campaigns, mesmo sem ser admin', async () => {
    adminFlag.value = false;
    manageCampaignsFlag.value = true;
    render(renderManager(campaigns));

    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Excluir')[0]);
    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(screen.queryByText('ALERTA CRÍTICO')).toBeNull());

    fireEvent.click(screen.getByText('Inventário nov 2026'));
    expect(await screen.findByText('Excluir Campanha')).toBeTruthy();
  });

  it('esconde Excluir do cartão e da ficha sem admin e sem manage_campaigns', async () => {
    adminFlag.value = false;
    manageCampaignsFlag.value = false;
    render(renderManager(campaigns));

    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();
    // Cartão: nenhum botão de exclusão, mas a campanha continua visível.
    expect(screen.queryByText('Excluir')).toBeNull();

    // Ficha: abre pelos dados do cartão e também não oferece exclusão.
    fireEvent.click(screen.getByText('Inventário nov 2026'));
    expect(await screen.findByText('Arquivar')).toBeTruthy();
    expect(screen.queryByText('Excluir Campanha')).toBeNull();
  });

  it('fecha o alerta no clique, sem esperar o refresh do App terminar', async () => {
    // Refresh do App pendente (banco grande/offline): antes o alerta só fechava
    // depois desta promessa, com a linha já apagada — parecia botão morto.
    let releaseRefresh: (() => void) | undefined;
    const onRefresh = vi.fn(() => new Promise<void>((resolve) => { releaseRefresh = resolve; }));
    render(renderManager(campaigns, onRefresh));

    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Excluir')[0]);
    expect(await screen.findByText('ALERTA CRÍTICO')).toBeTruthy();

    fireEvent.click(screen.getByText('Confirmar Exclusão'));

    await waitFor(() => expect(screen.queryByText('ALERTA CRÍTICO')).toBeNull());
    expect(onRefresh).toHaveBeenCalled();
    expect(screen.queryByText('Inventário nov 2026')).toBeNull();
    releaseRefresh?.();
  });

  it('não devolve a campanha excluída quando a releitura falha e o prop ainda está velho', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const view = render(renderManager(campaigns, onRefresh));
    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();

    fireEvent.click(screen.getAllByText('Excluir')[0]);
    fireEvent.click(await screen.findByText('Confirmar Exclusão'));
    await waitFor(() => expect(screen.queryByText('Inventário nov 2026')).toBeNull());

    // A releitura (merge local+nuvem) falha e o prop do App continua com a linha
    // apagada: o fallback não pode reabastecer a lista com ela.
    fetchCampaignsMock.mockReset();
    fetchCampaignsMock.mockRejectedValue(new Error('offline'));
    view.rerender(renderManager(campaigns, onRefresh));
    fireEvent.click(screen.getByTitle('Atualizar'));

    await waitFor(() => expect(screen.queryByText('Inventário nov 2026')).toBeNull());
    expect(screen.getByText('Nova campanha nov 2026')).toBeTruthy();
  });

  it('limpa cache por unidade, sessão e SYSTEM_CONTEXT da campanha excluída', async () => {
    localStorage.setItem('kardek_campanha_ativa_010101 CICOPAL GO', 'true');
    localStorage.setItem('app_current_campaign', 'camp-a');
    sessionStorage.setItem('activeCampaignId', 'camp-a');
    sessionStorage.setItem('activeCampaignStatus', 'ACTIVE');
    getContextValueMock.mockResolvedValue('camp-a');

    render(renderManager(campaigns));
    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();

    fireEvent.click(screen.getAllByText('Excluir')[0]);
    fireEvent.click(await screen.findByText('Confirmar Exclusão'));

    await waitFor(() => expect(localStorage.getItem('kardek_campanha_ativa_010101 CICOPAL GO')).toBeNull());
    expect(localStorage.getItem('app_current_campaign')).toBeNull();
    expect(sessionStorage.getItem('activeCampaignId')).toBeNull();
    expect(sessionStorage.getItem('activeCampaignStatus')).toBeNull();
    expect(setContextValueMock).toHaveBeenCalledWith('active_campaign', '');
  });

  it('segue para o refresh mesmo quando o desvínculo dos ativos falha', async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    removeCampaignFromAssetsMock.mockRejectedValueOnce(new Error('SchemaError: currentCampaignId'));
    render(renderManager(campaigns, onRefresh));

    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Excluir')[0]);
    fireEvent.click(await screen.findByText('Confirmar Exclusão'));

    await waitFor(() => expect(screen.queryByText('Inventário nov 2026')).toBeNull());
    expect(localDeleteMock).toHaveBeenCalledWith('camp-a');
    // O App tem de ser avisado mesmo com a limpeza de ativos a falhar.
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(screen.getByText('Nova campanha nov 2026')).toBeTruthy();
  });

  it('cancelar mantém a campanha na lista e não apaga nada', async () => {
    render(renderManager(campaigns));

    expect(await screen.findByText('Inventário nov 2026')).toBeTruthy();
    fireEvent.click(screen.getAllByText('Excluir')[0]);
    expect(await screen.findByText('ALERTA CRÍTICO')).toBeTruthy();

    fireEvent.click(screen.getByText('Cancelar'));

    await waitFor(() => expect(screen.queryByText('ALERTA CRÍTICO')).toBeNull());
    expect(screen.getByText('Inventário nov 2026')).toBeTruthy();
    expect(localDeleteMock).not.toHaveBeenCalled();
    expect(deleteCampaignMock).not.toHaveBeenCalled();
  });
});
