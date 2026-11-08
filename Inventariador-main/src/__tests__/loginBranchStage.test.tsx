// @vitest-environment jsdom
// ============================================================================
// loginBranchStage.test.tsx — Transições de estado da ETAPA 2/2 (contrato +
// seleção de filial) do fluxo de login unificado em src/components/Login.tsx.
//
// Cobre os comportamentos:
//  1. Tenant resolvido (auditor) → pausa na etapa de filial (loginStage='branch')
//     SEM chamar onLogin; a filial autorizada vem pré-selecionada na lista.
//  2. Dono global (master) SEM tenantid no perfil → NÃO entra na etapa de filial
//     (o botão principal não pode virar no-op silencioso); segue direto p/ onLogin,
//     onde o contrato é escolhido no UNIT_SELECTION (fluxo antigo).
//  3. Master COM tenant e SEM units → exatamente UMA opção 'TODAS' (sem duplicata).
//  4. Confirmação da filial → baixa seletiva com o filtro [tenant, filial] e loga.
//  5. "Entrar sem sincronizar agora" → loga com a filial escolhida sem baixar base.
//  6. Multi-select: duas filiais marcadas → download com o filtro [tenant, [A, B]].
//  7. Paginação (Lazy Loading): a lista carrega a primeira página e, ao rolar até
//     o fim, carrega a próxima página de filiais do contrato.
// ============================================================================
import 'fake-indexeddb/auto'; // ANTES de qualquer módulo que crie Dexie/localforage
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { DatabaseMode } from '../types';
import type { User } from '../types';

// ADMIN_EMAIL (utils/authUtils) é capturado no momento da avaliação do módulo a
// partir de import.meta.env.VITE_ADMIN_EMAIL. O stub roda ANTES do import
// dinâmico do Login (que puxa authUtils), garantindo que isAdminEmail reconheça
// o perfil 'master' usado nos testes.
vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@example.com');

const ADMIN_EMAIL = 'admin@example.com';

// Mocks do módulo supabaseService — os únicos pontos externos controlados do fluxo.
const {
  supabaseMock,
  ensureUserProfileMock,
  downloadBaseToLocalMock,
  logAuditEventMock,
  getEmailByUsernameMock,
  fetchTenantFiliaisMock,
} = vi.hoisted(() => ({
  supabaseMock: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
  ensureUserProfileMock: vi.fn(),
  downloadBaseToLocalMock: vi.fn().mockResolvedValue(0),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  getEmailByUsernameMock: vi.fn().mockResolvedValue(null),
  fetchTenantFiliaisMock: vi.fn(),
}));

vi.mock('../services/supabaseService', () => ({
  supabase: supabaseMock,
  ensureUserProfile: ensureUserProfileMock,
  downloadBaseToLocal: downloadBaseToLocalMock,
  logAuditEvent: logAuditEventMock,
  getEmailByUsername: getEmailByUsernameMock,
  fetchTenantFiliais: fetchTenantFiliaisMock,
  isInternalMode: false,
}));

type LoginPropsShape = Record<string, unknown>;
let LoginComponent: React.ComponentType<LoginPropsShape> | null = null;
const onLogin = vi.fn();

const signInAs = (email: string) => {
  supabaseMock.auth.signInWithPassword.mockResolvedValue({
    data: { user: { id: 'auth-user-id', email, user_metadata: {} } },
    error: null,
  });
};

const auditorProfile = (units: string[] = ['FILIAL A']) => ({
  email: 'auditor@example.com',
  username: 'auditor',
  name: 'Auditor',
  role: 'AUDITOR',
  is_admin: false,
  isAdmin: false,
  tenantid: 'CICOPAL',
  filial: units[0] || '',
  units,
});

const renderLogin = (localUsers: User[] = []) => {
  render(
    React.createElement(LoginComponent as React.ComponentType<LoginPropsShape>, {
      users: localUsers,
      databaseMode: DatabaseMode.SUPABASE,
      onLogin,
      onOpenPrivacyCenter: vi.fn(),
      onUpdateScreen: vi.fn(),
      onShowModal: vi.fn(),
      isKeyboardVisible: false,
      onUpdateDatabaseMode: vi.fn(),
    })
  );
};

