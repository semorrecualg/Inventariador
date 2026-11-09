// src/__tests__/labelingFilter.test.ts
// Tela ETIQUETAGEM: lista TODOS os registros com `etiqueta` = "ETIQUETAR".
// Bug real: a query exigia unidade ativa e comparava `String(etiqueta) === 'ETIQUETAR'`
// (case/espaço sensível), então itens da base com " Etiquetar " ou de outra
// filial desapareciam da lista.
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { normalizeTagKey } from '../services/localDbService';

describe('normalizeTagKey', () => {
  it('reconhece "ETIQUETAR" com caixa, espaço e acento variados', () => {
    expect(normalizeTagKey('ETIQUETAR')).toBe('ETIQUETAR');
    expect(normalizeTagKey(' Etiquetar ')).toBe('ETIQUETAR');
    expect(normalizeTagKey('etiquétar')).toBe('ETIQUETAR');
    expect(normalizeTagKey('Etiquetar\n')).toBe('ETIQUETAR');
  });

  it('não trata etiquetas reais como pendentes de plaqueta', () => {
    expect(normalizeTagKey('000753')).toBe('000753');
    expect(normalizeTagKey(' 000123 ')).toBe('000123');
  });

  it('serializa etiqueta vazia/nula sem estourar', () => {
    expect(normalizeTagKey('')).toBe('');
    expect(normalizeTagKey(null)).toBe('');
    expect(normalizeTagKey(undefined)).toBe('');
  });
});
