// @vitest-environment jsdom
// ============================================================================
// baseGeneration.test.ts — o selo que impede um aparelho com base antiga de
// repovoar a nuvem depois de um reset.
// ============================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BASE_GENERATION_KEY,
  avaliarGeracaoBase,
  gravarSeloBase,
  lerSeloBase,
  limparSeloBase,
  mensagemGeracaoAntiga,
  normalizarGeracao
} from '../utils/baseGeneration';

const g1 = { generation: '11111111-1111-4111-8111-111111111111', seq: 1 };
const g2 = { generation: '22222222-2222-4222-8222-222222222222', seq: 2 };

describe('normalizarGeracao', () => {
  it('aceita uma linha válida e trunca o seq', () => {
    expect(normalizarGeracao({ generation: ' abc ', seq: '2.9' })).toEqual({ generation: 'abc', seq: 2 });
  });

  it.each([
    null,
    undefined,
    {},
    { generation: '', seq: 1 },
    { generation: 'abc', seq: 0 },
    { generation: 'abc', seq: 'x' }
  ])('recusa lixo: %j', (value) => {
    expect(normalizarGeracao(value)).toBeNull();
  });
});

describe('storage do selo', () => {
  beforeEach(() => localStorage.clear());

  it('grava e lê o selo', () => {
    expect(gravarSeloBase(g2)).toBe(true);
    expect(lerSeloBase()).toEqual(g2);
  });

  it('JSON quebrado conta como ausência de selo', () => {
    localStorage.setItem(BASE_GENERATION_KEY, '{quebrado');
    expect(lerSeloBase()).toBeNull();
  });

  it('limpa o selo', () => {
    gravarSeloBase(g2);
    limparSeloBase();
    expect(localStorage.getItem(BASE_GENERATION_KEY)).toBeNull();
  });
});

describe('avaliarGeracaoBase', () => {
  it('segue quando o aparelho está na geração corrente', () => {
    expect(avaliarGeracaoBase({ local: g2, remoto: g2, baseLocalVazia: false }).verdict).toBe('ok');
  });

  it('sem selo na nuvem não há portão (compatibilidade)', () => {
    expect(avaliarGeracaoBase({ local: g2, remoto: null, baseLocalVazia: false }).verdict).toBe('unknown');
  });

  it('adota quando a base local está vazia — não há nada para repovoar', () => {
    expect(avaliarGeracaoBase({ local: null, remoto: g2, baseLocalVazia: true }).verdict).toBe('adopt');
    expect(avaliarGeracaoBase({ local: g2, remoto: g2, baseLocalVazia: true }).verdict).toBe('ok');
    expect(avaliarGeracaoBase({ local: { ...g1 }, remoto: g2, baseLocalVazia: true }).verdict).toBe('adopt');
  });

  it('adota a primeira geração sem selo local (rollout, aparelho já em campo)', () => {
    expect(avaliarGeracaoBase({ local: null, remoto: g1, baseLocalVazia: false }).verdict).toBe('adopt');
  });

  it('bloqueia a base antiga depois de um reset', () => {
    const decisao = avaliarGeracaoBase({ local: g1, remoto: g2, baseLocalVazia: false });
    expect(decisao.verdict).toBe('blocked');
    expect(decisao.reason).toContain('geração anterior');
  });

  it('bloqueia aparelho sem selo quando a nuvem já foi reiniciada', () => {
    expect(avaliarGeracaoBase({ local: null, remoto: g2, baseLocalVazia: false }).verdict).toBe('blocked');
  });

  it('a mensagem diz o que fazer e garante que nada foi enviado', () => {
    const msg = mensagemGeracaoAntiga(g2, g1);
    expect(msg).toContain('ENVIO BLOQUEADO');
    expect(msg).toContain('geração 2');
    expect(msg).toContain('Nada foi enviado');
    expect(msg).toContain('Preparar Nova Carga');
  });
});
