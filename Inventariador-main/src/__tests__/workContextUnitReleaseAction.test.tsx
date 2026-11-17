// @vitest-environment jsdom
// ============================================================================
// workContextUnitReleaseAction.test.tsx — liberação da unidade no CARTÃO.
//
// Regra do produto: a âncora GPS e a campanha que liberam o inventário são
// configuradas no PRÓPRIO cartão da filial, por dois botões de estado
// (vermelho = pendente, verde = OK). Para ADMIN/MASTER, o toque numa unidade
// "AGUARDANDO LIBERAÇÃO" abre direto o que falta — a âncora se ela ainda não
// existe; com a âncora fixada, a campanha. O formulário intermediário da
// UNIDADE OPERACIONAL deixa de ser etapa. Unidade liberada (e auditor) mantém
// o cartão como ESCOLHA: filial → módulo → "Acessar o Módulo".
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import WorkContextSelector from '../components/WorkContextSelector';
import { AppModule, AppScreen, UserRole } from '../types';
import type { User } from '../types';
import { buildUnitReleaseMap } from '../utils/unitRelease';
import { listContracts } from '../utils/tenantCatalog';

// A tela lê o catálogo da base local no mount; por padrão vazio.
vi.mock('../utils/tenantCatalog', () => ({
  listContracts: vi.fn().mockResolvedValue([])
}));

const FILIAL = '010101 CICOPAL GO';
const TENANT = 'CICOPAL';

const buildUser = (role: UserRole): User =>
  ({
    tenantid: TENANT,
    email: `${String(role).toLowerCase()}@example.com`,
    username: String(role).toLowerCase(),
    name: role,
    role,
    filial: FILIAL,
    units: [FILIAL]
  }) as unknown as User;

// Mapa de liberação real (âncora e campanha ausentes) — a unidade aparece
// "AGUARDANDO LIBERAÇÃO · FALTA ÂNCORA GPS E CAMPANHA", o cenário das figuras.
const releaseMap = buildUnitReleaseMap([
  { name: FILIAL, tenantid: TENANT, hasAnchor: false, hasCampaign: false }
]);

// Âncora já fixada, campanha ainda pendente: o toque no cartão vai à campanha.
const anchorOnlyMap = buildUnitReleaseMap([
  { name: FILIAL, tenantid: TENANT, hasAnchor: true, hasCampaign: false }
]);

// Campanha já aberta, âncora pendente: o toque no cartão vai à âncora.
const campaignOnlyMap = buildUnitReleaseMap([
  { name: FILIAL, tenantid: TENANT, hasAnchor: false, hasCampaign: true }
]);

// Unidade LIBERADA: âncora GPS e campanha configuradas.
const releasedMap = buildUnitReleaseMap([
  { name: FILIAL, tenantid: TENANT, hasAnchor: true, hasCampaign: true }
]);

const renderSelector = (role: UserRole, map = releaseMap) => {
  const onOpenAdmin = vi.fn();
  const onSelect = vi.fn();
  render(
    React.createElement(WorkContextSelector, {
      user: buildUser(role),
      contexts: [{ tenantid: TENANT, filial: FILIAL }],
      unitRelease: map,
      onSelect,
      onLogout: vi.fn(),
      onOpenAdmin
    })
  );
  return { onOpenAdmin, onSelect };
};

/** Card da filial (o botão que envolve o nome da unidade na lista). */
const unitCard = () => screen.getByText(FILIAL).closest('button') as HTMLButtonElement;

/** Botão de acesso ao módulo (barra inferior). */
const accessButton = () => screen.getByText('Acessar o Módulo').closest('button') as HTMLButtonElement;

const chooseModule = (label: 'INVENTARIADOR' | 'CONTROLE DE ATIVO') =>
  fireEvent.click(screen.getByText(label).closest('button') as HTMLButtonElement);

const anchorAction = () => screen.getByTestId(`unit-anchor-action-${FILIAL}`);
const campaignAction = () => screen.getByTestId(`unit-campaign-action-${FILIAL}`);

