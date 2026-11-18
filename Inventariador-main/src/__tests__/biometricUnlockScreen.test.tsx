// @vitest-environment jsdom
// ============================================================================
// biometricUnlockScreen.test.tsx — desbloqueio biométrico como primeira etapa.
//
// A tela abre com o último utilizador do aparelho e dispara o prompt SEM toque
// (sem teclado, sem botão). Recusa/cancelamento não prendem: «Tentar novamente»
// repete o prompt e «Usar senha» devolve o controlo ao formulário.
// ============================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { BiometricUnlock } from '../components/BiometricUnlock';

const renderUnlock = async (
  props: Partial<React.ComponentProps<typeof BiometricUnlock>> = {}
) => {
  const authenticate = vi.fn().mockResolvedValue(true);
  const onUnlocked = vi.fn();
  const onUsePassword = vi.fn();

  await act(async () => {
    render(
      <BiometricUnlock
        username="auditor"
        authenticate={authenticate}
        onUnlocked={onUnlocked}
        onUsePassword={onUsePassword}
        {...props}
      />
    );
  });

  return { authenticate, onUnlocked, onUsePassword };
};

describe('BiometricUnlock — primeira etapa no mobile', () => {
  afterEach(() => {
    cleanup();
  });

  it('abre com o último utilizador e dispara o prompt automaticamente', async () => {
    const { authenticate, onUnlocked } = await renderUnlock();

    expect(screen.getByTestId('biometric-unlock-user').textContent).toBe('auditor');
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledWith('auditor');
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
  });

  it('recusa não prende: avisa, permite repetir e oferece a senha', async () => {
    const authenticate = vi.fn().mockResolvedValue(false);
    const { onUnlocked, onUsePassword } = await renderUnlock({ authenticate });

    await waitFor(() =>
      expect(screen.getByTestId('biometric-unlock-status').textContent).toMatch(/não confirmada/i)
    );
    // Uma única tentativa automática — nada de prompts em loop.
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(onUnlocked).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('biometric-unlock-password'));
    expect(onUsePassword).toHaveBeenCalledTimes(1);

    authenticate.mockResolvedValue(true);
    fireEvent.click(screen.getByTestId('biometric-unlock-retry'));
    await waitFor(() => expect(authenticate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onUnlocked).toHaveBeenCalledTimes(1));
  });

  it('a senha está sempre disponível, mesmo antes de qualquer falha', async () => {
    const { onUsePassword } = await renderUnlock({
      authenticate: vi.fn(() => new Promise<boolean>(() => {}))
    });

    fireEvent.click(screen.getByTestId('biometric-unlock-password'));
    expect(onUsePassword).toHaveBeenCalledTimes(1);
  });

  it('falha do plugin cai na recusa em vez de rebentar a tela', async () => {
    const authenticate = vi.fn().mockRejectedValue(new Error('plugin indisponível'));
    const { onUnlocked } = await renderUnlock({ authenticate });

    await waitFor(() =>
      expect(screen.getByTestId('biometric-unlock-status').textContent).toMatch(/não confirmada/i)
    );
    expect(onUnlocked).not.toHaveBeenCalled();
  });
});
