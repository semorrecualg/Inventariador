// @vitest-environment jsdom
// ============================================================================
// workContextPreselection.test.tsx — Fase 1 do acesso padronizado no CONTRATO
// DE TRABALHO (`/contexto`).
//
// Regras do produto:
//   1. A última escolha NÃO salta mais o contrato: ela entra como PRÉ-SELEÇÃO
//      (contrato, filial e módulo já apontados) e a entrada continua a ser um
//      toque explícito em "Acessar o Módulo".
//   2. O módulo INVENTARIADOR trabalha sempre dentro de uma filial: contrato
//      sem filial na base mantém o ACESSAR desativado para o AUDITOR; quem
//      administra a base segue para a Unidade Operacional (é lá que a filial é
//      escolhida/cadastrada). O CONTROLE DE ATIVO, que não usa endereço de
//      campo, continua liberado.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import WorkContextSelector from '../components/WorkContextSelector';
import { AppModule, UserRole } from '../types';
import type { User } from '../types';
import type { WorkContextPreselection } from '../utils/workContextUtils';

// A tela lê o catálogo da base local no mount. Aqui ele nunca chega (promessa
// pendente): estes casos testam a pré-seleção e a trava do INVENTARIADOR, não a
// ampliação de filiais pelo catálogo.
vi.mock('../utils/tenantCatalog', () => ({
  listContracts: vi.fn(() => new Promise<never>(() => {}))
}));

const TENANT = 'CICOPAL';
/** Filial do perfil (padrão de abertura sem escolha guardada). */
const FILIAL_PROFILE = '010101 CICOPAL GO';
/** Filial da ÚLTIMA ESCOLHA (pré-seleção). */
const FILIAL_LAST = '010105 CICOPAL PA';

const buildUser = (role: UserRole, overrides: Partial<User> = {}): User =>
  ({
    tenantid: TENANT,
    email: `${String(role).toLowerCase()}@example.com`,
    username: String(role).toLowerCase(),
    name: role,
    role,
    filial: FILIAL_PROFILE,
    units: [FILIAL_PROFILE, FILIAL_LAST],
    ...overrides
  }) as unknown as User;

const renderSelector = (params: {
  role?: UserRole;
  user?: Partial<User>;
  contexts?: Array<{ tenantid: string; filial: string }>;
  initialSelection?: WorkContextPreselection | null;
  /** `unitsByContract` do App: catálogo vivo + lista da nuvem. */
  availableFiliais?: Record<string, string[]>;
}) => {
  const onSelect = vi.fn();
  const onLogout = vi.fn();
  render(
    React.createElement(WorkContextSelector, {
      user: buildUser(params.role ?? UserRole.ADMIN, params.user),
      contexts:
        params.contexts ??
        [
          { tenantid: TENANT, filial: FILIAL_PROFILE },
          { tenantid: TENANT, filial: FILIAL_LAST }
        ],
      onSelect,
      onLogout,
      initialSelection: params.initialSelection ?? null,
      availableFiliais: params.availableFiliais
    })
  );
  return { onSelect, onLogout };
};

/** Card da filial (o botão que envolve o nome da unidade). */
const filialCard = (filial: string) => screen.getByText(filial).closest('button') as HTMLButtonElement;
/** Botão de acesso ao módulo (barra inferior). */
const accessButton = () => screen.getByText('Acessar o Módulo').closest('button') as HTMLButtonElement;
const chooseModule = (label: 'INVENTARIADOR' | 'CONTROLE DE ATIVO') =>
  fireEvent.click(screen.getByText(label).closest('button') as HTMLButtonElement);

