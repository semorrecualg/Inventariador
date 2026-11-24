// @vitest-environment jsdom
// ============================================================================
// recoveryPasswordScreen.test.tsx — o link do e-mail tem de levar a um sítio
// onde a senha nova é realmente gravada (antes, o link não tinha ecrã nenhum).
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { authMock } = vi.hoisted(() => ({
  authMock: {
    getSession: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
}));

vi.mock('../services/supabaseService', () => ({
  supabase: { auth: authMock },
}));

import RecoveryPassword from '../components/RecoveryPassword';

const onDone = vi.fn();
const onCancel = vi.fn();

const preencher = (senha: string, confirmacao: string) => {
  fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: senha } });
  fireEvent.change(screen.getByPlaceholderText('Repita a nova senha'), { target: { value: confirmacao } });
  fireEvent.submit(screen.getByText('Guardar Nova Senha').closest('form') as HTMLFormElement);
};

beforeEach(() => {
  vi.clearAllMocks();
  authMock.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  authMock.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  authMock.signOut.mockResolvedValue({ error: null });
});

afterEach(() => cleanup());

describe('RecoveryPassword', () => {
  it('grava a senha nova e encerra a sessão temporária do link', async () => {
    render(React.createElement(RecoveryPassword, { onDone, onCancel }));

    preencher('senha-nova-123', 'senha-nova-123');

    await waitFor(() => expect(authMock.updateUser).toHaveBeenCalledWith({ password: 'senha-nova-123' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(authMock.signOut).toHaveBeenCalledTimes(1);
  });

  it('recusa senhas que não coincidem sem chamar o servidor', async () => {
    render(React.createElement(RecoveryPassword, { onDone, onCancel }));

    preencher('senha-nova-123', 'senha-nova-124');

    await waitFor(() => expect(screen.getByText('As senhas não coincidem.')).toBeTruthy());
    expect(authMock.updateUser).not.toHaveBeenCalled();
  });

  it('exige mínimo de 8 caracteres', async () => {
    render(React.createElement(RecoveryPassword, { onDone, onCancel }));

    preencher('curta', 'curta');

    await waitFor(() => expect(screen.getByText(/pelo menos 8 caracteres/i)).toBeTruthy());
    expect(authMock.updateUser).not.toHaveBeenCalled();
  });

  it('link já usado/expirado é dito sem tentar gravar', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null } });
    render(React.createElement(RecoveryPassword, { onDone, onCancel }));

    preencher('senha-nova-123', 'senha-nova-123');

    await waitFor(() => expect(screen.getByText(/já não é válido/i)).toBeTruthy());
    expect(authMock.updateUser).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('mostra a falha real do Auth', async () => {
    authMock.updateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Password should be at least 6 characters' },
    });
    render(React.createElement(RecoveryPassword, { onDone, onCancel }));

    preencher('senha-nova-123', 'senha-nova-123');

    await waitFor(() => expect(screen.getByText(/Password should be at least 6 characters/i)).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
});
