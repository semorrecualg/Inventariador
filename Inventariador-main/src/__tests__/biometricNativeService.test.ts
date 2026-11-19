// @vitest-environment jsdom
// ============================================================================
// biometricNativeService.test.ts — Fase 2b do acesso padronizado.
//
// No casco Capacitor a biometria passa a ser verificada pelo plugin
// `@aparajita/capacitor-biometric-auth` (v8, linha do Capacitor 6), com o
// WebAuthn a continuar a servir o navegador. O que se prova aqui:
//   • o plugin responde disponível/indisponível/falhou e a política recebe os
//     três estados distintos (nunca um "sim" inventado);
//   • o cadastro nativo só grava a marca DEPOIS de o sistema confirmar;
//   • a autenticação nativa exige marca nativa (uma credencial WebAuthn não
//     desbloqueia o APK);
//   • fora do casco nativo o plugin nem é chamado.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: true,
  checkBiometry: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.isNative },
}));

vi.mock('@aparajita/capacitor-biometric-auth', () => ({
  BiometricAuth: {
    checkBiometry: mocks.checkBiometry,
    authenticate: mocks.authenticate,
  },
  // O enum real é numérico com mapeamento inverso (BiometryType[3] → nome); o
  // mock reproduz os dois sentidos, senão o teste mede o mock e não o serviço.
  BiometryType: {
    none: 0,
    touchId: 1,
    faceId: 2,
    fingerprintAuthentication: 3,
    faceAuthentication: 4,
    irisAuthentication: 5,
    0: 'none',
    1: 'touchId',
    2: 'faceId',
    3: 'fingerprintAuthentication',
    4: 'faceAuthentication',
    5: 'irisAuthentication',
  },
  BiometryError: class BiometryError extends Error {
    code: string;
    constructor(message: string, code = '') {
      super(message);
      this.code = code;
    }
  },
}));

import {
  authenticateBiometric,
  checkNativeBiometry,
  hasBiometricRegistered,
  isBiometricSupported,
  registerBiometric,
  removeBiometric,
} from '../services/biometricService';

const AVAILABLE = { isAvailable: true, biometryType: 3, reason: '', code: '' };

describe('biometria nativa no casco Capacitor (Fase 2b)', () => {
  beforeEach(() => {
    mocks.isNative = true;
    mocks.checkBiometry.mockReset();
    mocks.authenticate.mockReset();
  });

  it('traduz a resposta do plugin quando há biometria registada', async () => {
    mocks.checkBiometry.mockResolvedValue(AVAILABLE);

    await expect(checkNativeBiometry()).resolves.toEqual({
      status: 'available',
      biometryType: 'fingerprintAuthentication',
    });
  });

  it('devolve o motivo do sistema quando o aparelho não tem biometria utilizável', async () => {
    mocks.checkBiometry.mockResolvedValue({
      isAvailable: false,
      biometryType: 0,
      reason: 'Nenhuma biometria registada',
      code: 'biometryNotEnrolled',
    });

    await expect(checkNativeBiometry()).resolves.toEqual({
      status: 'unavailable',
      biometryType: 'none',
      detail: 'Nenhuma biometria registada',
    });
  });

  it('trata falha do plugin como unknown (a política cai no fallback declarado)', async () => {
    mocks.checkBiometry.mockRejectedValue(new Error('plugin indisponível'));

    await expect(checkNativeBiometry()).resolves.toEqual({
      status: 'unknown',
      detail: 'plugin indisponível',
    });
  });

  it('regista no plugin e só grava a marca depois da confirmação do sistema', async () => {
    mocks.checkBiometry.mockResolvedValue(AVAILABLE);
    mocks.authenticate.mockResolvedValue(undefined);

    await expect(registerBiometric('nativo-sucesso')).resolves.toBe(true);
    expect(mocks.authenticate).toHaveBeenCalledTimes(1);
    await expect(hasBiometricRegistered('nativo-sucesso')).resolves.toBe(true);
    await removeBiometric('nativo-sucesso');
  });

  it('não abre o prompt quando o plugin diz que não há biometria', async () => {
    mocks.checkBiometry.mockResolvedValue({
      isAvailable: false,
      biometryType: 0,
      reason: 'Aparelho sem sensor',
      code: 'biometryNotAvailable',
    });

    await expect(registerBiometric('nativo-sem-sensor')).resolves.toBe(false);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    await expect(hasBiometricRegistered('nativo-sem-sensor')).resolves.toBe(false);
  });

  it('recusa no prompt não grava credencial (a tela oferece a saída auditada)', async () => {
    mocks.checkBiometry.mockResolvedValue(AVAILABLE);
    mocks.authenticate.mockRejectedValue(new Error('cancelado pelo utilizador'));

    await expect(registerBiometric('nativo-recusado')).resolves.toBe(false);
    await expect(hasBiometricRegistered('nativo-recusado')).resolves.toBe(false);
  });

  it('autentica com a marca nativa e recusa quem não a tem', async () => {
    mocks.checkBiometry.mockResolvedValue(AVAILABLE);
    mocks.authenticate.mockResolvedValue(undefined);

    await registerBiometric('nativo-login');
    await expect(authenticateBiometric('nativo-login')).resolves.toBe(true);

    mocks.authenticate.mockClear();
    await expect(authenticateBiometric('sem-marca-nativa')).resolves.toBe(false);
    expect(mocks.authenticate).not.toHaveBeenCalled();
    await removeBiometric('nativo-login');
  });

  it('fora do casco nativo o plugin não é chamado', async () => {
    mocks.isNative = false;

    await expect(isBiometricSupported()).resolves.toBe(false);
    expect(mocks.checkBiometry).not.toHaveBeenCalled();
  });
});
