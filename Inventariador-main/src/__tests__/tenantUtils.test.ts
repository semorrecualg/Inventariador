import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveTenantId, normalizeUser, readSessionTenantId, readLocalTenantId } from '../utils/tenantUtils';

describe('resolveTenantId — campo canônico `tenantid` com fallback legado', () => {
  it('retorna o valor do campo canônico tenantid', () => {
    expect(resolveTenantId({ tenantid: 'CICOPAL' })).toBe('CICOPAL');
  });

  it('prefere tenantid quando múltiplas variantes existem', () => {
    expect(resolveTenantId({ tenantid: 'CICOPAL', tenantId: 'ANTIGO', _tenantid: 'ANTIGO2' })).toBe('CICOPAL');
  });

  it('faz fallback para tenantId legado', () => {
    expect(resolveTenantId({ tenantId: 'LEGADO_CAMEL' })).toBe('LEGADO_CAMEL');
  });

  it('faz fallback para _tenantid legado', () => {
    expect(resolveTenantId({ _tenantid: 'LEGADO_UNDER' })).toBe('LEGADO_UNDER');
  });

  it('faz fallback para tenant_id legado', () => {
    expect(resolveTenantId({ tenant_id: 'LEGADO_SNAKE' })).toBe('LEGADO_SNAKE');
  });

  it('aceita array e usa o primeiro elemento', () => {
    expect(resolveTenantId({ tenantid: ['CICOPAL', 'OUTRA'] })).toBe('CICOPAL');
    expect(resolveTenantId({ tenants: ['DEMO_DEFAULT'] })).toBe('DEMO_DEFAULT');
  });

  it('retorna string vazia para null, undefined ou objeto vazio', () => {
    expect(resolveTenantId(null)).toBe('');
    expect(resolveTenantId(undefined)).toBe('');
    expect(resolveTenantId({})).toBe('');
  });

  it('retorna string vazia quando o valor é vazio', () => {
    expect(resolveTenantId({ tenantid: '' })).toBe('');
    expect(resolveTenantId({ tenantid: null as unknown as string })).toBe('');
  });

  it('converte valores escalares para string', () => {
    expect(resolveTenantId({ tenantid: 12345 as unknown as string })).toBe('12345');
  });
});

describe('normalizeUser — garante a propriedade canônica tenantid', () => {
  it('adiciona tenantid a partir do campo legado sem mutar o original', () => {
    const user = { email: 'a@b.com', tenantId: 'CICOPAL' };
    const normalized = normalizeUser(user);

    expect(normalized.tenantid).toBe('CICOPAL');
    expect((normalized as Record<string, unknown>).tenantId).toBe('CICOPAL'); // preserva o resto
    expect((user as Record<string, unknown>).tenantid).toBeUndefined(); // não muta
  });

  it('preserva tenantid existente e demais campos', () => {
    const user = { email: 'a@b.com', tenantid: 'NOVO', name: 'Ana' };
    const normalized = normalizeUser(user);
    expect(normalized.tenantid).toBe('NOVO');
    expect(normalized.name).toBe('Ana');
  });
});

describe('readSessionTenantId / readLocalTenantId — chave canônica com fallback', () => {
  const mockSession = new Map<string, string>();
  const mockLocal = new Map<string, string>();

  beforeEach(() => {
    mockSession.clear();
    mockLocal.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => mockSession.get(k) ?? null,
      setItem: (k: string, v: string) => mockSession.set(k, v),
      removeItem: (k: string) => mockSession.delete(k),
      clear: () => mockSession.clear(),
      get length() { return mockSession.size; },
      key: (i: number) => [...mockSession.keys()][i] ?? null,
    });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mockLocal.get(k) ?? null,
      setItem: (k: string, v: string) => mockLocal.set(k, v),
      removeItem: (k: string) => mockLocal.delete(k),
      clear: () => mockLocal.clear(),
      get length() { return mockLocal.size; },
      key: (i: number) => [...mockLocal.keys()][i] ?? null,
    });
  });

  it('lê a chave canônica tenantid no sessionStorage', () => {
    mockSession.set('tenantid', 'CICOPAL');
    expect(readSessionTenantId()).toBe('CICOPAL');
  });

  it('faz fallback para a chave legada tenantId no sessionStorage (sem perda de sessão)', () => {
    mockSession.set('tenantId', 'SESSAO_ANTIGA');
    expect(readSessionTenantId()).toBe('SESSAO_ANTIGA');
  });

  it('retorna vazio quando nenhuma chave existe', () => {
    expect(readSessionTenantId()).toBe('');
  });

  it('lê a chave canônica tenantid no localStorage', () => {
    mockLocal.set('tenantid', 'CICOPAL');
    expect(readLocalTenantId()).toBe('CICOPAL');
  });

  it('faz fallback para a chave legada tenantId no localStorage', () => {
    mockLocal.set('tenantId', 'LOCAL_ANTIGO');
    expect(readLocalTenantId()).toBe('LOCAL_ANTIGO');
  });
});
