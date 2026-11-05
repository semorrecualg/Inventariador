// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveWorkingTenantId } from '../utils/tenantUtils';

// Bug real: o admin global (admin/admin) não tem tenantid no perfil. A criação
// de campanha olhava só `propsTenantid || user.tenantid`, via o contrato vazio e
// bloqueava com "ERRO DE GOVERNANÇA: Tenant não identificado", mesmo com a filial
// de trabalho (que pertence a um contrato real) já selecionada.
describe('resolveWorkingTenantId', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('prioriza o contrato do perfil do usuário', () => {
    sessionStorage.setItem('tenantid', 'CICOPAL');
    expect(resolveWorkingTenantId({ email: 'master@cliente.com', tenantid: 'CLIENTETESTE' })).toBe('CLIENTETESTE');
  });

  it('cai para o contrato da sessão quando o perfil é o admin global (sem tenantid)', () => {
    sessionStorage.setItem('tenantid', 'CICOPAL');
    expect(resolveWorkingTenantId({ email: 'admin', role: 'ADMIN', tenantid: '' })).toBe('CICOPAL');
  });

  it('usa o storage local como último recurso', () => {
    localStorage.setItem('tenantid', 'CICOPAL');
    expect(resolveWorkingTenantId({ email: 'admin', tenantid: '' })).toBe('CICOPAL');
  });

  it('retorna vazio (e não uma sentinela) quando nada foi resolvido', () => {
    sessionStorage.setItem('tenantid', 'NULL');
    localStorage.setItem('tenantid', 'UNDEFINED');
    expect(resolveWorkingTenantId({ email: 'admin', tenantid: 'N/A' })).toBe('');
  });
});
