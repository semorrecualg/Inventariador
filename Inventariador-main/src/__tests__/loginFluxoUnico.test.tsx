// @vitest-environment jsdom
// ============================================================================
// loginFluxoUnico.test.tsx — FLUXO ÚNICO DE ACESSO.
//
// A tela de login apenas AUTENTICA: ela não pede mais contrato/filial. Contrato,
// filial (unidade operacional) e módulo são escolhidos na tela de contrato de
// trabalho (/contexto), com a lista de filiais aberta entre as autorizadas.
//
// Cobre:
//  1. Auditor com contrato → onLogin direto, sem etapa de filial, com a filial
//     do perfil preservada.
//  2. Auditor liberado em VÁRIAS filiais → todas as unidades chegam ao app
//     (a escolha de uma não pode apagar as demais).
//  3. Dono global sem tenantid → onLogin direto (contrato vem do pós-login).
//  4. Credencial local do app (ACESSOS) → entra e marca a sessão como gerida
//     pelo app, para a checagem da nuvem não destruí-la.
// ============================================================================
import 'fake-indexeddb/auto'; // ANTES de qualquer módulo que crie Dexie/localforage
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { DatabaseMode } from '../types';
import type { User } from '../types';

// ADMIN_EMAIL (utils/authUtils) é capturado na avaliação do módulo a partir de
// import.meta.env.VITE_ADMIN_EMAIL. O stub roda ANTES do import dinâmico do
// Login (que puxa authUtils).
vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@example.com');

const ADMIN_EMAIL = 'admin@example.com';

