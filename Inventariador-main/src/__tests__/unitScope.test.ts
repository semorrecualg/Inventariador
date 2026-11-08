// src/__tests__/unitScope.test.ts
// Escopo de unidades do perfil: a restrição do auditor tem de valer IGUAL na
// nuvem e na BASE LOCAL. Estes testes fixam a regra única (utils/unitScope).
import { describe, it, expect } from 'vitest';
import { getUnitScopeKeys, isAuditorScope, isUnitInScope } from '../utils/unitScope';

const auditor = (units: string[], tenantid = 'CICOPAL') => ({
  role: 'AUDITOR',
  tenantid,
  units
});

describe('isUnitInScope — restrição de unidades do perfil', () => {
  it('auditor com 1 unidade só entra naquela filial', () => {
    const user = auditor(['010103 CICOPAL SP']);
    expect(isUnitInScope(user, '010103 CICOPAL SP', 'CICOPAL')).toBe(true);
    expect(isUnitInScope(user, '010102 CICOPAL MG', 'CICOPAL')).toBe(false);
    expect(isUnitInScope(user, '010104 CICOPAL GO', 'CICOPAL')).toBe(false);
  });

  it('auditor contratado para várias filiais entra em todas as dele', () => {
    const user = auditor(['010102 CICOPAL MG', '010104 CICOPAL GO']);
    expect(isUnitInScope(user, '010102 CICOPAL MG', 'CICOPAL')).toBe(true);
    expect(isUnitInScope(user, '010104 CICOPAL GO', 'CICOPAL')).toBe(true);
    expect(isUnitInScope(user, '010103 CICOPAL SP', 'CICOPAL')).toBe(false);
  });

  it('grafia da base não engana a trava (caixa, espaço duplo, underscore)', () => {
    const user = auditor(['010103 CICOPAL SP']);
    expect(isUnitInScope(user, '010103  cicopal   sp', 'CICOPAL')).toBe(true);
    expect(isUnitInScope(user, '010103_CICOPAL_SP', 'CICOPAL')).toBe(true);
  });

  it('AUXILIARY_AUDITOR segue a mesma regra', () => {
    const user = { role: 'AUXILIARY_AUDITOR', tenantid: 'CICOPAL', units: ['010102 CICOPAL MG'] };
    expect(isAuditorScope(user)).toBe(true);
    expect(isUnitInScope(user, '010102 CICOPAL MG', 'CICOPAL')).toBe(true);
    expect(isUnitInScope(user, '010103 CICOPAL SP', 'CICOPAL')).toBe(false);
  });

  it('admin e gestor operam o contrato inteiro (sem trava)', () => {
    for (const role of ['ADMIN', 'MASTER', 'GESTOR']) {
      const user = { role, tenantid: 'CICOPAL', units: ['010103 CICOPAL SP'] };
      expect(isAuditorScope(user)).toBe(false);
      expect(isUnitInScope(user, '010102 CICOPAL MG', 'CICOPAL')).toBe(true);
    }
  });

  it('auditor sem unidade declarada não tem trava explícita (nada muda)', () => {
    const user = { role: 'AUDITOR', tenantid: '', units: [] };
    expect(getUnitScopeKeys(user, '')).toEqual([]);
    expect(isUnitInScope(user, '010102 CICOPAL MG', '')).toBe(true);
  });

  it('auditor preso ao contrato (sem units) não abre filiais do contrato', () => {
    const user = { role: 'AUDITOR', tenantid: 'CICOPAL', units: [] };
    expect(getUnitScopeKeys(user, 'CICOPAL')).toEqual(['CICOPAL']);
    expect(isUnitInScope(user, '010102 CICOPAL MG', 'CICOPAL')).toBe(false);
  });

  it('perfil nulo/vazio não quebra a tela', () => {
    expect(isUnitInScope(null, '010102 CICOPAL MG', 'CICOPAL')).toBe(true);
    expect(isUnitInScope(undefined, '', '')).toBe(true);
  });
});
