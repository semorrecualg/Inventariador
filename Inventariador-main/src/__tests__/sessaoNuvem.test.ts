// ============================================================================
// sessaoNuvem.test.ts — o 42501 deixa de ser lido como «falta de GRANT»
//
// O cartão do ativo mostrava «[42501] permission denied for table assets» e a
// correção anterior (#236) abriu a tabela a `anon` — desfazendo o RLS. Estes
// testes fixam a leitura certa: sem token do Supabase o pedido chega como
// `anon`; com token, um 42501 é política (RLS) ou privilégio do papel.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  classificarSessao,
  deveAbrirSessaoNuvemNoLogin,
  explicaPapelAnon,
  mensagemDeRecusa42501,
  MOTIVO_CURTO_MAX,
} from '../utils/sessaoNuvem';

describe('classificarSessao — a prova é o access token', () => {
  it('uma sessão com token autentica o pedido', () => {
    expect(classificarSessao({ access_token: 'jwt' })).toBe('autenticada');
  });

  it('sem sessão, sem token vazio ou com token vazio o pedido é anónimo', () => {
    expect(classificarSessao(null)).toBe('ausente');
    expect(classificarSessao(undefined)).toBe('ausente');
    expect(classificarSessao({ access_token: '' })).toBe('ausente');
    expect(classificarSessao({ access_token: null })).toBe('ausente');
  });
});

describe('deveAbrirSessaoNuvemNoLogin — só em Base Oficial e com rede', () => {
  const base = { temCredenciaisDoBuild: true, modoBase: 'SUPABASE', online: true };

  it('abre em Base Oficial com credenciais e rede', () => {
    expect(deveAbrirSessaoNuvemNoLogin(base)).toBe(true);
    expect(deveAbrirSessaoNuvemNoLogin({ ...base, modoBase: 'SUPABASE_PLUS' })).toBe(true);
    expect(deveAbrirSessaoNuvemNoLogin({ ...base, modoBase: undefined })).toBe(true);
  });

  it('não abre em Base Local, sem rede ou sem credenciais no build', () => {
    expect(deveAbrirSessaoNuvemNoLogin({ ...base, modoBase: 'INTERNAL' })).toBe(false);
    expect(deveAbrirSessaoNuvemNoLogin({ ...base, modoBase: 'INTERNAL_PLUS' })).toBe(false);
    expect(deveAbrirSessaoNuvemNoLogin({ ...base, online: false })).toBe(false);
    expect(deveAbrirSessaoNuvemNoLogin({ ...base, temCredenciaisDoBuild: false })).toBe(false);
  });
});

describe('mensagemDeRecusa42501 — diz o papel, não manda abrir a tabela', () => {
  const original = 'permission denied for table assets';

  it('sem sessão aponta o pedido anónimo e a saída (entrar de novo)', () => {
    const motivo = mensagemDeRecusa42501('ausente', original);
    expect(motivo).toContain('[42501]');
    expect(motivo).toContain('anon');
    expect(motivo).toContain('entre de novo');
    expect(explicaPapelAnon(motivo)).toBe(true);
  });

  it('com sessão aponta o privilégio do papel autenticado', () => {
    const motivo = mensagemDeRecusa42501('autenticada', original);
    expect(motivo).toContain('sessão válida');
    expect(motivo).toContain('GRANT');
    expect(explicaPapelAnon(motivo)).toBe(false);
  });

  it('indeterminado não inventa a causa', () => {
    const motivo = mensagemDeRecusa42501('indeterminado', original);
    expect(motivo).toContain('confirme a sessão');
    expect(motivo).not.toContain('falta o GRANT');
    expect(motivo).not.toContain('como anon');
  });

  it('«new row violates row-level security policy» continua a ser política, não papel', () => {
    const rls = 'new row violates row-level security policy for table "assets"';
    expect(mensagemDeRecusa42501('autenticada', rls)).toContain('política de RLS');
    expect(mensagemDeRecusa42501('ausente', rls)).toContain('RLS sem sessão');
    expect(explicaPapelAnon(mensagemDeRecusa42501('ausente', rls))).toBe(true);
  });

  it('o motivo curto cabe no carimbo do cartão (90 caracteres)', () => {
    for (const estado of ['ausente', 'autenticada', 'indeterminado'] as const) {
      // A mensagem do PostgREST vai no fim do detalhe e o carimbo corta — o que
      // não pode acontecer é a parte acionável ficar fora do limite.
      const semDetalhe = mensagemDeRecusa42501(estado, '');
      expect(semDetalhe.length).toBeLessThanOrEqual(MOTIVO_CURTO_MAX);
    }
  });

  it('mantém o texto original no detalhe (a trilha guarda tudo)', () => {
    expect(mensagemDeRecusa42501('ausente', original)).toContain(original);
  });
});
