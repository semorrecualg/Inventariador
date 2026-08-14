import { describe, it, expect } from 'vitest';
import {
  unitContextKey,
  splitUnitContextKey,
  matchTenantUnit,
  findHomonymUnits,
  resolveUnitFilter
} from '../utils/unitContextUtils';

describe('resolveUnitFilter — filtro de filial dos pulls do fluxo inicial (Etapa 2)', () => {
  it('filial real do perfil → filtro em UPPER/trim (baixa só a filial)', () => {
    expect(resolveUnitFilter('010201 snacks pa')).toBe('010201 SNACKS PA');
  });

  it('sem filial / vazio → undefined (baixa o contrato inteiro)', () => {
    expect(resolveUnitFilter('')).toBeUndefined();
    expect(resolveUnitFilter(null)).toBeUndefined();
    expect(resolveUnitFilter(undefined)).toBeUndefined();
    expect(resolveUnitFilter('   ')).toBeUndefined();
  });

  it('sentinelas TODAS/NULL/UNDEFINED → undefined (sem filtro)', () => {
    expect(resolveUnitFilter('TODAS')).toBeUndefined();
    expect(resolveUnitFilter('todas')).toBeUndefined();
    expect(resolveUnitFilter('NULL')).toBeUndefined();
    expect(resolveUnitFilter('undefined')).toBeUndefined();
  });
});

describe('unitContextUtils — muro multi-tenant de Unidades Operacionais', () => {
  it('unitContextKey monta a chave composta [tenantid+filial] em UPPER/trim', () => {
    expect(unitContextKey('cicopal', '010201 SNACKS PA')).toBe('CICOPAL|010201 SNACKS PA');
    expect(unitContextKey('  ', '  Filial X ')).toBe('|FILIAL X');
  });

  it('splitUnitContextKey inverte a chave composta', () => {
    expect(splitUnitContextKey('CICOPAL|010201 SNACKS PA')).toEqual({
      tenantid: 'CICOPAL',
      filial: '010201 SNACKS PA'
    });
    expect(splitUnitContextKey('010201 SNACKS PA')).toEqual({
      tenantid: '',
      filial: '010201 SNACKS PA'
    });
  });

  it('matchTenantUnit exige o mesmo tenant quando ambos os lados têm contrato', () => {
    // Mesmo nome + mesmo tenant → casa
    expect(matchTenantUnit('CICOPAL', '010201 SNACKS PA', 'CICOPAL', '010201 SNACKS PA')).toBe(true);
    // Mesmo nome + tenants diferentes → NÃO casa (o muro)
    expect(matchTenantUnit('CICOPAL', '010201 SNACKS PA', 'CLIENTETESTE', '010201 SNACKS PA')).toBe(false);
    // Tenant vazio de um lado → tolerância por nome
    expect(matchTenantUnit('', '010201 SNACKS PA', 'CICOPAL', '010201 SNACKS PA')).toBe(true);
    // Prefixo numérico resiliente dentro do mesmo tenant
    expect(matchTenantUnit('CICOPAL', '010101 CICOPAL GO', 'CICOPAL', '010101')).toBe(true);
  });

  it('findHomonymUnits detecta apenas filiais presentes em mais de um tenant', () => {
    const units = [
      { filial: '010201 SNACKS PA', tenantid: 'CICOPAL' },
      { filial: '010201 SNACKS PA', tenantid: 'CLIENTETESTE' },
      { filial: '010101 CICOPAL GO', tenantid: 'CICOPAL' }
    ];
    const homonyms = findHomonymUnits(units);
    expect(homonyms.has('010201 SNACKS PA')).toBe(true);
    expect(homonyms.has('010101 CICOPAL GO')).toBe(false);
  });

  it('findHomonymUnits considera sem-contrato um tenant distinto', () => {
    const homonyms = findHomonymUnits([
      { filial: 'FILIAL X', tenantid: '' },
      { filial: 'FILIAL X', tenantid: 'CICOPAL' }
    ]);
    expect(homonyms.has('FILIAL X')).toBe(true);
  });
});
