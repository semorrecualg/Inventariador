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
import { ADMIN_EMAIL, isAppManagedSession, isLocalSessionProfile } from './authUtils';
import { AppScreen } from '../types';
import type { User } from '../types';
import { historicoDeAncoragem } from './navegacaoHash';

/**
 * Fim da verificação da nuvem no arranque: a sessão do aparelho fica ou é
 * purgada?
 *
 * `sessaoLidaAntesDoAwait` é o que o boot leu ANTES de esperar pelo
 * `getSession()`. Essa verificação pode terminar DEPOIS de um login local
 * (SQLite a inicializar, rede lenta): o cache já tem então um perfil novo.
 * Reler o cache aqui é o que impede apagar um login recém-concluído e deixar o
 * contrato sem utilizador (ecrã em branco).
 *
 * Purga (remove `app_current_user`) só quando não há sessão local: um perfil da
 * nuvem sem token válido é fantasma. `falhaDeRede` preserva o comportamento do
 * ramo de erro — sem nuvem, a sessão lida mantém-se.
 */
export function resolveSessionAfterCloudCheck(
  sessaoLidaAntesDoAwait: string | null,
  opcoes: { adminEmail?: string; falhaDeRede?: boolean } = {}
): { manter: boolean; sessao: string | null } {
  const adminEmail = opcoes.adminEmail ?? ADMIN_EMAIL;

  let sessao = sessaoLidaAntesDoAwait;
  try {
    sessao = sessionStorage.getItem(SESSION_CACHE_KEY) || sessaoLidaAntesDoAwait;
  } catch {
    /* storage indisponível: vale o que o boot leu */
  }

  let isLocal = isAppManagedSession();
  if (sessao) {
    try {
      if (isLocalSessionProfile(JSON.parse(sessao), adminEmail)) isLocal = true;
    } catch {
      /* perfil ilegível não vale como sessão */
    }
  }

  if (!isLocal && !opcoes.falhaDeRede) {
    try {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
    } catch {
      /* nada a purgar */
    }
    return { manter: false, sessao };
  }

  return { manter: true, sessao };
}

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
 * `true` quando o cache do separador tem um perfil de sessão local válido
 * (incluindo um reposto a partir da cópia persistida). Usado pelos pontos de
 * boot para não ancorarem no login nem limparem uma sessão legítima.
 */
export function hasLocalSessionInCache(): boolean {
  try {
    const guardado = sessionStorage.getItem(SESSION_CACHE_KEY);
    return !!guardado && guardado !== 'null' && isLocalSessionProfile(JSON.parse(guardado));
  } catch {
    return false;
  }
}

/**
 * Regra de arranque do ecrã inicial: com sessão local no cache começa no
 * CONTRATO DE TRABALHO; sem sessão, no login. É esta decisão que impede um
 * separador novo de parar no ecrã de entrada.
 */
export function resolveInitialScreenHistory(): AppScreen[] {
  if (!hasLocalSessionInCache()) return [AppScreen.LOGIN];
  // Com sessão, a URL manda quando pede uma tela: é isto que faz um F5 em
  // `#/audit-logs` abrir a trilha em vez de voltar sempre ao contrato.
  return historicoDeAncoragem(AppScreen.WORK_CONTEXT_SELECTION);
}

/** Logout explícito: o próximo arranque tem de pedir credenciais. */
export function clearPersistedSession(): void {
  try {
    localStorage.removeItem(PERSISTED_SESSION_KEY);
  } catch {
    /* nada a limpar */
  }
}
