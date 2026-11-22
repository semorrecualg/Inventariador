// @vitest-environment jsdom
// ============================================================================
// bootCloudCheck.test.ts — a verificação da nuvem pode terminar DEPOIS do login.
//
// Regressão do contrato em branco no dispositivo: o arranque lia
// `app_current_user` antes de esperar por `supabase.auth.getSession()`; quando a
// nuvem respondia «sem sessão» depois de o utilizador já ter entrado com
// credencial local, a purga apagava esse login, fazia `setUser(null)` e o
// `WorkContextSelector` (que só renderiza com `user`) deixava `/contexto` vazio.
//
// `resolveSessionAfterCloudCheck` é a decisão que o `App` usa nos dois ramos
// (sessão inválida e falha de rede): relê o cache no momento da purga.
// ============================================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveSessionAfterCloudCheck } from '../utils/sessionPersistence';
import { markAppManagedSession } from '../utils/authUtils';

const ADMIN = {
  username: 'semorr',
  email: 'semorr@gmail.com',
  name: 'Administrador',
  role: 'ADMIN',
  tenantid: 'CICOPAL',
  filial: 'TODAS'
};

const CLOUD_GHOST = {
  username: 'auditor',
  email: 'auditor@example.com',
  name: 'Auditor',
  role: 'AUDITOR',
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO'
};

const cache = (): { email?: string } => JSON.parse(sessionStorage.getItem('app_current_user') || '{}');

describe('resolveSessionAfterCloudCheck — nuvem lenta vs. login local', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it('não apaga o login local concluído enquanto a nuvem verificava', () => {
    // 1. Arranque: a verificação da nuvem começa sem sessão no cache.
    const sessaoLidaAntesDoAwait = sessionStorage.getItem('app_current_user');
    expect(sessaoLidaAntesDoAwait).toBeNull();

    // 2. Entretanto o login local conclui (Login.tsx grava o perfil + marca APP).
    markAppManagedSession();
    sessionStorage.setItem('app_current_user', JSON.stringify(ADMIN));

    // 3. `getSession()` resolve sem sessão da nuvem.
    const resultado = resolveSessionAfterCloudCheck(sessaoLidaAntesDoAwait);

    expect(resultado.manter).toBe(true);
    expect(cache().email).toBe('semorr@gmail.com');
    expect(sessionStorage.getItem('gbr_session_origin')).toBe('APP');
  });

  it('relê o cache: o perfil lido antes do await não condena o login que chegou depois', () => {
    // O boot leu um perfil da nuvem (sem token) e ficou à espera do getSession.
    sessionStorage.setItem('app_current_user', JSON.stringify(CLOUD_GHOST));
    const sessaoLidaAntesDoAwait = sessionStorage.getItem('app_current_user');

    // A verificação ainda estava em voo quando o login local a substituiu.
    markAppManagedSession();
    sessionStorage.setItem('app_current_user', JSON.stringify(ADMIN));

    const resultado = resolveSessionAfterCloudCheck(sessaoLidaAntesDoAwait);

    expect(resultado.manter).toBe(true);
    expect(cache().email).toBe('semorr@gmail.com');
  });

  it('continua a purgar um perfil da nuvem sem token (fantasma)', () => {
    sessionStorage.setItem('app_current_user', JSON.stringify(CLOUD_GHOST));

    const resultado = resolveSessionAfterCloudCheck(sessionStorage.getItem('app_current_user'));

    expect(resultado.manter).toBe(false);
    expect(sessionStorage.getItem('app_current_user')).toBeNull();
  });

  it('falha de rede retém a sessão lida antes do await em vez de a purgar', () => {
    sessionStorage.setItem('app_current_user', JSON.stringify(CLOUD_GHOST));

    const resultado = resolveSessionAfterCloudCheck(sessionStorage.getItem('app_current_user'), {
      falhaDeRede: true
    });

    expect(resultado.manter).toBe(true);
    expect(cache().email).toBe('auditor@example.com');
  });
});
