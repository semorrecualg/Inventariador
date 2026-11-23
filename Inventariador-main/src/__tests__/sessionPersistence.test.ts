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
  resolveInitialScreenHistory,
  restorePersistedSession,
  writePersistedSession
} from '../utils/sessionPersistence';
import { AppScreen } from '../types';
import type { User, UserRole } from '../types';
import { screenToPath } from '../router/routes';

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

  it('não guarda a sessão DEMO (experimentação não reabre sozinha)', () => {
    writePersistedSession({ ...USER, role: 'DEMO' as UserRole }, 1_000);
    expect(localStorage.getItem(PERSISTED_SESSION_KEY)).toBeNull();
  });

  it('não guarda perfil da nuvem (quem mantém a sessão é o token do Supabase)', () => {
    writePersistedSession({ ...USER, email: 'auditor@example.com', role: 'AUDITOR' as UserRole }, 1_000);
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

  it('ignora cópia de perfil da nuvem gravada por uma versão anterior', () => {
    localStorage.setItem(
      PERSISTED_SESSION_KEY,
      JSON.stringify({ savedAt: 1_000, user: { email: 'auditor@example.com', role: 'AUDITOR' } })
    );
    expect(restorePersistedSession(2_000)).toBeNull();
    expect(sessionStorage.getItem('app_current_user')).toBeNull();
    expect(sessionStorage.getItem('gbr_session_origin')).toBeNull();
  });

  it('não repõe nada depois do prazo', () => {
    writePersistedSession(USER, 1_000);
    expect(restorePersistedSession(1_000 + PERSISTED_SESSION_TTL_MS + 1)).toBeNull();
    expect(sessionStorage.getItem('app_current_user')).toBeNull();
  });
});

describe('resolveInitialScreenHistory — regra de arranque', () => {
  it('separador novo com cópia local válida abre no CONTRATO DE TRABALHO', () => {
    // Estado de um separador novo: sessionStorage vazio, cópia em localStorage.
    writePersistedSession(USER, 1_000);
    sessionStorage.clear();

    restorePersistedSession(2_000);
    const historico = resolveInitialScreenHistory();

    expect(historico).toEqual([AppScreen.WORK_CONTEXT_SELECTION]);
    expect(screenToPath[historico[historico.length - 1]]).toBe('/contexto');
  });

  it('sem sessão nenhuma começa no login', () => {
    expect(resolveInitialScreenHistory()).toEqual([AppScreen.LOGIN]);
    expect(screenToPath[AppScreen.LOGIN]).toBe('/login');
  });

  it('cache ilegível ou nulo não inventa sessão', () => {
    sessionStorage.setItem('app_current_user', '{lixo');
    expect(resolveInitialScreenHistory()).toEqual([AppScreen.LOGIN]);

    sessionStorage.setItem('app_current_user', 'null');
    expect(resolveInitialScreenHistory()).toEqual([AppScreen.LOGIN]);
  });

  it('sessão da nuvem não é tratada como sessão local no arranque', () => {
    sessionStorage.setItem(
      'app_current_user',
      JSON.stringify({ email: 'auditor@example.com', role: 'AUDITOR' })
    );
    expect(resolveInitialScreenHistory()).toEqual([AppScreen.LOGIN]);
  });

  it('F5 numa tela profunda com sessão abre nessa tela, com o contrato por baixo', () => {
    writePersistedSession(USER, 1_000);
    restorePersistedSession(2_000);
    window.location.hash = '#/audit-logs';

    expect(resolveInitialScreenHistory()).toEqual([
      AppScreen.WORK_CONTEXT_SELECTION,
      AppScreen.AUDIT_LOGS,
    ]);

    window.location.hash = '';
  });

  it('com sessão, uma rota desenhada pelo Router (dashboard) não muda o estado', () => {
    writePersistedSession(USER, 1_000);
    restorePersistedSession(2_000);
    window.location.hash = '#/dashboard';

    expect(resolveInitialScreenHistory()).toEqual([AppScreen.WORK_CONTEXT_SELECTION]);

    window.location.hash = '';
  });

  it('sem sessão, uma tela profunda continua a pedir login', () => {
    window.location.hash = '#/audit-logs';

    expect(resolveInitialScreenHistory()).toEqual([AppScreen.LOGIN]);

    window.location.hash = '';
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
