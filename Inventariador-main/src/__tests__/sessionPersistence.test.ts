// @vitest-environment jsdom
// ============================================================================
// sessionPersistence.test.ts — fechar o separador e reabrir não pode devolver
// ao login. Cobre a cópia em localStorage: prazo, lixo, carimbo no futuro,
// reposição no cache do separador e purga no logout.
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PERSISTED_SESSION_KEY,
  PERSISTED_SESSION_TTL_MS,
  clearPersistedSession,
  readPersistedSession,
  restorePersistedSession,
  writePersistedSession
} from '../utils/sessionPersistence';
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

describe('writePersistedSession / readPersistedSession', () => {
  it('guarda e devolve o perfil dentro do prazo', () => {
    writePersistedSession(USER, 1_000);
    expect(readPersistedSession(1_000 + 60_000)?.email).toBe('semorr@gmail.com');
  });

  it('não guarda nada sem utilizador ou sem email', () => {
    writePersistedSession(null, 1_000);
    writePersistedSession({ ...USER, email: '   ' }, 1_000);
    expect(localStorage.getItem(PERSISTED_SESSION_KEY)).toBeNull();
  });

  it('expira ao fim do prazo', () => {
    writePersistedSession(USER, 1_000);
    expect(readPersistedSession(1_000 + PERSISTED_SESSION_TTL_MS + 1)).toBeNull();
  });

  it('descarta carimbo no futuro e lixo', () => {
    writePersistedSession(USER, 10_000);
    expect(readPersistedSession(5_000)).toBeNull();
    localStorage.setItem(PERSISTED_SESSION_KEY, '{lixo');
    expect(readPersistedSession()).toBeNull();
  });
});

describe('restorePersistedSession', () => {
  it('repõe app_current_user, a marca APP e o contrato/filial', () => {
    writePersistedSession(USER, 1_000);
    const restaurado = restorePersistedSession(2_000);

    expect(restaurado?.email).toBe('semorr@gmail.com');
    expect(JSON.parse(sessionStorage.getItem('app_current_user') || '{}').email).toBe('semorr@gmail.com');
    expect(sessionStorage.getItem('gbr_session_origin')).toBe('APP');
    expect(sessionStorage.getItem('tenantid')).toBe('CICOPAL');
    expect(sessionStorage.getItem('filial')).toBe('TODAS');
  });

  it('não repõe nada depois do prazo', () => {
    writePersistedSession(USER, 1_000);
    expect(restorePersistedSession(1_000 + PERSISTED_SESSION_TTL_MS + 1)).toBeNull();
    expect(sessionStorage.getItem('app_current_user')).toBeNull();
  });
});

describe('clearPersistedSession', () => {
  it('um logout apaga a cópia e o próximo arranque pede login', () => {
    writePersistedSession(USER, 1_000);
    clearPersistedSession();
    expect(localStorage.getItem(PERSISTED_SESSION_KEY)).toBeNull();
    expect(readPersistedSession(2_000)).toBeNull();
  });
});
