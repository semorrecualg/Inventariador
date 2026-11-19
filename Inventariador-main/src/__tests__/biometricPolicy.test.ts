// ============================================================================
// biometricPolicy.test.ts — Fase 2 do acesso padronizado (biometria).
//
// Regras do produto (aprovadas):
//   1. A biometria é uma etapa do APP MÓVEL (casco nativo) e é obrigatória
//      quando o aparelho a pode verificar.
//   2. No app, onde não pode (hardware sem autenticador, plugin sem resposta),
//      o passo continua a existir e o acesso segue por dispensa EXPLÍCITA,
//      auditada — nunca em silêncio.
//   3. No navegador/desktop o passo NÃO existe (nem cadastro, nem dispensa),
//      mesmo com autenticador de plataforma disponível.
//   4. Só o perfil DEMO está isento dentro do app.
//   5. A dispensa vale para a sessão atual (não é pedida outra vez no mesmo
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
  it('no navegador/desktop NÃO pede cadastro, mesmo com autenticador de plataforma', () => {
    // Regressão: desktop com Touch ID/Windows Hello abria o cadastro obrigatório
    // e travava o acesso de quem só queria entrar no sistema.
    expect(resolveBiometricStep(context({ supported: true }))).toEqual({
      step: 'proceed',
      reason: 'web-session',
    });
    expect(resolveBiometricStep(context({ supported: false }))).toEqual({
      step: 'proceed',
      reason: 'web-session',
    });
  });

  it('exige o cadastro no app para ADMIN, MASTER, USER e MOBILE_SINGLE (só DEMO é isento)', () => {
    for (const role of [UserRole.ADMIN, UserRole.MASTER, UserRole.USER, UserRole.MOBILE_SINGLE]) {
      expect(
        resolveBiometricStep(context({ role, isNativeApp: true, nativeBiometry: 'available' })).step
      ).toBe('register');
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
    expect(
      resolveBiometricStep(
        context({ role: 'AUXILIARY_AUDITOR', isNativeApp: true, nativeBiometry: 'available' })
      ).step
    ).toBe('register');
  });
});

describe('resolveBiometricStep — fallback declarado', () => {
  it('abre o fallback no casco nativo (WebView) mesmo que o WebAuthn se anuncie disponível', () => {
    expect(resolveBiometricStep(context({ isNativeApp: true, supported: true }))).toEqual({
      step: 'fallback',
      reason: 'webview-without-webauthn',
    });
  });

  it('no casco nativo com o plugin disponível exige o cadastro nativo (Fase 2b)', () => {
    expect(
      resolveBiometricStep(context({ isNativeApp: true, nativeBiometry: 'available' }))
    ).toEqual({ step: 'register', reason: 'credential-required' });
  });

  it('no casco nativo sem biometria utilizável usa o motivo de hardware do plugin', () => {
    expect(
      resolveBiometricStep(context({ isNativeApp: true, nativeBiometry: 'unavailable' }))
    ).toEqual({ step: 'fallback', reason: 'device-without-authenticator' });
  });

  it('sem resposta do plugin mantém o fallback do WebView (nunca finge suporte)', () => {
    expect(
      resolveBiometricStep(
        context({ isNativeApp: true, supported: true, nativeBiometry: 'unknown' })
      )
    ).toEqual({ step: 'fallback', reason: 'webview-without-webauthn' });
  });

  it('a credencial nativa registada liberta o passo antes do plugin ser consultado', () => {
    expect(
      resolveBiometricStep(
        context({ isNativeApp: true, nativeBiometry: 'available', registered: true })
      )
    ).toEqual({ step: 'proceed', reason: 'credential-registered' });
  });

  it('no web sem autenticador de plataforma também segue direto (sem tela de dispensa)', () => {
    expect(resolveBiometricStep(context({ supported: false, isNativeApp: false }))).toEqual({
      step: 'proceed',
      reason: 'web-session',
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
