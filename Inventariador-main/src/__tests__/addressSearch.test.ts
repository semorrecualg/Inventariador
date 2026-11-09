// src/__tests__/addressSearch.test.ts
// Busca do ENDEREÇO FÍSICO (AddressSelector) e do filtro de localidade do
// inventário. Bug real: `getLocationsWithStats` filtrava com `startsWith`
// case-sensitive e, no fallback (tabela `addresses` vazia), comparava o
// endereço em MAIÚSCULAS com o termo em minúsculas — digitar "CONTAB" e
// pressionar Enter devolvia "Nenhum Endereço Cadastrado".
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { matchesAddressSearch, normalizeAddressSearch } from '../services/localDbService';

describe('busca de endereço/localidade', () => {
  it('encontra o termo em qualquer posição do endereço (não só no início)', () => {
    expect(matchesAddressSearch('151200 CONTABILIDADE - CDC 70104', 'CONTAB')).toBe(true);
    expect(matchesAddressSearch('151200 CONTABILIDADE - CDC 70104', 'contab')).toBe(true);
    expect(matchesAddressSearch('151100 PRODUCAO - PV1 MILHO', 'PRODUCAO')).toBe(true);
    expect(matchesAddressSearch('151100 PRODUCAO - PV1 MILHO', 'PV1')).toBe(true);
  });

  it('ignora acentos nos dois lados', () => {
    expect(matchesAddressSearch('151200 CONTABILIDADE', 'contabilidade')).toBe(true);
    expect(matchesAddressSearch('151100 PRODUÇÃO - PV1', 'producao')).toBe(true);
    expect(matchesAddressSearch('151100 PRODUCAO - PV1', 'produção')).toBe(true);
    expect(matchesAddressSearch('ADMINISTRAÇÃO CENTRAL', 'administracao')).toBe(true);
  });

  it('não casa endereço diferente', () => {
    expect(matchesAddressSearch('151100 PRODUCAO - PV1', 'CONTAB')).toBe(false);
    expect(matchesAddressSearch('', 'CONTAB')).toBe(false);
  });

  it('termo vazio não filtra e espaços extras são normalizados', () => {
    expect(matchesAddressSearch('QUALQUER ENDEREÇO', '')).toBe(true);
    expect(matchesAddressSearch('QUALQUER ENDEREÇO', '   ')).toBe(true);
    expect(matchesAddressSearch('151200 CONTABILIDADE', '  contab  ')).toBe(true);
    expect(normalizeAddressSearch('  151200   CONTABILIDADE  ')).toBe('151200 CONTABILIDADE');
  });
});
