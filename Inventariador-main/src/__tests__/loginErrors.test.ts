// @vitest-environment node
// ============================================================================
// loginErrors.test.ts — a resposta real do GoTrue tem de casar o ramo localizado.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  ehCredencialInvalida,
  emailNaoConfirmado,
  MENSAGEM_CREDENCIAL_INVALIDA
} from '../utils/loginErrors';

describe('ehCredencialInvalida', () => {
  it('reconhece a resposta real do Supabase (regressão)', () => {
    // Era esta a mensagem que escapava e aparecia em inglês no formulário.
    expect(ehCredencialInvalida('Invalid login credentials')).toBe(true);
    expect(ehCredencialInvalida('invalid login credentials')).toBe(true);
  });

  it('reconhece as variantes antigas', () => {
    expect(ehCredencialInvalida('Invalid credentials')).toBe(true);
    expect(ehCredencialInvalida('invalid_grant')).toBe(true);
    expect(ehCredencialInvalida('User not found')).toBe(true);
    expect(ehCredencialInvalida('E-mail ou senha incorretos')).toBe(true);
  });

  it('não confunde com erros de rede ou servidor', () => {
    expect(ehCredencialInvalida('Failed to fetch')).toBe(false);
    expect(ehCredencialInvalida('AUTH_TIMEOUT')).toBe(false);
    expect(ehCredencialInvalida('permission denied for table assets')).toBe(false);
    expect(ehCredencialInvalida('')).toBe(false);
  });

  it('a mensagem mostra as duas hipóteses, porque o Supabase não as separa', () => {
    expect(MENSAGEM_CREDENCIAL_INVALIDA).toContain('senha');
    expect(MENSAGEM_CREDENCIAL_INVALIDA).toContain('conta ainda não existe');
    expect(MENSAGEM_CREDENCIAL_INVALIDA.toLowerCase()).not.toContain('invalid');
  });
});

describe('emailNaoConfirmado', () => {
  it('reconhece e-mail por confirmar', () => {
    expect(emailNaoConfirmado('Email not confirmed')).toBe(true);
    expect(emailNaoConfirmado('email_not_confirmed')).toBe(true);
  });

  it('não confunde com credencial inválida', () => {
    expect(emailNaoConfirmado('Invalid login credentials')).toBe(false);
    expect(emailNaoConfirmado('Failed to fetch')).toBe(false);
  });
});
