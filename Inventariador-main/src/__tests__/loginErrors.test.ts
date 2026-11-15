// @vitest-environment node
// ============================================================================
// loginErrors.test.ts — a resposta real do GoTrue tem de casar o ramo localizado.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { interessaAoSreMonitor } from '../services/sreMonitor';
import {
  comCodigoTecnico,
  ehCredencialInvalida,
  emailNaoConfirmado,
  MENSAGEM_CREDENCIAL_INVALIDA,
  linhaSreDeLoginRecusado
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

  it('a linha do SRE diz o código do Auth e o projeto em uso', () => {
    const linha = linhaSreDeLoginRecusado({
      codigo: 'invalid_credentials',
      motivo: 'Invalid login credentials',
      projectRef: 'mpulmonxbcpqjxouzvuc',
      projetoUrl: 'https://mpulmonxbcpqjxouzvuc.supabase.co',
      utilizador: 'semorr@gmail.com'
    });

    expect(linha).toContain('Entrada recusada [invalid_credentials]');
    expect(linha).toContain('projeto mpulmonxbcpqjxouzvuc');
    expect(linha).toContain('https://mpulmonxbcpqjxouzvuc.supabase.co');
    expect(linha).toContain('utilizador semorr@gmail.com');
    // aceite pelo filtro do SRE Monitor (Gestor de Base → monitor)
    expect(interessaAoSreMonitor(linha)).toBe(true);
  });

  it('sem código nem projeto a linha continua legível', () => {
    const linha = linhaSreDeLoginRecusado({ motivo: 'Credenciais locais inválidas' });
    expect(linha).toContain('[Login] Entrada recusada: Credenciais locais inválidas');
    expect(linha).toContain('projeto desconhecido');
    expect(linha).toContain('utilizador -');
  });

  it('a mensagem ensina a escrever a senha sem autofill', () => {
    expect(MENSAGEM_CREDENCIAL_INVALIDA.toLowerCase()).toContain('autofill');
    expect(MENSAGEM_CREDENCIAL_INVALIDA.toLowerCase()).toContain('à mão');
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

describe('comCodigoTecnico', () => {
  it('acrescenta o código devolvido pelo Auth', () => {
    expect(comCodigoTecnico('Falhou', 'invalid_credentials')).toBe('Falhou [invalid_credentials]');
    expect(comCodigoTecnico('Falhou', 400)).toBe('Falhou [400]');
  });

  it('sem código, a mensagem fica como está', () => {
    expect(comCodigoTecnico('Falhou')).toBe('Falhou');
    expect(comCodigoTecnico('Falhou', '')).toBe('Falhou');
    expect(comCodigoTecnico('Falhou', null)).toBe('Falhou');
  });
});
