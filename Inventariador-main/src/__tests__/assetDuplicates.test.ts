// src/__tests__/assetDuplicates.test.ts
// Alerta de duplicidade de serial no cadastro manual de NOVO ITEM.
import { describe, it, expect } from 'vitest';
import { Asset } from '../types';
import { normalizeSerial, findSerialDuplicates } from '../utils/assetDuplicates';

const asset = (patch: Partial<Asset> = {}): Asset => ({
  id: 'a1',
  etiqueta: '000123',
  descricaodoativo: 'COMPRESSOR',
  serial: 'SM-01',
  ...patch
} as Asset);

describe('normalizeSerial', () => {
  it('ignora caixa, acentos, espaços e separadores', () => {
    expect(normalizeSerial(' sm-01 ')).toBe('SM01');
    expect(normalizeSerial('SÉRIE 42')).toBe('SERIE42');
  });
});

describe('findSerialDuplicates', () => {
  it('encontra ativo com o mesmo serial escrito de outra forma', () => {
    const duplicates = findSerialDuplicates('sm 01', [asset(), asset({ id: 'a2', etiqueta: '000999', serial: 'OUTRO' })]);
    expect(duplicates.map(a => a.etiqueta)).toEqual(['000123']);
  });

  it('ignora o próprio registro em edição', () => {
    expect(findSerialDuplicates('SM-01', [asset()], 'a1')).toEqual([]);
  });

  it('ignora serial vazio ou residual', () => {
    expect(findSerialDuplicates('', [asset({ serial: '' })])).toEqual([]);
    expect(findSerialDuplicates('1', [asset({ serial: '1' })])).toEqual([]);
  });

  it('não alerta quando os seriais são diferentes', () => {
    expect(findSerialDuplicates('SM-02', [asset()])).toEqual([]);
  });
});
