// @vitest-environment jsdom
// ============================================================================
// passwordRecovery.test.ts — reconhecer o link do e-mail do Supabase.
//
// Sem isto, o link abria sessão e a app entrava como login normal: o utilizador
// ficava dentro com a senha antiga e nunca via o ecrã de nova senha.
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHAVE_RECUPERACAO,
  ehLinkDeRecuperacao,
  emRecuperacaoDeSenha,
  limparRecuperacaoDeSenha,
  marcarRecuperacaoDeSenha
} from '../utils/passwordRecovery';

describe('ehLinkDeRecuperacao', () => {
  it('reconhece o link implícito (access_token no hash)', () => {
    expect(ehLinkDeRecuperacao(
      '#access_token=abc.def.ghi&expires_in=3600&refresh_token=xyz&token_type=bearer&type=recovery'
    )).toBe(true);
  });

  it('reconhece o link PKCE (code na query)', () => {
    expect(ehLinkDeRecuperacao('', '?code=abc123&type=recovery')).toBe(true);
  });

  it('não confunde com um login normal nem com o router', () => {
    expect(ehLinkDeRecuperacao('#/login')).toBe(false);
    expect(ehLinkDeRecuperacao('#access_token=abc&type=magiclink')).toBe(false);
    expect(ehLinkDeRecuperacao('', '')).toBe(false);
    // `type=recovery_extra` não é o parâmetro de recuperação
    expect(ehLinkDeRecuperacao('#type=recovery_extra')).toBe(false);
  });
});

describe('marca da recuperação', () => {
  beforeEach(() => {
    sessionStorage.clear();
    limparRecuperacaoDeSenha();
  });

  it('marca, lê e limpa', () => {
    expect(emRecuperacaoDeSenha()).toBe(false);
    marcarRecuperacaoDeSenha();
    expect(sessionStorage.getItem(CHAVE_RECUPERACAO)).toBe('true');
    expect(emRecuperacaoDeSenha()).toBe(true);
    limparRecuperacaoDeSenha();
    expect(emRecuperacaoDeSenha()).toBe(false);
  });
});
