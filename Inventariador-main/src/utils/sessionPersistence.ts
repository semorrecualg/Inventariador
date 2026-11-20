// ============================================================================
// sessionPersistence.ts — a sessão sobrevive a FECHAR o separador.
//
// O login do app vive em `sessionStorage` (`app_current_user`), que morre com o
// separador. Aqui fica uma cópia em `localStorage` com prazo, reposta no arranque
// — e apagada em qualquer logout explícito. É o suficiente para «fechar e
// reabrir o app» sem voltar ao ecrã de entrada.
//
// Só o PERFIL é guardado (email, papel, contrato, filial) — nunca senha nem
// token. O perfil já vivia no aparelho em `app_users`; isto não acrescenta
// segredos, só evita que o utilizador tenha de repetir o login a cada sessão.
// ============================================================================
import { isLocalSessionProfile } from './authUtils';
import { AppScreen } from '../types';
import type { User } from '../types';

export const PERSISTED_SESSION_KEY = 'gbr_persisted_session';

/** Prazo da sessão guardada: 7 dias. Depois disto volta a pedir login. */
export const PERSISTED_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SESSION_CACHE_KEY = 'app_current_user';
const SESSION_ORIGIN_KEY = 'gbr_session_origin';

interface PersistedSession {
  user: User;
  savedAt: number;
}

/**
 * Guarda o perfil para o próximo arranque. Só perfis de credencial local (e
 * nunca DEMO: «experimentar grátis» não reabre sozinho). A sessão da nuvem já
 * tem o token do Supabase a mantê-la — guardá-la aqui só criaria um perfil
 * velho marcado como local, que escaparia à revalidação.
 */
export function writePersistedSession(user: User | null | undefined, now: number = Date.now()): void {
  if (!user || typeof user.email !== 'string' || !user.email.trim()) return;
  if (String(user.role || '').toUpperCase() === 'DEMO') return;
  if (!isLocalSessionProfile(user)) return;
  try {
    localStorage.setItem(PERSISTED_SESSION_KEY, JSON.stringify({ user, savedAt: now }));
  } catch {
    /* sem cota: a sessão do separador continua a valer */
  }
}

/**
 * Lê o perfil guardado. Descarta lixo, carimbo no futuro, mais velho que o
 * prazo e registos sem email.
 */
export function readPersistedSession(
  now: number = Date.now(),
  ttl: number = PERSISTED_SESSION_TTL_MS
): User | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PERSISTED_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: Partial<PersistedSession> | null = null;
  try {
    parsed = JSON.parse(raw) as Partial<PersistedSession> | null;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) return null;

  const idade = now - parsed.savedAt;
  if (idade < 0 || idade > ttl) return null;

  const user = parsed.user as User | undefined;
  if (!user || typeof user.email !== 'string' || !user.email.trim()) return null;
  return user;
}

/**
 * Repõe a sessão guardada no cache do separador — é o que o resto do `App` lê
 * no arranque (`app_current_user` + marca `APP`, para não ser tratada como
 * fantasma da nuvem).
 */
export function restorePersistedSession(
  now: number = Date.now(),
  ttl: number = PERSISTED_SESSION_TTL_MS
): User | null {
  const user = readPersistedSession(now, ttl);
  // Cópia de perfil da nuvem (versão anterior) não vale como sessão local.
  if (!user || !isLocalSessionProfile(user)) return null;

  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_ORIGIN_KEY, 'APP');
    if (user.tenantid) sessionStorage.setItem('tenantid', user.tenantid);
    if (user.filial) {
      sessionStorage.setItem('filial', user.filial);
      sessionStorage.setItem('selectedUnit', user.filial);
    }
  } catch {
    /* sem sessionStorage a sessão não pode ser reposta */
  }
  return user;
}

/**
 * Regra de arranque do ecrã inicial: com sessão local no cache do separador
 * (incluindo a reposta de uma cópia persistida) começa no CONTRATO DE TRABALHO;
 * sem sessão, no login. É esta decisão que impede um separador novo de parar no
 * ecrã de entrada.
 */
export function hasLocalSessionInCache(): boolean {
  try {
    const guardado = sessionStorage.getItem(SESSION_CACHE_KEY);
    return !!guardado && guardado !== 'null' && isLocalSessionProfile(JSON.parse(guardado));
  } catch {
    return false;
  }
}

export function resolveInitialScreenHistory(): AppScreen[] {
  return hasLocalSessionInCache() ? [AppScreen.WORK_CONTEXT_SELECTION] : [AppScreen.LOGIN];
}

/** Logout explícito: o próximo arranque tem de pedir credenciais. */
export function clearPersistedSession(): void {
  try {
    localStorage.removeItem(PERSISTED_SESSION_KEY);
  } catch {
    /* nada a limpar */
  }
}
