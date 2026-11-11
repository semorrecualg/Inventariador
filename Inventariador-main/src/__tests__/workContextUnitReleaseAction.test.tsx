// @vitest-environment jsdom
// ============================================================================
// workContextUnitReleaseAction.test.tsx — configuração da UNIDADE OPERACIONAL
// a partir do CONTRATO DE TRABALHO.
//
// Regra do produto: a configuração da unidade (âncora GPS + campanha por
// unidade) só tem entrada contextual. No contrato de trabalho, clicar no CARD
// da unidade — ou no badge "Âncora e Campanha" — abre a Unidade Operacional já
// com a filial em parâmetro. O auditor não configura: para ele o card continua
// sendo só a escolha de onde vai inventariar.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import WorkContextSelector from '../components/WorkContextSelector';
import { AppScreen, UserRole } from '../types';
import type { User } from '../types';
import { buildUnitReleaseMap } from '../utils/unitRelease';

// A tela lê o catálogo da base local no mount; aqui o catálogo é irrelevante.
vi.mock('../utils/tenantCatalog', () => ({
  listContracts: vi.fn().mockResolvedValue([])
}));

const FILIAL = '010101 CICOPAL GO';
const TENANT = 'CICOPAL';
const BADGE_TITLE = 'Âncora e campanha que liberam o inventário';

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
// "AGUARDANDO LIBERAÇÃO", que é o cenário das figuras.
const releaseMap = buildUnitReleaseMap([
  { name: FILIAL, tenantid: TENANT, hasAnchor: false, hasCampaign: false }
]);

const renderSelector = (role: UserRole) => {
  const onOpenAdmin = vi.fn();
  const onSelect = vi.fn();
  render(
    React.createElement(WorkContextSelector, {
      user: buildUser(role),
      contexts: [{ tenantid: TENANT, filial: FILIAL }],
      unitRelease: releaseMap,
      onSelect,
      onLogout: vi.fn(),
      onOpenAdmin
    })
  );
  return { onOpenAdmin, onSelect };
};

/** Card da filial (o botão que envolve o nome da unidade na lista). */
const unitCard = () => screen.getByText(FILIAL).closest('button') as HTMLButtonElement;

describe('CONTRATO DE TRABALHO · configuração da unidade', () => {
  afterEach(() => cleanup());

  it('admin: clicar no CARD da unidade abre a configuração com a filial em parâmetro', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN);

    fireEvent.click(unitCard());

    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.UNIT_SELECTION, { unitName: FILIAL });
  });

  it('admin: o badge de âncora e campanha também abre (com o mesmo destino)', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN);
    const badge = screen.getByTestId(`unit-release-action-${FILIAL}`);

    fireEvent.click(badge);

    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.UNIT_SELECTION);
  });

  it('admin: o badge se identifica como a entrada de âncora e campanha', () => {
    renderSelector(UserRole.ADMIN);

    expect(screen.getByTestId(`unit-release-action-${FILIAL}`).getAttribute('title')).toBe(BADGE_TITLE);
  });

  it('o clique no badge não borbulha para o card da unidade', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN);

    fireEvent.click(screen.getByTestId(`unit-release-action-${FILIAL}`));

    // Uma única navegação: o handler do badge corta a propagação, então o card
    // não dispara uma segunda abertura.
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
  });

  it('auditor: clicar no card NÃO abre configuração (só escolhe a filial)', () => {
    const { onOpenAdmin } = renderSelector(UserRole.AUDITOR);

    fireEvent.click(unitCard());

    expect(onOpenAdmin).not.toHaveBeenCalled();
    expect(screen.getByText(FILIAL)).toBeTruthy();
  });

  it('auditor: não recebe o badge acionável — só a trava', () => {
    renderSelector(UserRole.AUDITOR);

    expect(screen.queryByTestId(`unit-release-action-${FILIAL}`)).toBeNull();
    expect(
      screen.getByTitle('O administrador define âncora e campanha na Unidade Operacional')
    ).toBeTruthy();
  });
});
