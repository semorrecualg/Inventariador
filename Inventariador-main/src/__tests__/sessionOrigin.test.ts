// @vitest-environment jsdom
// ============================================================================
// sessionOrigin.test.ts — a marca de sessão local não sobrevive a um login na
// nuvem.
//
// Regressão: depois de um login local ficar marcado como `APP`, autenticar no
// Supabase e recarregar a app levava o auto-login a ler
// `isAppManagedSession() === true` e a voltar a BASE LOCAL — com sessão Supabase
// válida e a base vazia. O login na nuvem tem de limpar a marca antiga.
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAppManagedSession,
  isAppManagedSession,
  markAppManagedSession
} from '../utils/authUtils';
import { deveEntrarEmModoNuvem, origemDaSessaoGuardada } from '../utils/sessionMode';

const sessaoValida = () => sessionStorage.setItem('app_current_user', '{"email":"master@cicopal"}');

describe('marca de sessão local', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('login local marca a sessão como do app', () => {
    markAppManagedSession();
    sessaoValida();

    expect(isAppManagedSession()).toBe(true);
  });

  it('login Supabase limpa uma marca local antiga', () => {
    // Sessão local anterior, na mesma aba.
    markAppManagedSession();
    sessaoValida();
    expect(isAppManagedSession()).toBe(true);

    // Login na nuvem.
    clearAppManagedSession();

    expect(isAppManagedSession()).toBe(false);
    expect(sessionStorage.getItem('app_current_user')).toBeTruthy();
  });

  it('depois da limpeza, o reload entra em BASE OFICIAL', () => {
    markAppManagedSession();
    sessaoValida();
    clearAppManagedSession();

    const origem = origemDaSessaoGuardada(isAppManagedSession());

    expect(origem).toBe('SUPABASE');
    expect(deveEntrarEmModoNuvem(origem, true)).toBe(true);
  });

  it('sem a limpeza, o reload voltaria a BASE LOCAL (o bug)', () => {
    markAppManagedSession();
    sessaoValida();

    const origem = origemDaSessaoGuardada(isAppManagedSession());

    expect(deveEntrarEmModoNuvem(origem, true)).toBe(false);
  });

  it('limpar duas vezes não estoura', () => {
    expect(() => {
      clearAppManagedSession();
      clearAppManagedSession();
    }).not.toThrow();
  });
});
