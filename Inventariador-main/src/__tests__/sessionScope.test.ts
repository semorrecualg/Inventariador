// @vitest-environment node
// ============================================================================
// sessionScope.test.ts — não derrubar sessão válida por leitura falhada.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  decidirEscopoDeSessao,
  mensagemContaSemContrato,
  perfilNaoLido,
  type EntradaEscopo
} from '../utils/sessionScope';

const base: EntradaEscopo = {
  tenantid: 'CICOPAL',
  filial: 'MATRIZ',
  ehDono: false,
  sessaoLocalDoApp: false,
  perfilIndisponivel: false
};

describe('decidirEscopoDeSessao', () => {
  it('segue quando há contrato e filial', () => {
    expect(decidirEscopoDeSessao(base)).toBe('SEGUIR');
  });

  it('o dono global não precisa de filial', () => {
    expect(decidirEscopoDeSessao({ ...base, filial: '', ehDono: true })).toBe('SEGUIR');
  });

  it('perfil que não foi lido mantém a sessão (não é "sem escopo")', () => {
    expect(decidirEscopoDeSessao({
      ...base,
      tenantid: '',
      filial: '',
      perfilIndisponivel: true
    })).toBe('LER_PERFIL_FALHOU');
  });

  it('leitura falhada tem prioridade sobre a ausência de escopo', () => {
    // Antes, este caso virava `SEM_ESCOPO` e o app fazia signOut.
    const decisao = decidirEscopoDeSessao({
      ...base,
      tenantid: '',
      filial: '',
      perfilIndisponivel: true,
      sessaoLocalDoApp: true
    });
    expect(decisao).toBe('LER_PERFIL_FALHOU');
  });

  it('sessão local do app sobrevive ao fail-safe da nuvem', () => {
    expect(decidirEscopoDeSessao({
      ...base,
      tenantid: '',
      filial: '',
      sessaoLocalDoApp: true
    })).toBe('SESSAO_LOCAL');
  });

  it('perfil lido e sem contrato/filial encerra', () => {
    expect(decidirEscopoDeSessao({ ...base, tenantid: '', filial: '' })).toBe('SEM_ESCOPO');
    expect(decidirEscopoDeSessao({ ...base, filial: '' })).toBe('SEM_ESCOPO');
  });

  it('NULL e UNDEFINED gravados pela base valem por ausência', () => {
    expect(decidirEscopoDeSessao({ ...base, tenantid: 'null' })).toBe('SEM_ESCOPO');
    expect(decidirEscopoDeSessao({ ...base, filial: 'UNDEFINED' })).toBe('SEM_ESCOPO');
    expect(decidirEscopoDeSessao({ ...base, tenantid: '  ' })).toBe('SEM_ESCOPO');
  });
});

describe('perfilNaoLido', () => {
  it('reconhece o fallback de leitura falhada', () => {
    expect(perfilNaoLido({ tenantid: '', filial: '', perfilIndisponivel: true })).toBe(true);
  });

  it('um perfil lido sem contrato não é "não lido"', () => {
    expect(perfilNaoLido({ tenantid: '', filial: '' })).toBe(false);
    expect(perfilNaoLido({ perfilIndisponivel: 'true' })).toBe(false);
    expect(perfilNaoLido(null)).toBe(false);
    expect(perfilNaoLido(undefined)).toBe(false);
    expect(perfilNaoLido('perfilIndisponivel')).toBe(false);
  });
});

describe('mensagemContaSemContrato', () => {
  it('mostra o que foi lido da base, não só "sem contrato"', () => {
    const texto = mensagemContaSemContrato('semorr@gmail.com', '', 'MATRIZ');
    expect(texto).toContain('semorr@gmail.com');
    expect(texto).toContain('contrato vazio');
    expect(texto).toContain('filial "MATRIZ"');
    expect(texto).toContain('user_permissions');
  });

  it('mostra os valores quando existem (ex.: sentinela NULL)', () => {
    expect(mensagemContaSemContrato('a@b.c', 'NULL', '  '))
      .toContain('contrato "NULL"');
    expect(mensagemContaSemContrato('a@b.c', 'CICOPAL', 'MATRIZ'))
      .toContain('filial "MATRIZ"');
  });
});
