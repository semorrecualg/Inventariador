// src/__tests__/consultationFilters.test.ts
// FICHA DO ATIVO: busca por patrimônio devolvia "Nenhum registro" para ativos
// que existem na base (ex.: 000753) porque o filtro lia `asset['ETIQUETA']`
// enquanto o ativo guarda a chave canônica `etiqueta`.
import { describe, it, expect } from 'vitest';
import { Asset, SearchFilters } from '../types';
import {
  matchesConsultationFilters,
  matchesFilterTerm,
  normalizeSearchFilters
} from '../utils/consultationFilters';

const filters = (patch: Partial<SearchFilters> = {}): SearchFilters =>
  normalizeSearchFilters({ ...patch });

const asset = (patch: Partial<Asset> = {}): Asset => ({
  id: 'a1',
  etiqueta: '000753',
  descricaodoativo: 'EMPACT MASIPACK UFAST 540065 20120272',
  serial: 'SM01-EVR-01',
  conta_contabil: '101010',
  centrodecusto: 'CICOPAL GO',
  ...patch
} as Asset);

describe('matchesConsultationFilters', () => {
  it('encontra o ativo pelo patrimônio digitado em UPPER (bug 000753)', () => {
    expect(matchesConsultationFilters(asset(), filters({ ETIQUETA: '000753' }))).toBe(true);
  });

  it('compara patrimônio numérico ignorando zeros à esquerda', () => {
    expect(matchesConsultationFilters(asset(), filters({ ETIQUETA: '753' }))).toBe(true);
    expect(matchesConsultationFilters(asset({ etiqueta: '753' }), filters({ ETIQUETA: '000753' }))).toBe(true);
  });

  it('busca descrição sem diferenciar caixa nem acentos', () => {
    expect(matchesConsultationFilters(asset(), filters({ DESCRICAODOATIVO: 'masipack' }))).toBe(true);
    expect(
      matchesConsultationFilters(asset({ descricaodoativo: 'COMPRESSOR DE AR' }), filters({ DESCRICAODOATIVO: 'compressão' }))
    ).toBe(false);
    expect(
      matchesConsultationFilters(asset({ descricaodoativo: 'MANUTENÇÃO PREVENTIVA' }), filters({ DESCRICAODOATIVO: 'manutencao' }))
    ).toBe(true);
  });

  it('casa chaves com separadores diferentes (conta_contabil)', () => {
    expect(matchesConsultationFilters(asset(), filters({ conta_contabil: '101010' }))).toBe(true);
    expect(matchesConsultationFilters(asset(), filters({ CENTRODECUSTO: 'cicopal' }))).toBe(true);
  });

  it('não restringe quando o filtro está vazio e não devolve falso positivo', () => {
    expect(matchesConsultationFilters(asset(), filters())).toBe(true);
    expect(matchesConsultationFilters(asset(), filters({ ETIQUETA: '000999' }))).toBe(false);
  });
});

describe('matchesFilterTerm', () => {
  it('encontra o termo em qualquer posição do endereço', () => {
    expect(matchesFilterTerm('151200 CONTABILIDADE - CDC', 'contab')).toBe(true);
    expect(matchesFilterTerm('151200 CONTABILIDADE - CDC', 'expedicao')).toBe(false);
  });

  it('não confunde número embutido em texto com patrimônio', () => {
    expect(matchesFilterTerm('EMPACT 20120272', '753')).toBe(false);
  });
});

describe('normalizeSearchFilters', () => {
  it('migra chaves legadas minúsculas para o contrato UPPER', () => {
    const migrated = normalizeSearchFilters({ etiqueta: '000753', descricaodoativo: 'MASIPACK' });
    expect(migrated.ETIQUETA).toBe('000753');
    expect(migrated.DESCRICAODOATIVO).toBe('MASIPACK');
    expect(migrated.SERIAL).toBe('');
  });

  it('descarta chaves fora do contrato e tolera entrada inválida', () => {
    expect(normalizeSearchFilters({ lixo: 'x' })).toEqual(normalizeSearchFilters(null));
    expect(normalizeSearchFilters(null).ETIQUETA).toBe('');
  });
});