const submitCredentials = async (email: string, password = 'senha123') => {
  fireEvent.change(screen.getByPlaceholderText('Digite seu usuário ou e-mail'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByPlaceholderText('••••••••'), {
    target: { value: password },
  });
  fireEvent.submit(screen.getByText('Acessar Sistema').closest('form') as HTMLFormElement);
};

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  // jsdom já reporta onLine=true por padrão; o guard é apenas blindagem.
  try {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  } catch {
    // navigator.onLine não é configurável neste ambiente — segue o default.
  }
  downloadBaseToLocalMock.mockResolvedValue(0);
  logAuditEventMock.mockResolvedValue(undefined);
  getEmailByUsernameMock.mockResolvedValue(null);
  // Default do fetcher: devolve as units do perfil como filiais do contrato.
  fetchTenantFiliaisMock.mockImplementation(
    async (tenant: string, opts?: { profileUnits?: string[] }) =>
      (opts?.profileUnits || []).map((u) => ({
        filial: String(u).trim().toUpperCase(),
        tenantid: tenant,
        source: 'profile' as const,
      }))
  );
  // Import dinâmico: garante a ordem fake-indexeddb → stubEnv → avaliação do Login.
  if (!LoginComponent) {
    const mod = await import('../components/Login');
    LoginComponent = mod.default as unknown as React.ComponentType<LoginPropsShape>;
  }
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('Login — etapa 2/2 (seleção de filial) do fluxo unificado', () => {
  it('auditor com tenant resolvido pausa na etapa de filial sem chamar onLogin', async () => {
    ensureUserProfileMock.mockResolvedValue(auditorProfile());
    signInAs('auditor@example.com');

    renderLogin();
    await submitCredentials('auditor@example.com');

    expect(await screen.findByText('Etapa 2 de 2')).toBeTruthy();
    // O contrato (tenantid) aparece na tela de login
    expect(screen.getByText('CICOPAL')).toBeTruthy();
    // A filial autorizada aparece na lista e já vem pré-selecionada
    expect(screen.getByText('FILIAL A')).toBeTruthy();
    const submitBtn = screen.getByText('Sincronizar e Acessar').closest('button') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    // Ainda não logou — aguarda a escolha da filial
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('dono global sem tenantid no perfil pula a etapa de filial e loga direto', async () => {
    ensureUserProfileMock.mockResolvedValue({
      email: ADMIN_EMAIL,
      username: 'admin',
      name: 'Admin Global',
      role: 'ADMIN',
      is_admin: true,
      isAdmin: true,
      tenantid: '',
      filial: '',
      units: [],
    });
    signInAs(ADMIN_EMAIL);

    renderLogin();
    await submitCredentials(ADMIN_EMAIL);

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.email).toBe(ADMIN_EMAIL);
    expect(loggedUser.tenantid).toBe('');
    // A etapa de filial NÃO é renderizada — não há no-op silencioso no botão
    expect(screen.queryByText('Etapa 2 de 2')).toBeNull();
    expect(screen.queryByText('Sincronizar e Acessar')).toBeNull();
  });

  it('master com tenant resolvido e sem units mostra UMA única opção TODAS', async () => {
    ensureUserProfileMock.mockResolvedValue({
      email: ADMIN_EMAIL,
      username: 'admin',
      name: 'Admin',
      role: 'ADMIN',
      is_admin: true,
      isAdmin: true,
      tenantid: 'CICOPAL',
      filial: 'TODAS',
      units: undefined,
    });
    signInAs(ADMIN_EMAIL);

    renderLogin();
    await submitCredentials(ADMIN_EMAIL);

    expect(await screen.findByText('Etapa 2 de 2')).toBeTruthy();
    // Sem a duplicata — o escopo global é representado UMA única vez
    expect(screen.getAllByText('TODAS AS FILIAIS DO CONTRATO').length).toBe(1);
    const submitBtn = screen.getByText('Sincronizar e Acessar').closest('button') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });

  it('confirmação da filial baixa a base seletiva com filtro [tenant, filial] e loga', async () => {
    ensureUserProfileMock.mockResolvedValue(auditorProfile());
    signInAs('auditor@example.com');

    renderLogin();
    await submitCredentials('auditor@example.com');
    expect(await screen.findByText('Etapa 2 de 2')).toBeTruthy();

    fireEvent.click(screen.getByText('Sincronizar e Acessar'));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    // REGRA DE OURO escopada ao par [tenantid+filial]
    expect(downloadBaseToLocalMock).toHaveBeenCalledWith(
      'CICOPAL',
      ['FILIAL A'],
      expect.any(Function)
    );
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.filial).toBe('FILIAL A');
    expect(loggedUser.units).toEqual(['FILIAL A']);
    expect(logAuditEventMock).toHaveBeenCalled();
  });

  it('multi-select: duas filiais marcadas baixam o filtro [tenant, [A, B]]', async () => {
    ensureUserProfileMock.mockResolvedValue(auditorProfile(['FILIAL A', 'FILIAL B']));
    signInAs('auditor@example.com');

    renderLogin();
    await submitCredentials('auditor@example.com');
    expect(await screen.findByText('Etapa 2 de 2')).toBeTruthy();

    // Pré-selecionada: FILIAL A. Marca também a FILIAL B.
    fireEvent.click(screen.getByText('FILIAL B'));
    fireEvent.click(screen.getByText('Sincronizar e Acessar'));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(downloadBaseToLocalMock).toHaveBeenCalledWith(
      'CICOPAL',
      ['FILIAL A', 'FILIAL B'],
      expect.any(Function)
    );
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.units).toEqual(['FILIAL A', 'FILIAL B']);
  });

  it('"Entrar sem sincronizar agora" loga com a filial escolhida sem baixar base', async () => {
    ensureUserProfileMock.mockResolvedValue(auditorProfile());
    signInAs('auditor@example.com');

    renderLogin();
    await submitCredentials('auditor@example.com');
    expect(await screen.findByText('Etapa 2 de 2')).toBeTruthy();

    fireEvent.click(screen.getByText('Entrar sem sincronizar agora'));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.filial).toBe('FILIAL A');
    expect(loggedUser.units).toEqual(['FILIAL A']);
    expect(downloadBaseToLocalMock).not.toHaveBeenCalled();
  });

  it('auditor com credencial local do app entra e marca a sessão como gerida pelo app', async () => {
    // Reproduz o acesso criado em ACESSOS: perfil sem conta no Supabase Auth,
    // autenticado pela credencial do próprio app (barreira local).
    const localAuditor = {
      username: 'auditorlocal',
      name: 'Auditor Local',
      email: 'auditor.local@cicopal.com',
      password: 'teste123',
      role: 'AUDITOR',
      tenantid: 'CICOPAL',
      filial: '010102 CICOPAL SP',
      units: ['010102 CICOPAL SP'],
    } as unknown as User;

    renderLogin([localAuditor]);
    await submitCredentials('auditor.local@cicopal.com', 'teste123');

    expect(await screen.findByText('Etapa 2 de 2')).toBeTruthy();
    // Caminho local: rótulo específico do botão (sem sincronismo de nuvem)
    fireEvent.click(screen.getByText('Acessar com a filial selecionada'));

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.filial).toBe('010102 CICOPAL SP');
    // Import dinâmico: authUtils é avaliado DEPOIS do stubEnv do topo do arquivo
    // (import estático congelaria ADMIN_EMAIL vazio e quebraria os outros testes).
    const { isAppManagedSession } = await import('../utils/authUtils');
    // Marca que impede a checagem da nuvem de destruir esta sessão
    expect(isAppManagedSession()).toBe(true);
  });

  it('paginação (lazy loading): rolar até o fim carrega a próxima página de filiais', async () => {
    ensureUserProfileMock.mockResolvedValue(auditorProfile());
    // Contrato com 45 filiais no banco (nuvem)
    fetchTenantFiliaisMock.mockResolvedValue(
      Array.from({ length: 45 }, (_, i) => ({
        filial: `FILIAL-${String(i + 1).padStart(3, '0')}`,
        tenantid: 'CICOPAL',
        source: 'cloud' as const,
        assetCount: i + 1,
      }))
    );
    signInAs('auditor@example.com');

    renderLogin();
    await submitCredentials('auditor@example.com');
    expect(await screen.findByText('Etapa 2 de 2')).toBeTruthy();

    // Primeira página: 20 filiais visíveis (FILIAL-001..020)
    expect(await screen.findByText('FILIAL-001')).toBeTruthy();
    expect(screen.getByText('FILIAL-020')).toBeTruthy();
    expect(screen.queryByText('FILIAL-021')).toBeNull();

    // Rola até o fim da lista → carrega a página seguinte (FILIAL-021..040)
    const list = screen.getByTestId('branch-list') as HTMLDivElement;
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(list, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(list, 'scrollTop', { value: 1800, configurable: true });
    fireEvent.scroll(list);

    expect(await screen.findByText('FILIAL-040')).toBeTruthy();
    expect(screen.queryByText('FILIAL-041')).toBeNull();

    // Rola de novo → carrega o restante (FILIAL-041..045)
    fireEvent.scroll(list);
    expect(await screen.findByText('FILIAL-045')).toBeTruthy();
  });
});
