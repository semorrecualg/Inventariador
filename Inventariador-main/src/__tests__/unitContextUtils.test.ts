import { describe, it, expect } from 'vitest';
import {
  unitContextKey,
  splitUnitContextKey,
  matchTenantUnit,
  findHomonymUnits,
  resolveUnitFilter,
  resolveBootUnitFilter,
  resolveBootPullPlan,
  normalizeUnitNames
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

describe('resolveBootUnitFilter — carga inicial com última escolha (Etapa 5a)', () => {
  const lastCtx = { tenantid: 'CICOPAL', filial: '010201 SNACKS PA' };

  it('filial real do perfil VENCE a última escolha (auditor mantém a própria filial)', () => {
    expect(resolveBootUnitFilter('010301 FEIRA BOA BA', lastCtx, 'CICOPAL')).toBe('010301 FEIRA BOA BA');
  });

  it('perfil TODAS + última escolha do MESMO contrato → usa a filial escolhida', () => {
    expect(resolveBootUnitFilter('TODAS', lastCtx, 'CICOPAL')).toBe('010201 SNACKS PA');
  });

  it('perfil TODAS + última escolha de OUTRO contrato → undefined (muro SRE: contrato inteiro)', () => {
    expect(resolveBootUnitFilter('TODAS', lastCtx, 'CLIENTETESTE')).toBeUndefined();
  });

  it('perfil TODAS + sem última escolha → undefined (contrato inteiro, comportamento atual)', () => {
    expect(resolveBootUnitFilter('TODAS', null, 'CICOPAL')).toBeUndefined();
    expect(resolveBootUnitFilter('TODAS', undefined, 'CICOPAL')).toBeUndefined();
  });

  it('perfil TODAS + última escolha sem filial/sentinela → undefined', () => {
    expect(resolveBootUnitFilter('TODAS', { tenantid: 'CICOPAL', filial: '' }, 'CICOPAL')).toBeUndefined();
    expect(resolveBootUnitFilter('TODAS', { tenantid: 'CICOPAL', filial: 'TODAS' }, 'CICOPAL')).toBeUndefined();
  });

  it('normaliza caixa/trim do contrato e da filial da última escolha', () => {
    expect(resolveBootUnitFilter('todas', { tenantid: '  cicopal ', filial: ' 010201 snacks pa ' }, 'CICOPAL')).toBe('010201 SNACKS PA');
  });

  it('sem contrato no usuário + última escolha → usa a última escolha (tolerância)', () => {
    expect(resolveBootUnitFilter('TODAS', lastCtx, '')).toBe('010201 SNACKS PA');
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

describe('resolveBootPullPlan — o boot nunca baixa o contrato inteiro', () => {
  it('filial real no perfil → baixa só essa filial', () => {
    const plano = resolveBootPullPlan('010201 snacks pa', null, 'CICOPAL');
    expect(plano).toEqual({ unit: '010201 SNACKS PA', requiresUnitSelection: false });
  });

  it('perfil TODAS + última escolha do MESMO contrato → baixa só a filial escolhida', () => {
    const plano = resolveBootPullPlan('TODAS', { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' }, 'CICOPAL');
    expect(plano.unit).toBe('010101 CICOPAL GO');
    expect(plano.requiresUnitSelection).toBe(false);
  });

  it('sem filial e sem última escolha → NÃO baixa nada e exige a escolha', () => {
    expect(resolveBootPullPlan('TODAS', null, 'CICOPAL'))
      .toEqual({ requiresUnitSelection: true });
    expect(resolveBootPullPlan(null, null, 'CICOPAL').unit).toBeUndefined();
    expect(resolveBootPullPlan(undefined, null, 'CICOPAL').requiresUnitSelection).toBe(true);
  });

  it('última escolha de OUTRO contrato não serve (muro multi-tenant)', () => {
    const plano = resolveBootPullPlan('', { tenantid: 'CLIENTETESTE', filial: '010101 CICOPAL GO' }, 'CICOPAL');
    expect(plano).toEqual({ requiresUnitSelection: true });
  });

  it('última escolha com sentinela (TODAS/NULL) não serve', () => {
    expect(resolveBootPullPlan('TODAS', { tenantid: 'CICOPAL', filial: 'TODAS' }, 'CICOPAL'))
      .toEqual({ requiresUnitSelection: true });
    expect(resolveBootPullPlan('', { tenantid: 'CICOPAL', filial: '' }, 'CICOPAL'))
      .toEqual({ requiresUnitSelection: true });
  });

  it('nunca devolve plano de pull sem unidade', () => {
    const casos = [
      resolveBootPullPlan(null, null, null),
      resolveBootPullPlan('TODAS', null, 'CICOPAL'),
      resolveBootPullPlan('', { tenantid: 'OUTRO', filial: '010101 CICOPAL GO' }, 'CICOPAL'),
    ];
    for (const plano of casos) {
      expect(plano.unit).toBeUndefined();
      expect(plano.requiresUnitSelection).toBe(true);
    }
  });
});

describe('normalizeUnitNames — lista de filiais vinda da nuvem (sem ativos)', () => {
  it('normaliza caixa/espaços e remove duplicados', () => {
    expect(normalizeUnitNames([
      { filial: '010101 cicopal go' },
      { filial: '  010101   CICOPAL GO ' },
      { filial: '010201 snacks pa' }
    ])).toEqual(['010101 CICOPAL GO', '010201 SNACKS PA']);
  });

  it('descarta sentinelas e vazios', () => {
    expect(normalizeUnitNames([
      { filial: '' }, { filial: null }, { filial: 'TODAS' }, { filial: 'NULL' },
      { filial: 'UNDEFINED' }, { filial: '0' }, { filial: 'DEFAULT' },
      { filial: 'SEM FILIAL' }, { filial: 'FILIAL X' }
    ])).toEqual(['FILIAL X']);
  });

  it('aceita strings soltas e ignora nulos da lista', () => {
    expect(normalizeUnitNames(['filial y', null, undefined, 'FILIAL X']))
      .toEqual(['FILIAL X', 'FILIAL Y']);
  });

  it('lista vazia permanece vazia', () => {
    expect(normalizeUnitNames([])).toEqual([]);
    expect(normalizeUnitNames([{ filial: '   ' }])).toEqual([]);
  });

  it('ordena para a tela de seleção não dançar entre cargas', () => {
    expect(normalizeUnitNames(['B', 'A', 'C'])).toEqual(['A', 'B', 'C']);
  });
});
