// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { authenticateLocalUser } from '../utils/authUtils';
import { useLocalAuth } from '../hooks/useLocalAuth';

// ── Mock de usuários Dexie ──
const makeUser = (overrides: Record<string, unknown> = {}) => ({
  email: 'user@test.com',
  username: 'testuser',
  password: 'test123',
  role: 'AUDITOR',
  is_admin: false,
  isAdmin: false,
  tenantId: 'TENANT_001',
  filial: 'FILIAL_A',
  ...overrides,
});

describe('authenticateLocalUser — função pura de busca Dexie', () => {
  const mockFinder = (user: Record<string, unknown> | null) =>
    vi.fn().mockResolvedValue(user ? makeUser(user) : null);

  it('retorna usuário quando email e senha correspondem no Dexie', async () => {
    const finder = mockFinder({ email: 'user@test.com', password: 'test123' });
    const result = await authenticateLocalUser(finder, 'user@test.com', 'test123');

    expect(result.user).toBeDefined();
    expect(result.user?.email).toBe('user@test.com');
    expect(result.error).toBeUndefined();
    expect(finder).toHaveBeenCalledWith({ email: 'user@test.com' });
  });

  it('retorna error quando senha está incorreta', async () => {
    const finder = mockFinder({ email: 'user@test.com', password: 'test123' });
    const result = await authenticateLocalUser(finder, 'user@test.com', 'wrongpass');

    expect(result.user).toBeUndefined();
    expect(result.error).toBe('Senha incorreta');
  });

  it('retorna error quando usuário não existe no Dexie', async () => {
    const finder = mockFinder(null);
    const result = await authenticateLocalUser(finder, 'unknown@test.com', 'any');

    expect(result.user).toBeUndefined();
    expect(result.error).toBe('Usuário não encontrado');
  });

  it('retorna error quando a query Dexie falha', async () => {
    const brokenFinder = vi.fn().mockRejectedValue(new Error('Dexie connection failed'));
    const result = await authenticateLocalUser(brokenFinder, 'user@test.com', 'pass');

    expect(result.user).toBeUndefined();
    expect(result.error).toContain('Dexie');
  });

  it('aplica trim no email antes da busca', async () => {
    const finder = vi.fn().mockResolvedValue(makeUser());
    await authenticateLocalUser(finder, '  user@test.com  ', 'test123');
    expect(finder).toHaveBeenCalledWith({ email: 'user@test.com' });
  });

  it('converte email para minúsculas antes da busca', async () => {
    const finder = vi.fn().mockResolvedValue(makeUser());
    await authenticateLocalUser(finder, 'USER@TEST.COM', 'test123');
    expect(finder).toHaveBeenCalledWith({ email: 'user@test.com' });
  });

  it('retorna error para email vazio sem chamar o Dexie', async () => {
    const finder = vi.fn();
    const result = await authenticateLocalUser(finder, '', 'pass');

    expect(result.error).toBe('E-mail não informado');
    expect(finder).not.toHaveBeenCalled();
  });
});

describe('useLocalAuth — hook de autenticação local (jsdom)', () => {
  it('inicia com isLoading=false e error=null', () => {
    const { result } = renderHook(() => useLocalAuth());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('authenticate retorna resultado de authenticateLocalUser (sucesso)', async () => {
    const { result } = renderHook(() => useLocalAuth());
    const finder = vi.fn().mockResolvedValue(makeUser());

    let authResult!: Awaited<ReturnType<typeof authenticateLocalUser>>;
    await act(async () => {
      authResult = await result.current.authenticate(finder, 'user@test.com', 'test123');
    });

    expect(authResult.user).toBeDefined();
    expect(authResult.user?.email).toBe('user@test.com');
  });

  it('propaga erro de authenticateLocalUser para o estado error', async () => {
    const { result } = renderHook(() => useLocalAuth());
    const finder = vi.fn().mockResolvedValue(null);

    await act(async () => {
      await result.current.authenticate(finder, 'unknown@test.com', 'pass');
    });

    expect(result.current.error).toBe('Usuário não encontrado');
  });

  it('clearError redefine error para null', async () => {
    const { result } = renderHook(() => useLocalAuth());

    // Primeiro causa um erro
    const finder = vi.fn().mockResolvedValue(null);
    await act(async () => {
      await result.current.authenticate(finder, 'x@x.com', 'pass');
    });
    expect(result.current.error).toBe('Usuário não encontrado');

    // Depois limpa
    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('define isLoading=true durante a autenticação', async () => {
    // Usamos um deferred para controlar o tempo de resposta
    let resolveFinder!: (val: unknown) => void;
    const deferred = new Promise(resolve => { resolveFinder = resolve; });
    const { result } = renderHook(() => useLocalAuth());

    act(() => {
      result.current.authenticate(vi.fn().mockReturnValue(deferred), 'a@b.com', 'pass');
    });

    // Durante a execução, isLoading deve ser true
    expect(result.current.isLoading).toBe(true);

    // Clean up: resolve a promise para evitar vazamento
    await act(async () => {
      resolveFinder(null);
    });
  });
});
