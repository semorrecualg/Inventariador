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
  render(
    <BiometricRegistration
      username="auditor"
      mode="required"
      onComplete={onComplete}
      onSkip={onSkip}
      {...props}
    />
  );
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
