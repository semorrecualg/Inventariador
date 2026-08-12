// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { clearTenantContext, readSessionTenantId, readLocalTenantId } from '../utils/tenantUtils';

// Simula o bug real: sessão anterior deixa tenantid velho no storage (ex.: CLIENTETESTE)
// e o logout/purga não limpava — o dono global herdava o contrato errado no login.
const CONTEXT_KEYS = ['tenantid', 'tenantId', 'filial', 'unitid', 'selectedUnit', 'app_selected_unit', 'app_last_tenant'];

describe('clearTenantContext', () => {
  beforeEach(() => {
    CONTEXT_KEYS.forEach((k) => {
      sessionStorage.setItem(k, 'CLIENTETESTE');
      localStorage.setItem(k, 'CLIENTETESTE');
    });
    // Chaves fora do contexto de trabalho NÃO devem ser apagadas
    sessionStorage.setItem('app_current_user', '{"email":"x"}');
    localStorage.setItem('app_database_mode', 'SUPABASE');
  });

  it('remove o contrato/filial/unidade do sessionStorage e localStorage', () => {
    clearTenantContext();
    CONTEXT_KEYS.forEach((k) => {
      expect(sessionStorage.getItem(k), `sessionStorage.${k}`).toBeNull();
      expect(localStorage.getItem(k), `localStorage.${k}`).toBeNull();
    });
    expect(readSessionTenantId()).toBe('');
    expect(readLocalTenantId()).toBe('');
  });

  it('preserva chaves fora do contexto de trabalho (sessão e modo)', () => {
    clearTenantContext();
    expect(sessionStorage.getItem('app_current_user')).toBe('{"email":"x"}');
    expect(localStorage.getItem('app_database_mode')).toBe('SUPABASE');
  });

  it('é idempotente (não lança erro com storage vazio)', () => {
    clearTenantContext();
    clearTenantContext();
    expect(true).toBe(true);
  });
});
