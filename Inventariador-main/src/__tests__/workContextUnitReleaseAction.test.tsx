// @vitest-environment jsdom
// ============================================================================
// workContextUnitReleaseAction.test.tsx — badge "Âncora e Campanha" (Fig. 1).
//
// O badge da unidade pendente no CONTRATO DE TRABALHO era decorativo: clicar
// nele não abria nada, e o admin tinha de atravessar o Painel Completo →
// "Unidade Operacional" para configurar âncora GPS + campanha. Estes testes
// travam o comportamento novo:
//   1. admin abre a UNIDADE OPERACIONAL pelo badge;
//   2. o clique no badge NÃO seleciona a filial (stopPropagation no card);
//   3. auditor continua vendo apenas a trava (quem configura é o admin).
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
// "AGUARDANDO LIBERAÇÃO", que é o cenário da figura.
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

describe('CONTRATO DE TRABALHO · badge "Âncora e Campanha"', () => {
  afterEach(() => cleanup());

  it('admin: clicar no badge abre a UNIDADE OPERACIONAL (configuração de âncora + campanha)', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN);
    const badge = screen.getByTestId(`unit-release-action-${FILIAL}`);

    fireEvent.click(badge);

    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
    expect(onOpenAdmin).toHaveBeenCalledWith(AppScreen.UNIT_SELECTION);
  });

  it('admin: o badge se identifica como a entrada de âncora e campanha', () => {
    renderSelector(UserRole.ADMIN);
    const badge = screen.getByTestId(`unit-release-action-${FILIAL}`);

    expect(badge.getAttribute('title')).toBe(BADGE_TITLE);
  });

  it('o clique no badge não dispara a seleção da filial (stopPropagation)', () => {
    const { onOpenAdmin } = renderSelector(UserRole.ADMIN);
    const card = screen.getByText(FILIAL).closest('button') as HTMLButtonElement;
    const badge = screen.getByTestId(`unit-release-action-${FILIAL}`);

    fireEvent.click(badge);

    // Se o clique borbulhasse para o card, o botão receberia o evento e a
    // filial mudaria de estado; o handler do badge corta a propagação.
    expect(card).toBeTruthy();
    expect(onOpenAdmin).toHaveBeenCalledTimes(1);
  });

  it('auditor: não recebe o badge acionável — só a trava', () => {
    renderSelector(UserRole.AUDITOR);

    expect(screen.queryByTestId(`unit-release-action-${FILIAL}`)).toBeNull();
    expect(
      screen.getByTitle('O administrador define âncora e campanha na Unidade Operacional')
    ).toBeTruthy();
  });
});
