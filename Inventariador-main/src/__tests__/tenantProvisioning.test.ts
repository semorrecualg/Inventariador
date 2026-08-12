// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildLicenseProvisionPlan, normalizeTenantId } from '../services/tenantProvisioningService';

const validInput = {
  clientName: 'Cicopal Goiás',
  masterEmail: 'cliente@cicopal.com.br',
  masterUsername: 'mestre.cicopal',
  masterName: 'Mestre Cicopal',
  masterPassword: 'Licenca#2026',
};

describe('tenantProvisioning — buildLicenseProvisionPlan (lógica pura)', () => {
  it('normaliza o tenantid a partir do nome do cliente (sem acentos, maiúsculo)', () => {
    expect(normalizeTenantId('Cicopal Goiás')).toBe('CICOPALGOIAS');
    expect(normalizeTenantId('  Empresa & Cia  ')).toBe('EMPRESACIA');
  });

  it('monta plano válido com perfil MASTER (is_admin, tenantid, senha forte ok)', () => {
    const plan = buildLicenseProvisionPlan(validInput, { tenants: [], emails: [], usernames: [] });
    expect(plan.valid).toBe(true);
    expect(plan.errors).toEqual([]);
    expect(plan.tenantid).toBe('CICOPALGOIAS');
    expect(plan.master).toBeDefined();
    expect(plan.master!.role).toBe('MASTER');
    expect(plan.master!.is_admin).toBe(true);
    expect(plan.master!.tenantid).toBe('CICOPALGOIAS');
    expect(plan.master!.email).toBe('cliente@cicopal.com.br');
  });

  it('rejeita tenant já provisionado', () => {
    const plan = buildLicenseProvisionPlan(validInput, {
      tenants: ['CICOPALGOIAS'],
      emails: [],
      usernames: [],
    });
    expect(plan.valid).toBe(false);
    expect(plan.errors.some((e) => e.includes('Já existe uma licença'))).toBe(true);
  });

  it('rejeita e-mail e username duplicados', () => {
    const plan = buildLicenseProvisionPlan(validInput, {
      tenants: [],
      emails: ['cliente@cicopal.com.br'],
      usernames: ['mestre.cicopal'],
    });
    expect(plan.valid).toBe(false);
    expect(plan.errors.some((e) => e.includes('já está cadastrado'))).toBe(true);
    expect(plan.errors.some((e) => e.includes('username já está em uso'))).toBe(true);
  });

  it('rejeita senha fraca e não monta o master', () => {
    const plan = buildLicenseProvisionPlan(
      { ...validInput, masterPassword: 'fraca' },
      { tenants: [], emails: [], usernames: [] },
    );
    expect(plan.valid).toBe(false);
    expect(plan.errors.some((e) => e.includes('Senha forte obrigatória'))).toBe(true);
    expect(plan.master).toBeUndefined();
  });

  it('rejeita e-mail inválido', () => {
    const plan = buildLicenseProvisionPlan(
      { ...validInput, masterEmail: 'sem-arroba' },
      { tenants: [], emails: [], usernames: [] },
    );
    expect(plan.valid).toBe(false);
    expect(plan.errors.some((e) => e.includes('E-mail do MASTER inválido'))).toBe(true);
  });

  it('rejeita sem nome de cliente', () => {
    const plan = buildLicenseProvisionPlan(
      { ...validInput, clientName: '' },
      { tenants: [], emails: [], usernames: [] },
    );
    expect(plan.valid).toBe(false);
  });

  it('normaliza email e username para minúsculas no master', () => {
    const plan = buildLicenseProvisionPlan(
      { ...validInput, masterEmail: 'CLIENTE@CICOPAL.COM.BR', masterUsername: 'Mestre.Cicopal' },
      { tenants: [], emails: [], usernames: [] },
    );
    expect(plan.valid).toBe(true);
    expect(plan.master!.email).toBe('cliente@cicopal.com.br');
    expect(plan.master!.username).toBe('mestre.cicopal');
  });
});
