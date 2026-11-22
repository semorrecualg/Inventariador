// ============================================================================
// appUsersCache.ts — a lista `app_users` só é escrita pelo pedido mais recente.
//
// A derivação PBKDF2 é assíncrona. Duas gravações próximas — o cadastro de um
// utilizador e o efeito que persiste `users`, ou o autosave de 3 s — podem
// terminar fora de ordem e a lista VELHA chega ao disco por cima da nova: o
// utilizador acabado de criar desaparecia de `app_users` até ao reload
// seguinte. Cada pedido leva um número de sequência e, na hora de gravar, só
// escreve quem ainda for o último pedido.
// ============================================================================
import { sanitizeUsersForStorage } from './passwordHash';
import { safeStringify } from '../services/utils';
import { logger } from './logger';
import type { User } from '../types';

export const APP_USERS_KEY = 'app_users';

let lastWriteSequence = 0;

/** Deriva o verificador e devolve a lista pronta para o disco. */
type PersistAppUsers = (users: User[]) => Promise<Array<Omit<User, 'password'>>>;

/**
 * Grava `app_users` sem senha em claro, com guarda de sequência: uma gravação
 * ultrapassada por outra mais recente não toca no disco.
 *
 * Devolve a lista gravada; `null` quando o pedido foi ultrapassado ou a
 * gravação falhou (storage cheio, WebCrypto indisponível).
 */
export async function writeAppUsersCache(
  users: User[],
  persist: PersistAppUsers = sanitizeUsersForStorage
): Promise<User[] | null> {
  const sequence = ++lastWriteSequence;
  try {
    const stored = await persist(users);
    // Sem `await` entre a verificação e a escrita: nenhum pedido se intromete.
    if (sequence !== lastWriteSequence) return null;
    localStorage.setItem(APP_USERS_KEY, safeStringify(stored));
    return stored as User[];
  } catch (err) {
    logger.warn('[Acessos] Falha ao gravar a lista de utilizadores local:', err);
    return null;
  }
}
