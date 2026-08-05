import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applyMasterDriveSession } from '../utils/authUtils';

/**
 * Testes de integração para os side effects do fluxo MASTER_DRIVE.
 *
 * Em vez de depender de jsdom (não disponível no ambiente Node), os
 * testes usam mocks manuais de sessionStorage/localStorage para
 * validar que:
 * - sessionStorage.clear() é chamado no início
 * - Tokens corretos são definidos (gbr_admin_scope, tenantid)
 * - Roteamento atômico é gravado (gbr_kardek_history)
 * - Nenhum side effect ocorre para credenciais incorretas
 */

// ── Mock manual de storages ──
const mockSessionStorage = new Map<string, string>();
const mockLocalStorage = new Map<string, string>();

// Substitui storages reais por mocks antes de cada teste
const setupStorageMocks = () => {
  mockSessionStorage.clear();
  mockLocalStorage.clear();

  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => mockSessionStorage.get(k) ?? null,
    setItem: (k: string, v: string) => mockSessionStorage.set(k, v),
    removeItem: (k: string) => mockSessionStorage.delete(k),
    clear: () => mockSessionStorage.clear(),
    get length() { return mockSessionStorage.size; },
    key: (i: number) => [...mockSessionStorage.keys()][i] ?? null,
  });

  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mockLocalStorage.get(k) ?? null,
    setItem: (k: string, v: string) => mockLocalStorage.set(k, v),
    removeItem: (k: string) => mockLocalStorage.delete(k),
    clear: () => mockLocalStorage.clear(),
    get length() { return mockLocalStorage.size; },
    key: (i: number) => [...mockLocalStorage.keys()][i] ?? null,
  });
};

describe('MASTER_DRIVE — integrate (sessionStorage side effects)', () => {
  beforeEach(() => {
    setupStorageMocks();
  });

  // ── Cenário 4: sessionStorage ──
  it('limpa sessionStorage e define tokens após MASTER_DRIVE bem-sucedido', () => {
    // Simula sessão anterior com dados residuais
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'old@test.com' }));
    sessionStorage.setItem('tenantid', 'OLD_TENANT');
    sessionStorage.setItem('gbr_admin_scope', 'OLD_SCOPE');
    expect(sessionStorage.length).toBeGreaterThanOrEqual(3);

    const result = applyMasterDriveSession('Glaucio@1970', 'admin');

    expect(result.isMaster).toBe(true);
    expect(result.masterUser).toBeDefined();

    // sessionStorage DEVE estar limpo
    expect(sessionStorage.getItem('app_current_user')).toBeNull();

    // Tokens do MASTER_DRIVE devem estar definidos
    expect(sessionStorage.getItem('gbr_admin_scope')).toBe('GLOBAL_SUPER_ADMIN');
    expect(sessionStorage.getItem('tenantid')).toBe('GBR_SUPER_ADMIN_CORINGA');

    // localStorage deve ter o histórico de roteamento
    const history = localStorage.getItem('gbr_kardek_history');
    expect(history).toBeTruthy();
    expect(JSON.parse(history!)).toEqual(['LOGIN', 'DATABASE_MANAGER']);
  });

  it('não altera storages quando senha está incorreta', () => {
    sessionStorage.setItem('app_current_user', JSON.stringify({ email: 'existing@test.com' }));

    applyMasterDriveSession('Glaucio@1970', 'wrongpassword');

    // sessionStorage NÃO deve ser limpo
    expect(sessionStorage.getItem('app_current_user')).toBeTruthy();
    // Nenhum token MASTER_DRIVE deve ser definido
    expect(sessionStorage.getItem('gbr_admin_scope')).toBeNull();
    expect(localStorage.getItem('gbr_kardek_history')).toBeNull();
  });

  it('aplica trim e define tokens corretamente', () => {
    const result = applyMasterDriveSession('  Glaucio@1970  ', 'admin');

    expect(result.isMaster).toBe(true);
    expect(sessionStorage.getItem('gbr_admin_scope')).toBe('GLOBAL_SUPER_ADMIN');
  });

  it('não aplica side effects para credenciais incorretas', () => {
    const result = applyMasterDriveSession('user@test.com', 'somepass');

    expect(result.isMaster).toBe(false);
    expect(sessionStorage.getItem('gbr_admin_scope')).toBeNull();
    expect(localStorage.getItem('gbr_kardek_history')).toBeNull();
  });

  it('grava rota atômica [LOGIN, DATABASE_MANAGER] no localStorage', () => {
    applyMasterDriveSession('Glaucio@1970', 'admin');

    const history = JSON.parse(localStorage.getItem('gbr_kardek_history')!);
    expect(history).toHaveLength(2);
    expect(history[0]).toBe('LOGIN');
    expect(history[1]).toBe('DATABASE_MANAGER');
  });
});