describe('CONTRATO DE TRABALHO · pré-seleção da última escolha (Fase 1)', () => {
  afterEach(() => cleanup());

  it('abre o contrato já apontado (filial e módulo) sem entrar sozinho', () => {
    const { onSelect } = renderSelector({
      initialSelection: { tenantid: TENANT, filial: FILIAL_LAST, module: AppModule.INVENTORY }
    });

    // O seletor NÃO foi saltado: a confirmação continua explícita.
    expect(screen.getByText('Contrato de Trabalho')).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();

    // Pré-seleção visível: a filial da última escolha aparece escolhida (e a do
    // perfil, que seria o padrão, não).
    expect(filialCard(FILIAL_LAST).getAttribute('aria-pressed')).toBe('true');
    expect(filialCard(FILIAL_PROFILE).getAttribute('aria-pressed')).toBe('false');

    // O contrato da pré-seleção é o que está no cartão do contexto.
    const contractCard = screen.getByText('CONTRATO (TENANTID)').parentElement;
    expect(contractCard?.textContent).toContain(TENANT);

    // ACESSAR já está habilitado sem nenhum toque: a pré-seleção trouxe também
    // o módulo (INVENTARIADOR) e a filial que ele exige.
    expect(accessButton().disabled).toBe(false);

    fireEvent.click(accessButton());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      { tenantid: TENANT, filial: FILIAL_LAST },
      AppModule.INVENTORY
    );
  });

  it('sem escolha guardada, abre na filial do perfil e exige o toque em ACESSAR', () => {
    const { onSelect } = renderSelector({});

    expect(filialCard(FILIAL_PROFILE).getAttribute('aria-pressed')).toBe('true');
    expect(filialCard(FILIAL_LAST).getAttribute('aria-pressed')).toBe('false');
    // Nenhum módulo pré-escolhido: o ACESSAR só habilita depois da escolha.
    expect(accessButton().disabled).toBe(true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('CONTRATO DE TRABALHO · INVENTARIADOR exige filial', () => {
  afterEach(() => cleanup());

  it('auditor · contrato sem filial: ACESSAR desativado, aviso visível e nada é selecionado', () => {
    const { onSelect } = renderSelector({
      role: UserRole.AUDITOR,
      user: { filial: '', units: [] },
      contexts: [{ tenantid: TENANT, filial: '' }]
    });

    chooseModule('INVENTARIADOR');

    expect(accessButton().disabled).toBe(true);
    fireEvent.click(accessButton());
    expect(onSelect).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Peça ao administrador para cadastrar a unidade/i)
    ).toBeTruthy();
  });

  it('admin · contrato sem filial: ACESSAR segue com o contrato escolhido', () => {
    const { onSelect } = renderSelector({
      user: { filial: '', units: [] },
      contexts: [{ tenantid: TENANT, filial: '' }]
    });

    chooseModule('INVENTARIADOR');

    // Sem filial nenhuma na lista não há escolha a fazer: o aviso manda
    // carregar a base na própria tela (a antiga Unidade Operacional foi
    // fundida no contrato).
    expect(accessButton().disabled).toBe(false);
    fireEvent.click(accessButton());
    expect(onSelect).toHaveBeenCalledWith({ tenantid: TENANT, filial: '' }, AppModule.INVENTORY);
    expect(
      screen.getByText(/Sem filial na base deste contrato/i)
    ).toBeTruthy();
  });

  it('contrato sem filial: o CONTROLE DE ATIVO continua liberado', () => {
    const { onSelect } = renderSelector({
      user: { filial: '', units: [] },
      contexts: [{ tenantid: TENANT, filial: '' }]
    });

    chooseModule('CONTROLE DE ATIVO');
    expect(accessButton().disabled).toBe(false);

    fireEvent.click(accessButton());
    expect(onSelect).toHaveBeenCalledWith(
      { tenantid: TENANT, filial: '' },
      AppModule.ASSET_CONTROL
    );
  });
});

describe('CONTRATO DE TRABALHO · as filiais do contrato vindas da nuvem', () => {
  afterEach(() => cleanup());

  // Nomes como `fetchUnitNamesFromCloud` os devolve: só a coluna `filial` do
  // contrato, já normalizada (UPPER/trim, sem sentinelas, ordenada).
  const FILIAIS_DA_NUVEM = [
    '010101 CICOPAL GO',
    '010105 CICOPAL PA',
    '010201 SNACKS PA',
    '010301 FEIRA BOA BA',
    '010401 CARPER BA'
  ];

  it('base local sem o contrato: o contrato lista as 5 filiais da nuvem e o INVENTARIADOR abre', () => {
    const { onSelect } = renderSelector({
      user: { filial: '', units: [] },
      contexts: [{ tenantid: TENANT, filial: '' }],
      availableFiliais: { [TENANT]: FILIAIS_DA_NUVEM }
    });

    // A lista não fica vazia a dizer «Nenhuma filial na base deste contrato»:
    // as filiais do contrato chegam pelo catálogo vivo (lista da nuvem).
    expect(screen.queryByText(/Nenhuma filial na base deste contrato/i)).toBeNull();
    expect(screen.getByTestId('filial-options').children).toHaveLength(5);
    FILIAIS_DA_NUVEM.forEach(filial => expect(screen.getByText(filial)).toBeTruthy());

    // A primeira da lista entra como filial escolhida e é ela que abre o
    // INVENTARIADOR.
    expect(filialCard(FILIAIS_DA_NUVEM[0]).getAttribute('aria-pressed')).toBe('true');
    chooseModule('INVENTARIADOR');
    expect(accessButton().disabled).toBe(false);
    fireEvent.click(accessButton());
    expect(onSelect).toHaveBeenCalledWith(
      { tenantid: TENANT, filial: FILIAIS_DA_NUVEM[0] },
      AppModule.INVENTORY
    );
  });
});
