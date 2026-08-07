// src/__tests__/loaderNormalization.test.ts
// Fase C M1 — regra por classe aplicada na carga (DatabaseLoaderService).
// docs/PLANO_FASE_C_HIGIENIZACAO.md §3.1 (M1) e §3.4 (desvios SRE).
import { describe, it, expect } from 'vitest';
import { normalizeFieldValue } from '../utils/normalize';

describe('normalizeFieldValue — regra por classe (M1 carga)', () => {
  it('Classe K código: UPPER + TRIM + expurgo [^A-Z0-9-]', () => {
    expect(normalizeFieldValue('endereco', ' Corredor A ')).toBe('CORREDORA');
    expect(normalizeFieldValue('serial', ' ab-c1 ')).toBe('AB-C1');
    expect(normalizeFieldValue('registro', 'REG- x ')).toBe('REG-X');
    expect(normalizeFieldValue('subreg', ' s1 ')).toBe('S1');
    expect(normalizeFieldValue('contacontabil', '1.2.3.4')).toBe('1234');
    expect(normalizeFieldValue('centrodecusto', ' cc-01 ')).toBe('CC-01');
    expect(normalizeFieldValue('cnpj', '12.345.678/0001-90')).toBe('123456780001-90');
    expect(normalizeFieldValue('notafiscal', 'nf 2023/01')).toBe('NF202301');
  });

  it('filial: UPPER + TRIM preservando espaços internos (nomes físicos)', () => {
    expect(normalizeFieldValue('filial', '010101 CICOPAL GO')).toBe('010101 CICOPAL GO');
    expect(normalizeFieldValue('filial', '  filial a ')).toBe('FILIAL A');
  });

  it('Classe T: caixa preservada + colapso de espaços (status decide §9.3)', () => {
    expect(normalizeFieldValue('status', ' Pendente ')).toBe('Pendente');
    expect(normalizeFieldValue('descricaodoativo', '  Microcomputador   HP ')).toBe('Microcomputador HP');
    expect(normalizeFieldValue('nomefornecedor', ' Dell ')).toBe('Dell');
  });

  it('Identidade/PK: TRIM apenas em C1 — caixa preservada (política na C4)', () => {
    expect(normalizeFieldValue('etiqueta', ' abc-1 ')).toBe('abc-1');
    expect(normalizeFieldValue('tag', ' PLAQUETA-2 ')).toBe('PLAQUETA-2');
    expect(normalizeFieldValue('primarykey', ' PK-01 ')).toBe('PK-01');
  });

  it('N/D (C3): apenas TRIM — sem case nem expurgo', () => {
    expect(normalizeFieldValue('dataaqusic', ' 01/01/2023 ')).toBe('01/01/2023');
    expect(normalizeFieldValue('databaixa', ' 31/12/2024 ')).toBe('31/12/2024');
    expect(normalizeFieldValue('vlraquisic', ' 1500,50 ')).toBe('1500,50');
  });

  it('null/undefined/vazio → null (semântica de campo ausente do Dexie)', () => {
    expect(normalizeFieldValue('endereco', null)).toBeNull();
    expect(normalizeFieldValue('endereco', undefined)).toBeNull();
    expect(normalizeFieldValue('endereco', '   ')).toBeNull();
  });
});
