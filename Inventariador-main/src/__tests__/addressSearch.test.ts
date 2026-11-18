// @vitest-environment jsdom
// src/__tests__/addressSearch.test.ts
// Busca do ENDEREÇO FÍSICO (AddressSelector) e do filtro de localidade do
// inventário. Bug real: `getLocationsWithStats` filtrava com `startsWith`
// case-sensitive e, no fallback (tabela `addresses` vazia), comparava o
// endereço em MAIÚSCULAS com o termo em minúsculas — digitar "CONTAB" e
// pressionar Enter devolvia "Nenhum Endereço Cadastrado".
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import {
  getCurrentTenantid,
  matchesAddressSearch,
  normalizeAddressSearch,
  normalizeUnitMatchKey
} from '../services/localDbService';

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

describe('filial e contrato da tela de endereço', () => {
  it('trata a mesma filial com espaço, `_`, `-`, caixa e acentos', () => {
    const chave = normalizeUnitMatchKey('010101 CICOPAL GO');
    expect(normalizeUnitMatchKey('010101_CICOPAL_GO')).toBe(chave);
    expect(normalizeUnitMatchKey('010101-Cicopal-Go')).toBe(chave);
    expect(normalizeUnitMatchKey('  010101   CICOPAL   GO  ')).toBe(chave);
    expect(normalizeUnitMatchKey('010101 CICÓPAL GO')).toBe(chave);
    expect(normalizeUnitMatchKey('010201 SNACKS PA')).not.toBe(chave);
  });

  it('resolve o contrato pelo perfil, pela sessão ou pelo armazenamento', () => {
    // Regressão: o dono global não declara tenantid no perfil. A leitura
    // parava no utilizador, o contrato ia vazio para as consultas
    // [tenantid+filial] e o ecrã dizia «Nenhum Endereço Cadastrado».
    sessionStorage.clear();
    localStorage.removeItem('tenantid');
    localStorage.removeItem('tenantId');
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'admin@x.com', role: 'ADMIN' }));
    expect(getCurrentTenantid()).toBe('');

    sessionStorage.setItem('tenantid', 'CICOPAL');
    expect(getCurrentTenantid()).toBe('CICOPAL');

    // Contrato no perfil vence a sessão.
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'a@b.com', tenantid: 'DEMO_DEFAULT' }));
    expect(getCurrentTenantid()).toBe('DEMO_DEFAULT');

    // Valores sentinela não são contrato.
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'a@b.com', tenantid: 'NULL' }));
    sessionStorage.setItem('tenantid', 'UNDEFINED');
    localStorage.setItem('tenantid', 'CICOPAL');
    expect(getCurrentTenantid()).toBe('CICOPAL');

    sessionStorage.clear();
    localStorage.removeItem('tenantid');
  });
});