describe('CONTRATO DE TRABALHO · liberação da unidade no cartão', () => {
  afterEach(() => cleanup());

  // ── Admin/master: o cartão abre direto o que falta ────────────────────────
  it('admin: unidade sem âncora — o toque no cartão abre a ÂNCORA GPS da filial', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN);

    fireEvent.click(unitCard());

    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.UNIT_CONFIGURATOR, { unitName: FILIAL });
    // A filial fica escolhida para o retorno à trilha filial → módulo → ACESSAR.
    expect(unitCard().getAttribute('aria-pressed')).toBe('true');
  });

  it('admin: âncora já definida — o toque no cartão abre a CAMPANHA', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN, anchorOnlyMap);

    fireEvent.click(unitCard());

    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    // Campanha pendente: a tela abre já no cadastro daquela filial.
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.CAMPAIGN_MANAGEMENT, {
      unitName: FILIAL,
      campaignAction: 'CREATE'
    });
  });

  it('admin: campanha já definida — o toque no cartão abre a ÂNCORA (vice-versa)', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN, campaignOnlyMap);

    fireEvent.click(unitCard());

    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.UNIT_CONFIGURATOR, { unitName: FILIAL });
  });

  it('admin: unidade liberada — o toque no cartão só escolhe a filial', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN, releasedMap);

    fireEvent.click(unitCard());

    expect(onOpenAdmin).not.toHaveBeenCalled();
    expect(unitCard().getAttribute('aria-pressed')).toBe('true');
  });

  // ── Admin/master: os dois botões de estado ────────────────────────────────
  it('admin: o botão da âncora abre a configuração GPS daquela filial', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN);

    fireEvent.click(anchorAction());

    // Uma única navegação: o clique do botão não dispara o toque do cartão.
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.UNIT_CONFIGURATOR, { unitName: FILIAL });
  });

  it('admin: o botão da campanha vermelho abre o cadastro daquela filial', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN);

    fireEvent.click(campaignAction());

    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.CAMPAIGN_MANAGEMENT, {
      unitName: FILIAL,
      campaignAction: 'CREATE'
    });
  });

  it('admin: o botão da campanha verde abre direto a campanha ativa daquela filial', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN, campaignOnlyMap);

    expect(campaignAction().getAttribute('data-state')).toBe('ok');
    fireEvent.click(campaignAction());

    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.CAMPAIGN_MANAGEMENT, {
      unitName: FILIAL,
      campaignAction: 'OPEN'
    });
  });

  it('admin: botões vermelhos com a unidade pendente', () => {
    renderSelector(UserRole.ADMIN);

    for (const action of [anchorAction(), campaignAction()]) {
      expect(action.getAttribute('data-state')).toBe('pending');
      expect(action.className).toContain('bg-red-50');
      expect(action.className).not.toContain('bg-emerald-50');
    }
    expect(anchorAction().getAttribute('title')).toContain('pendente');
    expect(campaignAction().getAttribute('title')).toContain('pendente');
  });

  it('admin: botões verdes quando âncora e campanha estão OK', () => {
    renderSelector(UserRole.ADMIN, releasedMap);

    for (const action of [anchorAction(), campaignAction()]) {
      expect(action.getAttribute('data-state')).toBe('ok');
      expect(action.className).toContain('bg-emerald-50');
      expect(action.className).not.toContain('bg-red-50');
    }
    expect(anchorAction().getAttribute('title')).toContain('OK');
    expect(campaignAction().getAttribute('title')).toContain('OK');
  });

  it('admin: cada botão mostra o seu próprio estado (âncora OK, campanha pendente)', () => {
    renderSelector(UserRole.ADMIN, anchorOnlyMap);

    expect(anchorAction().getAttribute('data-state')).toBe('ok');
    expect(campaignAction().getAttribute('data-state')).toBe('pending');
  });

  it('auditor: clicar no card NÃO abre configuração (só escolhe a filial)', () => {
    const { onOpenAdmin } = renderSelector(UserRole.AUDITOR);

    fireEvent.click(unitCard());

    expect(onOpenAdmin).not.toHaveBeenCalled();
    expect(screen.getByText(FILIAL)).toBeTruthy();
  });

  it('auditor: não recebe os botões de liberação — só a trava', () => {
    renderSelector(UserRole.AUDITOR);

    expect(screen.queryByTestId(`unit-anchor-action-${FILIAL}`)).toBeNull();
    expect(screen.queryByTestId(`unit-campaign-action-${FILIAL}`)).toBeNull();
    expect(
      screen.getByTitle('O administrador define âncora e campanha nesta unidade')
    ).toBeTruthy();
  });

  // ── Trava do módulo INVENTARIADOR: vale para o ADMIN também ────────────────
  // Bug real (figuras): unidade "AGUARDANDO LIBERAÇÃO · FALTA ÂNCORA GPS E
  // CAMPANHA" escolhida, módulo INVENTARIADOR selecionado, clique em ACESSAR →
  // abria a Auditoria Inteligente. O admin tinha passe livre na trava.
  it('admin: unidade aguardando liberação NÃO acessa o módulo INVENTARIADOR', () => {
    const { onSelect } = renderSelector(UserRole.ADMIN);

    chooseModule('INVENTARIADOR');

    expect(accessButton().disabled).toBe(true);
    fireEvent.click(accessButton());
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByText(/Toque na filial para abrir a configuração/i)).toBeTruthy();
  });

  it('admin: unidade liberada acessa o módulo INVENTARIADOR', () => {
    const { onSelect } = renderSelector(UserRole.ADMIN, releasedMap);

    chooseModule('INVENTARIADOR');
    expect(accessButton().disabled).toBe(false);

    fireEvent.click(accessButton());
    expect(onSelect).toHaveBeenCalledWith(
      { tenantid: TENANT, filial: FILIAL },
      AppModule.INVENTORY
    );
  });

  it('admin: unidade aguardando liberação ainda acessa CONTROLE DE ATIVO (não é inventário de campo)', () => {
    const { onSelect } = renderSelector(UserRole.ADMIN);

    chooseModule('CONTROLE DE ATIVO');
    expect(accessButton().disabled).toBe(false);

    fireEvent.click(accessButton());
    expect(onSelect).toHaveBeenCalledWith(
      { tenantid: TENANT, filial: FILIAL },
      AppModule.ASSET_CONTROL
    );
  });

  it('auditor: unidade aguardando liberação continua travada no INVENTARIADOR', () => {
    const { onSelect } = renderSelector(UserRole.AUDITOR);

    chooseModule('INVENTARIADOR');

    expect(accessButton().disabled).toBe(true);
    fireEvent.click(accessButton());
    expect(onSelect).not.toHaveBeenCalled();
  });

  // ── Lista de filiais ──────────────────────────────────────────────────────
  it('admin: enxerga também as filiais reais do contrato na base local', async () => {
    vi.mocked(listContracts).mockResolvedValueOnce([
      { tenantid: TENANT, filiais: [FILIAL, '010105 CICOPAL PA', '010201 SNACKS PA'] }
    ]);
    const onOpenAdmin = vi.fn();
    render(
      React.createElement(WorkContextSelector, {
        user: buildUser(UserRole.ADMIN),
        contexts: [{ tenantid: TENANT, filial: FILIAL }],
        unitRelease: releaseMap,
        onSelect: vi.fn(),
        onLogout: vi.fn(),
        onOpenAdmin
      })
    );

    // A filial do perfil continua; as demais filiais da base entram para o dono
    // do contrato (é nelas que ele configura âncora e campanha).
    expect(await screen.findByText('010105 CICOPAL PA')).toBeTruthy();
    expect(screen.getByText('010201 SNACKS PA')).toBeTruthy();
    expect(screen.getByText('3 opções')).toBeTruthy();
  });

  it('auditor: a base NÃO amplia a lista — continua restrito ao perfil', async () => {
    vi.mocked(listContracts).mockResolvedValueOnce([
      { tenantid: TENANT, filiais: [FILIAL, '010105 CICOPAL PA'] }
    ]);
    render(
      React.createElement(WorkContextSelector, {
        user: buildUser(UserRole.AUDITOR),
        contexts: [{ tenantid: TENANT, filial: FILIAL }],
        unitRelease: releaseMap,
        onSelect: vi.fn(),
        onLogout: vi.fn(),
        onOpenAdmin: vi.fn()
      })
    );

    // O catálogo carrega no mount; a filial extra nunca aparece para o auditor.
    await screen.findByText('CONTRATO (TENANTID)');
    expect(screen.queryByText('010105 CICOPAL PA')).toBeNull();
  });
});
