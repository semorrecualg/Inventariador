// @vitest-environment jsdom
// ============================================================================
// senhasLocais.test.ts — a senha local nunca fica em texto no aparelho.
//
// `app_users` (e a cópia persistida da sessão) guardava `password` em claro:
// qualquer backup do telemóvel ou acesso ao browser lia credenciais de
// administrador. O registo passa a levar um verificador (sal + SHA-256
// iterado) e o texto é descartado antes de qualquer escrita; registos antigos
// são convertidos na leitura, e o login continua a funcionar.
// ============================================================================
import 'fake-indexeddb/auto'; // ANTES de qualquer módulo que crie Dexie/localforage
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import {
  sha256Hex,
  createPasswordVerifier,
  verifyUserPassword,
  withPasswordVerifier,
  sanitizeUsersForStorage
} from '../utils/passwordHash';
import { authenticateLocalUser } from '../utils/authUtils';
import { demoService } from '../services/demoService';
import { DatabaseMode, UserRole } from '../types';
import type { User } from '../types';

vi.stubEnv('VITE_ADMIN_EMAIL', 'admin@example.com');

const { supabaseMock, ensureUserProfileMock } = vi.hoisted(() => ({
  supabaseMock: {
    auth: { signInWithPassword: vi.fn(), signOut: vi.fn().mockResolvedValue({ error: null }) }
  },
  ensureUserProfileMock: vi.fn()
}));

vi.mock('../services/supabaseService', () => ({
  supabase: supabaseMock,
  ensureUserProfile: ensureUserProfileMock,
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
  getEmailByUsername: vi.fn().mockResolvedValue(null),
  isInternalMode: false
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

const auditorComSenha = (): User =>
  ({
    username: 'auditor',
    name: 'Auditor',
    email: 'auditor@example.com',
    ...createPasswordVerifier('senha123'),
    role: UserRole.AUDITOR,
    is_admin: false,
    isAdmin: false,
    tenantid: 'CICOPAL',
    filial: 'FILIAL A',
    units: ['FILIAL A']
  }) as User;

describe('sha256Hex — base do verificador', () => {
  it('bate nos vectores conhecidos do SHA-256', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('verificador de senha local', () => {
  it('não guarda a senha e confere só a senha certa', () => {
    const verifier = createPasswordVerifier('admin');
    expect(verifier.passwordHash).not.toBe('admin');
    expect(verifier.passwordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyUserPassword(verifier, 'admin')).toBe(true);
    expect(verifyUserPassword(verifier, 'admin ')).toBe(false);
    expect(verifyUserPassword(verifier, '')).toBe(false);
  });

  it('a mesma senha em dois registos dá hashes diferentes (sal por registo)', () => {
    const a = createPasswordVerifier('123456');
    const b = createPasswordVerifier('123456');
    expect(a.passwordSalt).not.toBe(b.passwordSalt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });

  it('registo antigo com texto continua a entrar uma vez (migração)', () => {
    const antigo: { email: string; password?: string; passwordHash?: string; passwordSalt?: string } = {
      email: 'velho@example.com',
      password: 'admin123'
    };
    expect(verifyUserPassword(antigo, 'admin123')).toBe(true);
    expect(verifyUserPassword(antigo, 'outra')).toBe(false);
    // Ao passar por qualquer gravação, o texto desaparece.
    const migrado = withPasswordVerifier(antigo);
    expect(migrado).not.toHaveProperty('password');
    expect(verifyUserPassword(migrado, 'admin123')).toBe(true);
  });
});

describe('app_users — nenhuma senha em claro', () => {
  it('a lista gravada não tem a chave password nem o texto da senha', () => {
    const users = [
      auditorComSenha(),
      { username: 'velho', email: 'velho@example.com', password: 'admin123', role: UserRole.AUDITOR, tenantid: 'CICOPAL' } as User
    ];

    const stored = JSON.stringify(sanitizeUsersForStorage(users));
    localStorage.setItem('app_users', stored);

    expect(stored).not.toContain('"password"');
    expect(stored).not.toContain('senha123');
    expect(stored).not.toContain('admin123');
    expect(localStorage.getItem('app_users')).not.toContain('senha123');
    // O verificador viaja no registo: o login continua possível.
    const roundTrip = JSON.parse(localStorage.getItem('app_users') as string) as User[];
    expect(verifyUserPassword(roundTrip[0], 'senha123')).toBe(true);
    expect(verifyUserPassword(roundTrip[1], 'admin123')).toBe(true);
  });

  it('a cópia persistida da sessão não leva senha', () => {
    const user = auditorComSenha();
    const persistido = JSON.stringify({ user: withPasswordVerifier(user), savedAt: Date.now() });
    expect(persistido).not.toContain('"password"');
    expect(persistido).not.toContain('senha123');
  });

  it('o utilizador de demonstração não traz senha', () => {
    expect(demoService.getDemoUser()).not.toHaveProperty('password');
  });
});

describe('login com verificador', () => {
  it('authenticateLocalUser aceita a senha certa do registo com hash e recusa a errada', async () => {
    const user = auditorComSenha();
    const findByEmail = async () => user as unknown as Record<string, unknown>;

    await expect(authenticateLocalUser(findByEmail, 'auditor@example.com', 'senha123')).resolves.toHaveProperty('user');
    await expect(authenticateLocalUser(findByEmail, 'auditor@example.com', 'errada')).resolves.toEqual({
      error: 'Senha incorreta'
    });
  });

  it('a tela de login autentica o auditor com a senha guardada em hash', async () => {
    const onLogin = vi.fn();
    const { default: Login } = await import('../components/Login');

    render(
      React.createElement(Login as unknown as React.ComponentType<Record<string, unknown>>, {
        users: [auditorComSenha()],
        databaseMode: DatabaseMode.SUPABASE,
        onLogin,
        onOpenPrivacyCenter: vi.fn(),
        onUpdateScreen: vi.fn(),
        onShowModal: vi.fn(),
        isKeyboardVisible: false,
        onUpdateDatabaseMode: vi.fn()
      })
    );

    fireEvent.change(screen.getByPlaceholderText('Digite seu usuário ou e-mail'), {
      target: { value: 'auditor@example.com' }
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'senha123' } });
    fireEvent.submit(screen.getByText('Acessar Sistema').closest('form') as HTMLFormElement);

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
    expect(onLogin.mock.calls[0][0]).toMatchObject({ email: 'auditor@example.com', role: UserRole.AUDITOR });
  });
});
