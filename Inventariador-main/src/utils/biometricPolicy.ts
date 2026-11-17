import { UserRole } from '../types';
import { canonicalRole } from './roles';

/**
 * POLÍTICA DA BIOMETRIA — Fase 2 do acesso padronizado
 *
 * Regra do produto: a biometria é OBRIGATÓRIA sempre que o aparelho a pode
 * verificar; quando não pode (WebView do app nativo, hardware sem autenticador),
 * o passo continua a existir e o acesso segue por uma dispensa EXPLÍCITA,
 * motivada e registada na auditoria. Nunca em silêncio e nunca num beco sem
 * saída — o inventário de campo não pode parar por causa do hardware.
 *
 * Este módulo é puro (sem browser, sem WebAuthn) para a decisão ser testável
 * sem jsdom: o App recolhe os factos e o `resolveBiometricStep` decide.
 */

export type BiometricStep = 'proceed' | 'register' | 'fallback';

/**
 * `register` — aparelho capaz e sem credencial: tela obrigatória, sem "Pular".
 * `fallback` — aparelho incapaz: tela de dispensa com motivo e confirmação.
 * `proceed`  — nada a pedir (credencial registada, perfil DEMO ou dispensa já
 *              aceite nesta sessão).
 */
export type BiometricReason =
  | 'role-demo'
  | 'credential-registered'
  | 'fallback-accepted-session'
  | 'credential-required'
  | 'webview-without-webauthn'
  | 'device-without-authenticator';

export interface BiometricContext {
  /** `isUserVerifyingPlatformAuthenticatorAvailable()` (WebAuthn de plataforma). */
  supported: boolean;
  /** Já existe credencial deste utilizador neste aparelho. */
  registered: boolean;
  /** App nativo (Capacitor/WebView) — a biometria de plataforma não é confiável aqui. */
  isNativeApp: boolean;
  /** O utilizador já aceitou a dispensa nesta sessão (não re-perguntar). */
  fallbackAccepted: boolean;
  role: string | null | undefined;
}

export interface BiometricDecision {
  step: BiometricStep;
  reason: BiometricReason;
}

/** Eventos de auditoria da etapa biométrica. */
export const BIOMETRIC_REGISTER_ACTION = 'BIOMETRIC_REGISTER';
export const BIOMETRIC_FALLBACK_ACTION = 'BIOMETRIC_FALLBACK';

const REASON_TEXT: Record<BiometricReason, string> = {
  'role-demo': 'Perfil DEMO: a biometria não é exigida.',
  'credential-registered': 'Biometria já registada neste aparelho.',
  'fallback-accepted-session': 'Acesso sem biometria já autorizado nesta sessão.',
  'credential-required':
    'Este aparelho tem biometria: o cadastro é obrigatório para continuar.',
  'webview-without-webauthn':
    'O app nativo (WebView) não expõe biometria ao sistema: este acesso segue sem cadastro neste aparelho.',
  'device-without-authenticator':
    'Este dispositivo não tem autenticador biométrico disponível: este acesso segue sem cadastro neste aparelho.',
};

/** Texto único do motivo — usado na tela de fallback e nos detalhes da auditoria. */
export const biometricReasonText = (reason: BiometricReason): string => REASON_TEXT[reason];

/**
 * Decide o passo biométrico do pós-login.
 *
 * Ordem deliberada:
 *   1. DEMO é o único perfil isento (decisão de produto da Fase 2).
 *   2. Credencial existente dispensa o passo, mesmo no casco nativo.
 *   3. Dispensa já aceite vale para a sessão inteira (não reabre em loop).
 *   4. Casco nativo (WebView) → fallback: o WebAuthn não é verificável ali.
 *   5. Sem autenticador de plataforma → fallback com motivo de hardware.
 *   6. Caso contrário, o cadastro é obrigatório.
 */
export const resolveBiometricStep = (ctx: BiometricContext): BiometricDecision => {
  if (canonicalRole(ctx.role) === UserRole.DEMO) {
    return { step: 'proceed', reason: 'role-demo' };
  }
  if (ctx.registered) {
    return { step: 'proceed', reason: 'credential-registered' };
  }
  if (ctx.fallbackAccepted) {
    return { step: 'proceed', reason: 'fallback-accepted-session' };
  }
  if (ctx.isNativeApp) {
    return { step: 'fallback', reason: 'webview-without-webauthn' };
  }
  if (!ctx.supported) {
    return { step: 'fallback', reason: 'device-without-authenticator' };
  }
  return { step: 'register', reason: 'credential-required' };
};
