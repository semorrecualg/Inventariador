// ============================================================================
// auditDetails.test.ts — `details` da nuvem pode chegar como objeto.
//
// Em produção a coluna `audit_logs.details` é json (o bootstrap declara text).
// A trilha local grava texto; a nuvem devolve objeto. Sem normalizar, o ecrã da
// Trilha rebenta em `details.toLowerCase()` e o Histórico de Cargas em
// `details.match(...)`.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { textoDoDetails } from '../utils/auditDetails';

describe('textoDoDetails', () => {
  it('devolve o texto quando já é texto', () => {
    expect(textoDoDetails('Carga de planilha: 12636 ativos injetados.')).toBe(
      'Carga de planilha: 12636 ativos injetados.'
    );
  });

  it('serializa objeto da nuvem em JSON legível', () => {
    expect(textoDoDetails({ mensagem: 'Carga de 20 ativos', filial: '0101' })).toBe(
      '{"mensagem":"Carga de 20 ativos","filial":"0101"}'
    );
  });

  it('serializa arrays e valores aninhados', () => {
    expect(textoDoDetails([{ n: 1 }, { n: 2 }])).toBe('[{"n":1},{"n":2}]');
  });

  it('trata vazio, nulo e indefinido como string vazia', () => {
    expect(textoDoDetails(null)).toBe('');
    expect(textoDoDetails(undefined)).toBe('');
    expect(textoDoDetails('')).toBe('');
  });

  it('converte escalares sem os transformar em JSON', () => {
    expect(textoDoDetails(42)).toBe('42');
    expect(textoDoDetails(false)).toBe('false');
  });

  it('não lança com objeto circular (devolve vazio)', () => {
    const circular: Record<string, unknown> = { nome: 'x' };
    circular.self = circular;
    expect(textoDoDetails(circular)).toBe('');
  });
});
