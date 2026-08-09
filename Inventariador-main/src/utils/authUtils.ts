/**
 * Centralized authentication and authorization utilities.
 *
 * Replaces all hardcoded email checks (previously `semorr@gmail.com`) with
 * a single configurable source of truth. The admin email is read from the
 * VITE_ADMIN_EMAIL environment variable, with a documented fallback.
 *
 * NOTE: This is client-side auth for the offline-first mobile use case.
 * For production cloud deployments, authorization must also be enforced
 * server-side via Supabase Row-Level Security policies.
 */

import { User, UserRole } from '../types';

/**
 * The configured admin email address.
 * Falls back to the env var VITE_ADMIN_EMAIL, or an empty string if unset.
 * Admins should set VITE_ADMIN_EMAIL in their .env file.
 */
export const ADMIN_EMAIL: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_EMAIL) || '';

/**
 * Checks whether the given email matches the configured admin account.
 * This is the single source of truth for admin email verification.
 */
export const isAdminEmail = (email: string | null | undefined): boolean => {
  if (!email || !ADMIN_EMAIL) return false;
  return email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
};

/**
 * Checks whether the given email or username matches special local-only
 * accounts used for offline-first operation (admin, demo, etc.).
 */
export const isLocalAdminIdentity = (
  email: string | null | undefined,
  username: string | null | undefined,
): boolean => {
  const lowerEmail = (email || '').toLowerCase().trim();
  const lowerUsername = (username || '').toLowerCase().trim();

  if (isAdminEmail(lowerEmail)) return true;
  if (lowerUsername === (ADMIN_EMAIL.split('@')[0] || 'admin')) return true;
  return false;
};

/**
 * Checks whether the given role string represents an admin-level role.
 */
export const isAdminRole = (role: string | null | undefined): boolean => {
  if (!role) return false;
  const upper = role.toUpperCase().trim();
  return upper === 'ADMIN' || upper === 'MASTER' || upper === 'GESTOR';
};

/**
 * Comprehensive admin check: evaluates role, is_admin flags, and the
 * configured admin email. This is the single function to use when
 * determining if a user has administrative privileges.
 */
export const isAdminUser = (user: User | null | undefined): boolean => {
  if (!user) return false;

  // Check role-based admin
  if (isAdminRole(user.role)) return true;

  // Check is_admin boolean flags
  if (user.isAdmin || user.is_admin) return true;

  // Check against configured admin email
  if (isAdminEmail(user.email)) return true;

  return false;
};

/** Result of a local user authentication against Dexie.js. */
export interface AuthResult {
  user?: Record<string, unknown>;
  error?: string;
}

/**
 * Authenticates a user against the local Dexie.js database.
 *
 * Pure function (async): takes a finder function that wraps
 * `localDb.users.get()`, an email, and a password. Returns the
 * user record if found and password matches, or an error string.
 *
 * The finder is injected to make the function testable without
 * requiring an actual Dexie database instance.
 *
 * @param findByEmail - Async function(email) => User | null | undefined
 * @param email - Raw email input (trimmed + lowercased internally)
 * @param password - Raw password to compare
 * @returns AuthResult with user or error
 */
export const authenticateLocalUser = async (
  findByEmail: (criteria: { email: string }) => Promise<Record<string, unknown> | null | undefined>,
  email: string,
  password: string,
): Promise<AuthResult> => {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    return { error: 'E-mail não informado' };
  }

  try {
    const user = await findByEmail({ email: normalizedEmail });

    if (!user) {
      return { error: 'Usuário não encontrado' };
    }

    const storedPassword = user.password as string | undefined;
    if (storedPassword !== password) {
      return { error: 'Senha incorreta' };
    }

    return { user };
  } catch (err) {
    return { error: `Erro ao consultar banco Dexie: ${err instanceof Error ? err.message : String(err)}` };
  }
};

/**
 * Creates an admin user object from the configured admin email.
 * Used as a fallback when no admin user exists in the local database.
 */
export const createAdminUser = (
  email?: string,
  username?: string,
): User => {
  const adminEmail = ADMIN_EMAIL || email || 'admin@system.local';
  return {
    username: username || adminEmail.split('@')[0],
    name: 'Administrador',
    email: adminEmail,
    role: UserRole.ADMIN,
    is_admin: true,
    isAdmin: true,
    mustChangePassword: false,
    tenantid: '',
    filial: '',
  };
};
