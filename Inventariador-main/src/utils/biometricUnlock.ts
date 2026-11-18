import { UserRole } from '../types';
import { canonicalRole } from './roles';
import type { BiometryStatus } from './biometricPolicy';

/**
 * DESBLOQUEIO BIOMÉTRICO — primeira etapa no mobile
 *
 * O prompt biométrico só responde «sim/não»: não diz QUEM está a entrar. Para a
 * biometria ser a primeira etapa, o aparelho tem de lembrar o último utilizador
 * autenticado e usar a credencial registada para esse utilizador. É o que este
 * módulo resolve — sem guardar senhas, apenas o identificador.
 *
 * Regra: biometria-primeiro só no casco nativo (capacidade + credencial +
 * último utilizador). No web sem autenticador nada disto se aplica: o acesso
 * continua a ser utilizador + senha.
 */

export const LAST_LOGIN_USER_KEY = 'gbr_last_login_user';

/** Superfície mínima de storage — testável sem browser. */
export interface UnlockStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * `undefined` → localStorage quando existe; `null` → sem storage (testes/SSR);
 * um objeto → esse storage.
 */
const resolveStorage = (storage?: UnlockStorage | null): UnlockStorage | null => {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

/** Identificador canónico do aparelho — sempre minúsculas e sem espaços. */
export const normalizeUnlockUser = (value: unknown): string =>
  String(value ?? '').trim().toLowerCase();

/**
 * Memoriza o último utilizador autenticado neste aparelho.
 *
 * Devolve o identificador guardado, ou `''` quando não há nada a guardar. O
 * perfil DEMO fica de fora (a política isenta-o da biometria e ele não deve
 * substituir o último utilizador real do aparelho).
 */
export const rememberLastLoginUser = (
  user: { username?: unknown; email?: unknown; role?: unknown } | null | undefined,
  storage?: UnlockStorage | null
): string => {
  const target = resolveStorage(storage);
  const identifier = normalizeUnlockUser(user?.username || user?.email);
  if (!target || !identifier) return '';
  if (canonicalRole(user?.role as string | null | undefined) === UserRole.DEMO) return '';
  target.setItem(LAST_LOGIN_USER_KEY, identifier);
  return identifier;
};

/** Último utilizador autenticado neste aparelho ('' quando não há). */
export const readLastLoginUser = (storage?: UnlockStorage | null): string => {
  const target = resolveStorage(storage);
  if (!target) return '';
  try {
    return normalizeUnlockUser(target.getItem(LAST_LOGIN_USER_KEY));
  } catch {
    return '';
  }
};

/** Esquece o último utilizador (ex.: «Entrar com outra conta»). */
export const forgetLastLoginUser = (storage?: UnlockStorage | null): void => {
  const target = resolveStorage(storage);
  try {
    target?.removeItem(LAST_LOGIN_USER_KEY);
  } catch {
    // storage indisponível: nada a esquecer
  }
};

export interface BiometricUnlockContext {
  /** Último utilizador autenticado no aparelho ('' se nenhum). */
  lastUser: string;
  /** Casco Capacitor (app móvel). No navegador é sempre falso. */
  isNativeApp: boolean;
  /** Resposta do plugin nativo (`checkNativeBiometry`). */
  biometry: BiometryStatus;
  /** Existe credencial NATIVA registada para `lastUser` neste aparelho. */
  registered: boolean;
}

/**
 * A tela de desbloqueio biométrico deve ser a primeira?
 *
 * Só quando o aparelho pode verificar a biometria (plugin `available`), há
 * credencial registada para o último utilizador e estamos no casco nativo. O
 * primeiro acesso — aparelho capaz sem credencial — cai na senha e depois no
 * cadastro obrigatório, como antes.
 */
export const canOfferBiometricUnlock = (ctx: BiometricUnlockContext): boolean => {
  if (!ctx.isNativeApp || ctx.biometry !== 'available' || !ctx.registered) return false;
  return normalizeUnlockUser(ctx.lastUser) !== '';
};
