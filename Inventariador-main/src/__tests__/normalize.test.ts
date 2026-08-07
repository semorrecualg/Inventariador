// src/__tests__/normalize.test.ts
// Fase C — regras canônicas de higienização (docs/PLANO_FASE_C_HIGIENIZACAO.md §1.1/§2).
import { describe, it, expect } from 'vitest';
import {
  normalizeClassK,
  normalizeClassT,
  normalizeUpperTrim,
  canonicalKey,
  normalizeNumeric,
  normalizeDateISO,
  normalizeFlag
} from '../utils/normalize';
import { CANONICAL_KEY_MAP } from '../constants/schema';

describe('normalizeClassK — regra Classe K (UPPER + TRIM + expurgo [^A-Z0-9-])', () => {
  it('aplica UPPER e TRIM e expurga tudo fora de [A-Z0-9-]', () => {
    expect(normalizeClassK(' Corredor A ')).toBe('CORREDORA');
    expect(normalizeClassK('01a-02')).toBe('01A-02');
    expect(normalizeClassK('Corredór/2')).toBe('CORREDR2'); // acento e barra expurgados (deletados, não decompostos)
    expect(normalizeClassK('SALA 3')).toBe('SALA3');
    expect(normalizeClassK('CICOPAL-GO')).toBe('CICOPAL-GO'); // hífen preservado
  });

  it('normaliza valores não-string (number)', () => {
    expect(normalizeClassK(123)).toBe('123');
    expect(normalizeClassK(0)).toBe('0');
  });

  it('trata null/undefined/empty', () => {
    expect(normalizeClassK(null)).toBeNull();
    expect(normalizeClassK(undefined)).toBeNull();
    expect(normalizeClassK('')).toBe('');
  });
});

describe('normalizeClassT — regra Classe T (caixa preservada + colapso de espaços)', () => {
  it('preserva caixa e colapsa espaços', () => {
    expect(normalizeClassT('  Microcomputador   HP  ')).toBe('Microcomputador HP');
    expect(normalizeClassT('Pendente')).toBe('Pendente');
  });

  it('trata null/undefined', () => {
    expect(normalizeClassT(null)).toBeNull();
    expect(normalizeClassT(undefined)).toBeNull();
  });
});

describe('normalizeUpperTrim — UPPER + TRIM com espaços internos preservados (filial)', () => {
  it('preserva espaços internos de nomes físicos', () => {
    expect(normalizeUpperTrim('010101 CICOPAL GO')).toBe('010101 CICOPAL GO');
    expect(normalizeUpperTrim('  filial a ')).toBe('FILIAL A');
  });

  it('trata null/undefined', () => {
    expect(normalizeUpperTrim(null)).toBeNull();
    expect(normalizeUpperTrim(undefined)).toBeNull();
  });
});

describe('canonicalKey — resolução de variantes para o canônico minúsculo', () => {
  it('mapeia variantes UPPER/mixed para o canônico', () => {
    expect(canonicalKey('ENDERECO')).toBe('endereco');
    expect(canonicalKey('Endereço')).toBe('endereco');
    expect(canonicalKey('DATAAQUSIC')).toBe('dataaqusic'); // typo histórico
    expect(canonicalKey('Sn1_recno')).toBe('sn1_recno');
    expect(canonicalKey('conta_contabil')).toBe('contacontabil');
    expect(canonicalKey('etiqueta')).toBe('etiqueta'); // canônico já é identidade
  });

  it('retorna a chave como está quando desconhecida (identidade — nunca quebra)', () => {
    expect(canonicalKey('CAMPO_DESCONHECIDO')).toBe('CAMPO_DESCONHECIDO');
    expect(canonicalKey('')).toBe('');
  });

  it('CANONICAL_KEY_MAP: todo canônico do contrato mapeia para si mesmo via UPPER', () => {
    const contractCanonicals = [
      'filial', 'etiqueta', 'tag', 'status', 'qt', 'descricaodoativo', 'serial',
      'dataaqusic', 'databaixa', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco',
      'registro', 'subreg', 'contacontabil', 'primarykey', 'centrodecusto',
      'vlraquisic', 'sn1_recno', 'sn3_recno'
    ];
    for (const canonical of contractCanonicals) {
      expect(CANONICAL_KEY_MAP[canonical.toUpperCase()], `variante ausente: ${canonical}`).toBe(canonical);
    }
  });

  it('CANONICAL_KEY_MAP: valores são sempre minúsculos (sem grafia dupla no alvo)', () => {
    for (const [variant, target] of Object.entries(CANONICAL_KEY_MAP)) {
      expect(target, `alvo não-canônico para ${variant}`).toBe(target.toLowerCase());
    }
  });
});

