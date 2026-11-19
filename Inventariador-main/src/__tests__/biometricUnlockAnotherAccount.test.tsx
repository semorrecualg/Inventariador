// @vitest-environment jsdom
// ============================================================================
// biometricUnlockAnotherAccount.test.tsx — aparelho partilhado.
//
// «Entrar com outra conta» tem de fazer DUAS coisas, e é isso que este teste
// fixa no componente real (`Login`):
//   1. esquecer o último utilizador do aparelho (`gbr_last_login_user`);
//   2. abrir o formulário VAZIO — sem o utilizador anterior pré-preenchido — para
//      o segundo utilizador não herdar a biometria de quem entrou antes.
// A credencial registada do anterior não é apagada: só o «último utilizador».
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import Login from '../components/Login';
import { DatabaseMode, UserRole, type User } from '../types';

const mocks = vi.hoisted(() => ({
  authenticateBiometric: vi.fn(),
  checkNativeBiometry: vi.fn(),
  hasBiometricRegistered: vi.fn(),
  isBiometricSupported: vi.fn(),
  logAuditEvent: vi.fn()
}));

// Casco nativo com biometria e credencial — é o cenário em que a tela abre.
vi.mock('../services/biometricService', () => ({
  authenticateBiometric: mocks.authenticateBiometric,
  checkNativeBiometry: mocks.checkNativeBiometry,
  hasBiometricRegistered: mocks.hasBiometricRegistered,
  isBiometricSupported: mocks.isBiometricSupported,
  isNativeAppShell: () => true
}));

// Login fala com a nuvem/Dexie só nos caminhos de senha: aqui nada disso corre.
vi.mock('../services/supabaseService', () => ({
  supabase: null,
  ensureUserProfile: vi.fn(),
  logAuditEvent: mocks.logAuditEvent,
  getEmailByUsername: vi.fn(),
  isInternalMode: true
}));

vi.mock('../hooks/useLocalAuth', () => ({
  useLocalAuth: () => ({ authenticate: vi.fn() })
}));

vi.mock('../services/localDbService', () => ({
  localDb: {
    users: { toArray: vi.fn(async () => []), get: vi.fn(async () => null) },
    unitConfigs: { clear: vi.fn() },
    auditLogs: { clear: vi.fn() }
  }
}));

vi.mock('../services/demoService', () => ({
  demoService: { initDemoSession: vi.fn(async () => true), getDemoUser: vi.fn() }
}));

const USERS = [
  {
    username: 'auditor',
    name: 'Auditor de Campo',
    email: 'auditor@gbr.com.br',
    role: UserRole.AUDITOR,
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO'
  }
] as unknown as User[];

const renderLogin = async () => {
  await act(async () => {
    render(
      <Login
        onLogin={vi.fn()}
        users={USERS}
        databaseMode={DatabaseMode.INTERNAL}
        onOpenPrivacyCenter={vi.fn()}
        onUpdateScreen={vi.fn()}
        onShowModal={vi.fn()}
      />
    );
  });
};

describe('desbloqueio biométrico — «Entrar com outra conta»', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.authenticateBiometric.mockReset().mockResolvedValue(false);
    mocks.checkNativeBiometry.mockReset().mockResolvedValue({ status: 'available' });
    mocks.hasBiometricRegistered.mockReset().mockResolvedValue(true);
    mocks.isBiometricSupported.mockReset().mockResolvedValue(true);
    mocks.logAuditEvent.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('esquece o último utilizador e abre o formulário vazio', async () => {
    localStorage.setItem('gbr_last_login_user', 'auditor');
    await renderLogin();

    // Ponto de partida: o aparelho está a desbloquear o último utilizador.
    await waitFor(() => expect(screen.getByTestId('biometric-unlock')).toBeTruthy());
    expect(screen.getByTestId('biometric-unlock-user').textContent).toBe('auditor');

    fireEvent.click(screen.getByTestId('biometric-unlock-other-account'));

    // 1. O aparelho deixa de lembrar quem entrou antes.
    await waitFor(() => expect(localStorage.getItem('gbr_last_login_user')).toBeNull());
    // 2. A tela de desbloqueio sai e o formulário abre sem herdar nada.
    await waitFor(() => expect(screen.queryByTestId('biometric-unlock')).toBeNull());

    const userInput = screen.getByPlaceholderText(/digite seu usuário ou e-mail/i) as HTMLInputElement;
    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(userInput.value).toBe('');
    expect(passwordInput.value).toBe('');
    // A credencial registada do anterior não é apagada — só o último utilizador.
    expect(mocks.authenticateBiometric).toHaveBeenCalledTimes(1);
  });

  it('o próximo arranque já não abre no desbloqueio biométrico', async () => {
    localStorage.setItem('gbr_last_login_user', 'auditor');
    await renderLogin();

    await waitFor(() => expect(screen.getByTestId('biometric-unlock')).toBeTruthy());
    fireEvent.click(screen.getByTestId('biometric-unlock-other-account'));
    await waitFor(() => expect(localStorage.getItem('gbr_last_login_user')).toBeNull());

    cleanup();
    // Simula o arranque seguinte: sem último utilizador não há tela de desbloqueio.
    await renderLogin();
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/digite seu usuário ou e-mail/i)).toBeTruthy()
    );
    expect(screen.queryByTestId('biometric-unlock')).toBeNull();
  });
});
