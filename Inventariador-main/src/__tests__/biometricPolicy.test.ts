// ============================================================================
// biometricPolicy.test.ts — Fase 2 do acesso padronizado (biometria).
//
// Regras do produto (aprovadas):
//   1. A biometria é obrigatória sempre que o aparelho a pode verificar.
//   2. Onde não pode (WebView do app nativo, hardware sem autenticador), o
//      passo continua a existir e o acesso segue por dispensa EXPLÍCITA,
//      auditada — nunca em silêncio.
//   3. Só o perfil DEMO está isento.
//   4. A dispensa vale para a sessão atual (não é pedida outra vez no mesmo
//      login, mas volta no login seguinte).
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  BIOMETRIC_FALLBACK_ACTION,
  BIOMETRIC_REGISTER_ACTION,
  biometricReasonText,
  resolveBiometricStep,
  type BiometricContext,
} from '../utils/biometricPolicy';
import { UserRole } from '../types';

const context = (overrides: Partial<BiometricContext> = {}): BiometricContext => ({
  supported: true,
  registered: false,
  isNativeApp: false,
  fallbackAccepted: false,
  role: UserRole.AUDITOR,
  ...overrides,
});

describe('resolveBiometricStep — biometria obrigatória', () => {
  it('exige o cadastro no navegador com autenticador de plataforma e sem credencial', () => {
    expect(resolveBiometricStep(context())).toEqual({
      step: 'register',
      reason: 'credential-required',
    });
  });

  it('exige o cadastro para ADMIN, MASTER, USER e MOBILE_SINGLE (só DEMO é isento)', () => {
    for (const role of [UserRole.ADMIN, UserRole.MASTER, UserRole.USER, UserRole.MOBILE_SINGLE]) {
      expect(resolveBiometricStep(context({ role })).step).toBe('register');
    }
  });

  it('liberta o passo quando a credencial deste utilizador já existe no aparelho', () => {
    expect(resolveBiometricStep(context({ registered: true }))).toEqual({
      step: 'proceed',
      reason: 'credential-registered',
    });
  });

  it('isenta o perfil DEMO mesmo sem suporte e sem credencial', () => {
    expect(
      resolveBiometricStep(
        context({ role: UserRole.DEMO, supported: false, isNativeApp: true })
      )
    ).toEqual({ step: 'proceed', reason: 'role-demo' });
  });

  it('lê o papel legado AUXILIARY_AUDITOR como auditor de campo (não como DEMO)', () => {
    expect(resolveBiometricStep(context({ role: 'AUXILIARY_AUDITOR' })).step).toBe('register');
  });
});

describe('resolveBiometricStep — fallback declarado', () => {
  it('abre o fallback no casco nativo (WebView) mesmo que o WebAuthn se anuncie disponível', () => {
    expect(resolveBiometricStep(context({ isNativeApp: true, supported: true }))).toEqual({
      step: 'fallback',
      reason: 'webview-without-webauthn',
    });
  });

  it('abre o fallback no dispositivo sem autenticador de plataforma', () => {
    expect(resolveBiometricStep(context({ supported: false }))).toEqual({
      step: 'fallback',
      reason: 'device-without-authenticator',
    });
  });

  it('não repete a pergunta quando a dispensa já foi aceite nesta sessão', () => {
    expect(
      resolveBiometricStep(context({ supported: false, fallbackAccepted: true }))
    ).toEqual({ step: 'proceed', reason: 'fallback-accepted-session' });
  });

  it('a credencial registada tem prioridade sobre a dispensa da sessão', () => {
    expect(
      resolveBiometricStep(context({ registered: true, fallbackAccepted: true }))
    ).toEqual({ step: 'proceed', reason: 'credential-registered' });
  });

  it('cada motivo tem texto próprio para a tela e para a auditoria', () => {
    expect(biometricReasonText('webview-without-webauthn')).toMatch(/WebView/);
    expect(biometricReasonText('device-without-authenticator')).toMatch(/autenticador/);
    expect(biometricReasonText('credential-required')).toMatch(/obrigatório/);
    expect(biometricReasonText('registration-failed')).toMatch(/auditoria/);
    expect(BIOMETRIC_REGISTER_ACTION).not.toBe(BIOMETRIC_FALLBACK_ACTION);
  });
});
