// @vitest-environment jsdom
// ============================================================================
// localAccessReset.test.ts — «Redefinir Acesso Local» tem de deixar o próximo
// arranque a pedir login. Antes apagava só algumas chaves e a cópia com prazo
// sobrevivia, por isso quem saía voltava a entrar sozinho.
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { LOCAL_ACCESS_KEEP_KEYS, resetLocalAccessStorage } from '../utils/localAccessReset';
import { PERSISTED_SESSION_KEY, writePersistedSession } from '../utils/sessionPersistence';
import type { User, UserRole } from '../types';

const USER = {
  id: 'u-1',
  email: 'semorr@gmail.com',
  username: 'semorr',
  name: 'Administrador',
  role: 'ADMIN' as UserRole,
  tenantid: 'CICOPAL',
  filial: 'TODAS'
} as User;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('resetLocalAccessStorage', () => {
  it('apaga a cópia persistida da sessão e o cache do separador', () => {
    writePersistedSession(USER, 1_000);
    sessionStorage.setItem('app_current_user', JSON.stringify(USER));
    sessionStorage.setItem('gbr_session_origin', 'APP');

    resetLocalAccessStorage();

    expect(localStorage.getItem(PERSISTED_SESSION_KEY)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('limpa perfil/utilizadores mas preserva modo da base e ativos', () => {
    localStorage.setItem('app_users', '[]');
    localStorage.setItem('gbr_user_session', '{}');
    localStorage.setItem('app_database_mode', 'SUPABASE');
    localStorage.setItem('inventory_assets_v24_supabase_secure', '{"assets":[]}');
    localStorage.setItem('inventory_assets_v24_internal_secure', '{"assets":[]}');

    resetLocalAccessStorage();

    expect(localStorage.getItem('app_users')).toBeNull();
    expect(localStorage.getItem('gbr_user_session')).toBeNull();
    for (const keeper of LOCAL_ACCESS_KEEP_KEYS) {
      expect(localStorage.getItem(keeper)).not.toBeNull();
    }
  });

  it('é idempotente (correr duas vezes não rebenta)', () => {
    writePersistedSession(USER, 1_000);
    resetLocalAccessStorage();
    expect(() => resetLocalAccessStorage()).not.toThrow();
  });
});
