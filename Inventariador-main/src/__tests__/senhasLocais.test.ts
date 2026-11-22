// @vitest-environment jsdom
// ============================================================================
// senhasLocais.test.ts — a senha local nunca fica em texto no aparelho.
//
// `app_users` (e a cópia persistida da sessão) guardava `password` em claro:
// qualquer backup do telemóvel ou acesso ao browser lia credenciais de
// administrador. O registo passa a levar um verificador PBKDF2-HMAC-SHA256
// (WebCrypto, sal aleatório por registo) e o texto é descartado antes de
// qualquer escrita.
//
// Cobre também a dívida que sobra no aparelho de quem já usava a versão antiga:
// a senha em `sessionStorage` (`app_current_user`) e os registos de
// `localDb.users` com texto, que são convertidos no arranque.
// ============================================================================
import 'fake-indexeddb/auto'; // ANTES de qualquer módulo que crie Dexie/localforage
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import {
  createPasswordVerifier,
  verifyUserPassword,
  withPasswordVerifier,
  sanitizeUsersForStorage,
  stripUserSecrets
} from '../utils/passwordHash';
import { authenticateLocalUser } from '../utils/authUtils';
import { sanitizeSessionUserCache } from '../utils/sessionPersistence';
import { localDb } from '../services/localDbService';
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

afterEach(async () => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  await localDb.users.clear();
});

const auditorComSenha = async (): Promise<User> =>
  ({
    username: 'auditor',
    name: 'Auditor',
    email: 'auditor@example.com',
    ...(await createPasswordVerifier('senha123')),
    role: UserRole.AUDITOR,
    is_admin: false,
    isAdmin: false,
    tenantid: 'CICOPAL',
    filial: 'FILIAL A',
    units: ['FILIAL A']
  }) as User;

describe('verificador PBKDF2 do WebCrypto', () => {
  it('não guarda a senha e confere só a senha certa', async () => {
    const verifier = await createPasswordVerifier('admin');
    expect(verifier.passwordHash).not.toBe('admin');
    expect(verifier.passwordHash).toMatch(/^[A-Za-z0-9+/]{43}=$/); // 32 bytes em base64
    await expect(verifyUserPassword(verifier, 'admin')).resolves.toBe(true);
    await expect(verifyUserPassword(verifier, 'admin ')).resolves.toBe(false);
    await expect(verifyUserPassword(verifier, '')).resolves.toBe(false);
  });

  it('a mesma senha em dois registos dá hashes diferentes (sal por registo)', async () => {
    const a = await createPasswordVerifier('123456');
    const b = await createPasswordVerifier('123456');
    expect(a.passwordSalt).not.toBe(b.passwordSalt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });

  it('registo antigo com texto continua a entrar e sai sem a senha', async () => {
    const antigo: { email: string; password?: string; passwordHash?: string; passwordSalt?: string } = {
      email: 'velho@example.com',
      password: 'admin123'
    };
    await expect(verifyUserPassword(antigo, 'admin123')).resolves.toBe(true);
    await expect(verifyUserPassword(antigo, 'outra')).resolves.toBe(false);

    const migrado = await withPasswordVerifier(antigo);
    expect(migrado).not.toHaveProperty('password');
    await expect(verifyUserPassword(migrado, 'admin123')).resolves.toBe(true);
  });
});

describe('app_users — nenhuma senha em claro', () => {
  it('a lista gravada não tem a chave password nem o texto da senha', async () => {
    const users = [
      await auditorComSenha(),
      {
        username: 'velho',
        email: 'velho@example.com',
        password: 'admin123',
        role: UserRole.AUDITOR,
        tenantid: 'CICOPAL'
      } as User
    ];

    const stored = JSON.stringify(await sanitizeUsersForStorage(users));
    localStorage.setItem('app_users', stored);

    expect(stored).not.toContain('"password"');
    expect(stored).not.toContain('senha123');
    expect(stored).not.toContain('admin123');
    const roundTrip = JSON.parse(localStorage.getItem('app_users') as string) as User[];
    await expect(verifyUserPassword(roundTrip[0], 'senha123')).resolves.toBe(true);
    await expect(verifyUserPassword(roundTrip[1], 'admin123')).resolves.toBe(true);
  });

  it('o utilizador de demonstração não traz senha', () => {
    expect(demoService.getDemoUser()).not.toHaveProperty('password');
  });
});

describe('senhas antigas que já estão no aparelho', () => {
  it('limpa a senha do cache de sessão do separador (`app_current_user`)', () => {
    sessionStorage.setItem(
      'app_current_user',
      JSON.stringify({ email: 'auditor@example.com', role: 'AUDITOR', password: 'segredo123' })
    );

    expect(sanitizeSessionUserCache()).toBe(true);

    const cache = sessionStorage.getItem('app_current_user') as string;
    expect(cache).not.toContain('"password"');
    expect(cache).not.toContain('segredo123');
    expect(JSON.parse(cache)).toMatchObject({ email: 'auditor@example.com' });
    // Já limpo: segunda passagem não tem nada para fazer.
    expect(sanitizeSessionUserCache()).toBe(false);
  });

  it('converte os registos de localDb.users com texto para verificador', async () => {
    await localDb.users.add({
      username: 'legado',
      name: 'Legado',
      email: 'legado@example.com',
      password: 'antiga123',
      role: UserRole.AUDITOR,
      tenantid: 'CICOPAL',
      filial: 'FILIAL A',
      units: ['FILIAL A']
    } as User);

    await expect(localDb.users.migrateLocalUserPasswords()).resolves.toBe(1);

    const [registro] = await localDb.users.toArray();
    expect(registro).not.toHaveProperty('password');
    expect(JSON.stringify(registro)).not.toContain('antiga123');
    // O login local continua a funcionar com a mesma senha.
    await expect(verifyUserPassword(registro, 'antiga123')).resolves.toBe(true);
    await expect(verifyUserPassword(registro, 'errada')).resolves.toBe(false);
    // Idempotente: uma segunda passagem não mexe em nada.
    await expect(localDb.users.migrateLocalUserPasswords()).resolves.toBe(0);
  });

  it('stripUserSecrets remove a chave sem derivar nada', async () => {
    const limpo = stripUserSecrets({ email: 'a@b.c', password: 'segredo' } as User);
    expect(limpo).not.toHaveProperty('password');
  });
});

describe('login com verificador', () => {
  it('authenticateLocalUser aceita a senha certa do registo com hash e recusa a errada', async () => {
    const user = await auditorComSenha();
    const findByEmail = async () => user as unknown as Record<string, unknown>;

    await expect(authenticateLocalUser(findByEmail, 'auditor@example.com', 'senha123')).resolves.toHaveProperty('user');
    await expect(authenticateLocalUser(findByEmail, 'auditor@example.com', 'errada')).resolves.toEqual({
      error: 'Senha incorreta'
    });
  });

  it('a tela de login autentica o auditor com a senha guardada em PBKDF2', async () => {
    const onLogin = vi.fn();
    const { default: Login } = await import('../components/Login');

    render(
      React.createElement(Login as unknown as React.ComponentType<Record<string, unknown>>, {
        users: [await auditorComSenha()],
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
