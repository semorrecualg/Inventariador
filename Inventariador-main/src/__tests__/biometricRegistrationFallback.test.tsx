// @vitest-environment jsdom
// ============================================================================
// biometricRegistrationFallback.test.tsx — Fase 2 do acesso padronizado.
//
// A tela de biometria deixou de ser opcional:
//   • `mode="required"` (aparelho capaz) NÃO tem "Pular" — só o cadastro;
//   • `mode="fallback"` (WebView/hardware sem sensor) explica o motivo e exige
//     uma confirmação explícita ("Continuar sem biometria neste aparelho");
//   • se o suporte cair depois da decisão, a tela degrada para o fallback em
//     vez de prender o utilizador (nunca um beco sem saída).
// ============================================================================
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import BiometricRegistration from '../components/BiometricRegistration';

const mocks = vi.hoisted(() => ({
  isBiometricSupported: vi.fn(),
  registerBiometric: vi.fn(),
}));

vi.mock('../services/biometricService', () => ({
  isBiometricSupported: mocks.isBiometricSupported,
  registerBiometric: mocks.registerBiometric,
}));

const renderScreen = async (
  props: Partial<React.ComponentProps<typeof BiometricRegistration>> = {}
) => {
  const onComplete = vi.fn();
  const onSkip = vi.fn();
  // O `isBiometricSupported().then(setSupported)` do mount resolve dentro do
  // act para a suíte não ficar com avisos de atualização fora de act.
  await act(async () => {
    render(
      <BiometricRegistration
        username="auditor"
        mode="required"
        onComplete={onComplete}
        onSkip={onSkip}
        {...props}
      />
    );
  });
  return { onComplete, onSkip };
};

describe('BiometricRegistration — Fase 2', () => {
  beforeEach(() => {
    mocks.isBiometricSupported.mockReset();
    mocks.registerBiometric.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('no modo obrigatório oferece o cadastro e não deixa pular', async () => {
    mocks.isBiometricSupported.mockResolvedValue(true);
    const { onSkip } = await renderScreen({ mode: 'required' });

    await waitFor(() => expect(screen.getByText('Cadastrar Biometria')).toBeTruthy());
    expect(screen.queryByText('Pular por enquanto')).toBeNull();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it('no fallback explica o motivo e exige confirmação explícita', async () => {
    mocks.isBiometricSupported.mockResolvedValue(false);
    const { onSkip, onComplete } = await renderScreen({
      mode: 'fallback',
      reason: 'webview-without-webauthn',
    });

    await waitFor(() =>
      expect(screen.getByText(/WebView/)).toBeTruthy()
    );
    expect(screen.queryByText('Cadastrar Biometria')).toBeNull();

    fireEvent.click(
      screen.getByRole('button', { name: /Continuar sem biometria neste aparelho/i })
    );

    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledWith('webview-without-webauthn');
    expect(onComplete).not.toHaveBeenCalled();
    expect(mocks.registerBiometric).not.toHaveBeenCalled();
  });

  it('degrada para o fallback quando o suporte desaparece depois da decisão', async () => {
    mocks.isBiometricSupported.mockResolvedValue(false);
    const { onSkip } = await renderScreen({ mode: 'required' });

    const continuar = await waitFor(() =>
      screen.getByRole('button', { name: /Continuar sem biometria neste aparelho/i })
    );
    fireEvent.click(continuar);
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledWith('device-without-authenticator');
  });

  it('no modo obrigatório, a falha do cadastro não prende: há nova tentativa e saída auditada', async () => {
    mocks.isBiometricSupported.mockResolvedValue(true);
    mocks.registerBiometric.mockResolvedValue(false);
    const { onSkip, onComplete } = await renderScreen({ mode: 'required' });

    await waitFor(() => expect(screen.getByText('Cadastrar Biometria')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText('Cadastrar Biometria'));
    });

    // A falha mostra a mensagem e as DUAS saídas: repetir ou dispensar.
    await waitFor(() => expect(screen.getByText(/Não foi possível completar o registro biométrico/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Continuar sem biometria neste aparelho/i })
    ).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    });
    await waitFor(() => expect(mocks.registerBiometric).toHaveBeenCalledTimes(2));
    // A segunda falha também deixa as duas saídas disponíveis.
    await waitFor(() => expect(screen.getByRole('button', { name: /Tentar novamente/i })).toBeTruthy());

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /Continuar sem biometria neste aparelho/i })
      );
    });
    expect(onSkip).toHaveBeenCalledWith('registration-failed');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('o cadastro concluído avisa o App (que libera o gate e audita)', async () => {
    mocks.isBiometricSupported.mockResolvedValue(true);
    mocks.registerBiometric.mockResolvedValue(true);
    const { onComplete } = await renderScreen({ mode: 'required' });

    await waitFor(() => expect(screen.getByText('Cadastrar Biometria')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText('Cadastrar Biometria'));
    });

    // O sucesso mostra a confirmação e só depois (2s) liberta o gate.
    await waitFor(() => expect(screen.getByText('REGISTRO CONCLUÍDO!')).toBeTruthy());
    expect(mocks.registerBiometric).toHaveBeenCalledWith('auditor');
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });
});
