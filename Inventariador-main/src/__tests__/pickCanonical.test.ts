// src/__tests__/pickCanonical.test.ts
// Fase C — leitura tolerante durante a transição (canônico vence, UPPER é fallback).
// docs/PLANO_FASE_C_HIGIENIZACAO.md §1.1.
import { describe, it, expect } from 'vitest';
import { pickCanonical } from '../utils/normalize';

describe('pickCanonical — leitura tolerante (canônico minúsculo vence)', () => {
  it('prefere a chave canônica minúscula', () => {
    expect(pickCanonical({ endereco: 'CORREDOR A', ENDERECO: 'OUTRO' }, 'endereco')).toBe('CORREDOR A');
  });

  it('usa UPPER como fallback quando o canônico está ausente', () => {
    expect(pickCanonical({ ENDERECO: 'CORREDOR B' }, 'endereco')).toBe('CORREDOR B');
  });

  it('cai no UPPER quando o canônico é null, mas não quando é vazio', () => {
    expect(pickCanonical({ endereco: null, ENDERECO: 'CORREDOR C' }, 'endereco')).toBe('CORREDOR C');
    expect(pickCanonical({ endereco: '', ENDERECO: 'CORREDOR D' }, 'endereco')).toBe('');
  });

  it('retorna null quando nenhuma variante existe', () => {
    expect(pickCanonical({}, 'endereco')).toBeNull();
  });
});