const { supabaseMock, ensureUserProfileMock, logAuditEventMock, getEmailByUsernameMock, resetPasswordMock } = vi.hoisted(
  () => ({
    supabaseMock: {
      auth: {
        signInWithPassword: vi.fn(),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    ensureUserProfileMock: vi.fn(),
    logAuditEventMock: vi.fn().mockResolvedValue(undefined),
    getEmailByUsernameMock: vi.fn().mockResolvedValue(null),
    resetPasswordMock: vi.fn().mockResolvedValue(undefined),
  })
);

vi.mock('../services/supabaseService', () => ({
  supabase: supabaseMock,
  ensureUserProfile: ensureUserProfileMock,
  logAuditEvent: logAuditEventMock,
  getEmailByUsername: getEmailByUsernameMock,
  resetPassword: resetPasswordMock,
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

const renderLoginWithModal = (onShowModal: (config: Record<string, unknown>) => void) => {
  render(
    React.createElement(LoginComponent as React.ComponentType<LoginPropsShape>, {
      users: [],
      databaseMode: DatabaseMode.SUPABASE,
      onLogin,
      onOpenPrivacyCenter: vi.fn(),
      onUpdateScreen: vi.fn(),
      onShowModal,
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
  try {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  } catch {
    // navigator.onLine não é configurável neste ambiente — segue o default.
  }
  logAuditEventMock.mockResolvedValue(undefined);
  getEmailByUsernameMock.mockResolvedValue(null);
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

describe('Login — fluxo único (autentica e entra; filial é escolhida em /contexto)', () => {
  it('auditor com contrato entra direto, sem etapa de filial, mantendo a filial do perfil', async () => {
    ensureUserProfileMock.mockResolvedValue(auditorProfile());
    signInAs('auditor@example.com');

    renderLogin();
    await submitCredentials('auditor@example.com');

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.email).toBe('auditor@example.com');
    expect(loggedUser.tenantid).toBe('CICOPAL');
    expect(loggedUser.filial).toBe('FILIAL A');
    expect(loggedUser.units).toEqual(['FILIAL A']);

    // A tela de login não exibe mais contrato/filial
    expect(screen.queryByText('Etapa 2 de 2')).toBeNull();
    expect(screen.queryByTestId('branch-list')).toBeNull();
  });

  it('auditor liberado em várias filiais chega ao app com TODAS as unidades', async () => {
    ensureUserProfileMock.mockResolvedValue(auditorProfile(['FILIAL A', 'FILIAL B']));
    signInAs('auditor@example.com');

    renderLogin();
    await submitCredentials('auditor@example.com');

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    const loggedUser = onLogin.mock.calls[0][0] as User;
    // A escolha da filial ativa acontece em /contexto; a autorização (units)
    // não pode ser reduzida pelo login.
    expect(loggedUser.units).toEqual(['FILIAL A', 'FILIAL B']);
  });

  it('dono global sem tenantid no perfil entra direto (contrato vem do pós-login)', async () => {
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
    expect(screen.queryByText('Etapa 2 de 2')).toBeNull();
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

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.filial).toBe('010102 CICOPAL SP');
    // Import dinâmico: authUtils é avaliado DEPOIS do stubEnv do topo do arquivo.
    const { isAppManagedSession } = await import('../utils/authUtils');
    expect(isAppManagedSession()).toBe(true);
  });

  it('dono global sem tenantid na credencial local entra pela barreira local (contrato vem do pós-login)', async () => {
    // Bug real: semorr@gmail.com (VITE_ADMIN_EMAIL) logava no mobile (perfil
    // local com contrato) e era BLOQUEADO no web pela Barreira Local, porque o
    // guard exigia tenantid até do dono global — que por desenho não tem
    // contrato no perfil. O caminho da nuvem sempre isentou o dono.
    ensureUserProfileMock.mockResolvedValue({ email: ADMIN_EMAIL, tenantid: '' });
    const owner = {
      username: 'admin',
      name: 'Dono Global',
      email: ADMIN_EMAIL,
      password: 'admin123',
      role: 'ADMIN',
      is_admin: true,
      isAdmin: true,
      tenantid: '',
    } as unknown as User;

    renderLogin([owner]);
    await submitCredentials(ADMIN_EMAIL, 'admin123');

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.email).toBe(ADMIN_EMAIL);
    expect(loggedUser.tenantid).toBe('');
    expect(screen.queryByText(/sem tenantid vinculado/i)).toBeNull();
  });

  it('perfil sem contrato é bloqueado e não deixa sessão guardada para o próximo arranque', async () => {
    const { PERSISTED_SESSION_KEY, writePersistedSession } = await import('../utils/sessionPersistence');
    writePersistedSession(
      { email: 'semcontrato@example.com', role: 'ADMIN', tenantid: '', filial: 'TODAS' } as unknown as User
    );
    expect(localStorage.getItem(PERSISTED_SESSION_KEY)).not.toBeNull();

    ensureUserProfileMock.mockResolvedValue({
      email: 'semcontrato@example.com',
      username: 'semcontrato',
      role: 'AUDITOR',
      is_admin: false,
      isAdmin: false,
      tenantid: '',
      filial: '',
      units: [],
    });
    signInAs('semcontrato@example.com');

    renderLogin();
    await submitCredentials('semcontrato@example.com');

    // O login sai pelo `supabase.auth.signOut()` do caminho de perfil inválido:
    // a cópia persistida tem de desaparecer para não reentrar sozinha.
    await waitFor(() => expect(localStorage.getItem(PERSISTED_SESSION_KEY)).toBeNull());
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('«Redefinir Acesso Local» apaga a cópia persistida e a sessão do separador', async () => {
    const { PERSISTED_SESSION_KEY, writePersistedSession } = await import('../utils/sessionPersistence');
    // Estado de quem está dentro e carrega em «Redefinir Acesso» para destravar.
    writePersistedSession({ email: ADMIN_EMAIL, role: 'ADMIN', tenantid: 'CICOPAL', filial: 'TODAS' } as unknown as User);
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: ADMIN_EMAIL }));
    localStorage.setItem('app_users', '[]');
    localStorage.setItem('app_database_mode', 'SUPABASE');
    expect(localStorage.getItem(PERSISTED_SESSION_KEY)).not.toBeNull();

    // `location.reload()` não é substituível em jsdom; o jsdom apenas avisa que
    // a navegação não está implementada, e a limpeza já correu antes disso.
    const onShowModal = vi.fn();
    renderLoginWithModal(onShowModal);
    fireEvent.click(screen.getByText('Redefinir Acesso'));

    expect(onShowModal).toHaveBeenCalledTimes(1);
    const config = onShowModal.mock.calls[0][0] as { onConfirm: () => Promise<void> };
    await act(async () => { await config.onConfirm(); });

    expect(supabaseMock.auth.signOut).toHaveBeenCalled();
    expect(localStorage.getItem(PERSISTED_SESSION_KEY)).toBeNull();
    expect(sessionStorage.length).toBe(0);
    // Base e ativos sobrevivem à redefinição.
    expect(localStorage.getItem('app_database_mode')).toBe('SUPABASE');
    expect(localStorage.getItem('app_users')).toBeNull();
  });

  it('dono global na base Dexie sem tenantid entra (nenhum contrato herdado de sessão antiga)', async () => {
    const { localDb } = await import('../services/localDbService');
    await localDb.users.clear();
    await localDb.users.add({
      username: 'admin',
      name: 'Dono Global',
      email: ADMIN_EMAIL,
      password: 'admin123',
      role: 'ADMIN',
      is_admin: true,
      isAdmin: true,
      tenantid: '',
      filial: '',
    } as unknown as User);

    renderLogin();
    await submitCredentials(ADMIN_EMAIL, 'admin123');

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    const loggedUser = onLogin.mock.calls[0][0] as User;
    expect(loggedUser.email).toBe(ADMIN_EMAIL);
    expect(loggedUser.tenantid).toBe('');
  });
});

describe('Login — "Esqueci a senha"', () => {
  it('pede a redefinição para o e-mail digitado e confirma o envio', async () => {
    const onShowModal = vi.fn();
    renderLoginWithModal(onShowModal);
    fireEvent.change(screen.getByPlaceholderText('Digite seu usuário ou e-mail'), {
      target: { value: 'Auditor@Example.com' },
    });

    fireEvent.click(screen.getByText('Esqueci a senha'));

    await waitFor(() => expect(resetPasswordMock).toHaveBeenCalledTimes(1));
    // normalizado em minúsculas, como o resto do login
    expect(resetPasswordMock).toHaveBeenCalledWith('auditor@example.com');
    await waitFor(() => expect(onShowModal).toHaveBeenCalledTimes(1));
    const modal = onShowModal.mock.calls[0][0] as { title: string; message: string };
    expect(modal.title).toMatch(/e-mail enviado/i);
    expect(modal.message).toContain('auditor@example.com');
  });

  it('não envia sem e-mail e diz o que falta', async () => {
    const onShowModal = vi.fn();
    renderLoginWithModal(onShowModal);
    fireEvent.change(screen.getByPlaceholderText('Digite seu usuário ou e-mail'), {
      target: { value: 'admin' },
    });

    fireEvent.click(screen.getByText('Esqueci a senha'));

    await waitFor(() => expect(screen.getByText(/Escreve o teu e-mail/i)).toBeTruthy());
    expect(resetPasswordMock).not.toHaveBeenCalled();
    expect(onShowModal).not.toHaveBeenCalled();
  });

  it('mostra a falha quando o pedido é recusado', async () => {
    resetPasswordMock.mockRejectedValueOnce(new Error('rate limit reached'));
    const onShowModal = vi.fn();
    renderLoginWithModal(onShowModal);
    fireEvent.change(screen.getByPlaceholderText('Digite seu usuário ou e-mail'), {
      target: { value: 'auditor@example.com' },
    });

    fireEvent.click(screen.getByText('Esqueci a senha'));

    await waitFor(() => expect(screen.getByText(/rate limit reached/i)).toBeTruthy());
    expect(onShowModal).not.toHaveBeenCalled();
  });
});