describe('normalizeNumeric — Classe N (coerção numérica segura, nunca NaN)', () => {
  it('converte números e strings numéricas', () => {
    expect(normalizeNumeric(1500)).toBe(1500);
    expect(normalizeNumeric('12')).toBe(12);
    expect(normalizeNumeric('1500,50'.replace(',', '.'))).toBe(1500.5);
    expect(normalizeNumeric(0)).toBe(0);
  });

  it('retorna null para inválidos/null/undefined/vazio (nunca NaN)', () => {
    expect(normalizeNumeric('abc')).toBeNull();
    expect(normalizeNumeric(NaN)).toBeNull();
    expect(normalizeNumeric(Infinity)).toBeNull();
    expect(normalizeNumeric(null)).toBeNull();
    expect(normalizeNumeric(undefined)).toBeNull();
    expect(normalizeNumeric('')).toBeNull();
  });
});

describe('normalizeDateISO — Classe D (canônico YYYY-MM-DD)', () => {
  it('converte dd/mm/yyyy e dd-mm-yyyy para ISO', () => {
    expect(normalizeDateISO('01/01/2023')).toBe('2023-01-01');
    expect(normalizeDateISO('31/12/2024')).toBe('2024-12-31');
    expect(normalizeDateISO('1/2/2023')).toBe('2023-02-01');
    expect(normalizeDateISO('01-01-2023')).toBe('2023-01-01');
    expect(normalizeDateISO('01/01/23')).toBe('2023-01-01');
  });

  it('mantém ISO já canônica (trunca hora se existir)', () => {
    expect(normalizeDateISO('2023-01-01')).toBe('2023-01-01');
    expect(normalizeDateISO('2023-01-01T10:00:00Z')).toBe('2023-01-01');
  });

  it('rejeita datas inválidas no round-trip e preserva o original', () => {
    expect(normalizeDateISO('31/02/2023')).toBe('31/02/2023'); // fevereiro não tem 31
    expect(normalizeDateISO('texto-livre')).toBe('texto-livre'); // não-parseável preservado
  });

  it('trata null/undefined/vazio', () => {
    expect(normalizeDateISO(null)).toBeNull();
    expect(normalizeDateISO(undefined)).toBeNull();
    expect(normalizeDateISO('   ')).toBeNull();
  });
});

describe('normalizeFlag — Classe F (unifica 0|1, true|false e strings)', () => {
  it('reconhece formas verdadeiras', () => {
    expect(normalizeFlag(1)).toBe(true);
    expect(normalizeFlag(true)).toBe(true);
    expect(normalizeFlag('1')).toBe(true);
    expect(normalizeFlag('true')).toBe(true);
  });

  it('reconhece formas falsas', () => {
    expect(normalizeFlag(0)).toBe(false);
    expect(normalizeFlag(false)).toBe(false);
    expect(normalizeFlag('0')).toBe(false);
    expect(normalizeFlag('false')).toBe(false);
    expect(normalizeFlag(null)).toBe(false);
    expect(normalizeFlag(undefined)).toBe(false);
  });
});
