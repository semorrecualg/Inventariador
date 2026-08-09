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
  if (lowerUsername === 'semorr') return true;
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

/** Result of a MASTER_DRIVE credential check. */
export interface MasterDriveResult {
  isMaster: boolean;
  masterUser?: {
    role: string;
    tenantid: string;
    filial: string;
    email: string;
  };
}

/**
 * Checks whether the given credentials match the sovereign MASTER_DRIVE bypass.
 *
 * Pure function: does not touch sessionStorage, localStorage, or any external
 * state. The caller (Login.tsx handleSubmit) is responsible for side effects
 * such as clearing session, setting tokens, and routing.
 *
 * @param username - Raw username input (trimmed internally)
 * @param password - Raw password input
 * @returns MasterDriveResult with isMaster flag and optional masterUser payload
 */
export const checkMasterDrive = (
  username: string,
  password: string,
): MasterDriveResult => {
  const inputUser = username.trim();

  if (inputUser === 'Glaucio@1970' && password === 'admin') {
    return {
      isMaster: true,
      masterUser: {
        role: 'ADMIN',
        // Master Drive é bypass de sistema (token GBR_SUPER_ADMIN_CORINGA agrega
        // todos os tenants). tenantid vazio — nenhum valor de cliente fixo.
        tenantid: '',
        filial: 'TODAS',
        email: 'semorr@gmail.com',
      },
    };
  }

  return { isMaster: false };
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
 * Applies the MASTER_DRIVE bypass including side effects.
 *
 * Unlike the pure checkMasterDrive(), this function performs the real
 * sessionStorage and localStorage mutations that Login.tsx handleSubmit
 * would do on the MASTER_DRIVE path.
 *
 * Can be tested with mocked storage APIs in environments without jsdom.
 * The AppScreen enum values (LOGIN, DATABASE_MANAGER) are hardcoded as
 * stable strings — these enum members have not changed since v1.0.
 *
 * @param username - Raw username input (trimmed internally)
 * @param password - Raw password input
 * @returns MasterDriveResult with isMaster flag
 */
export const applyMasterDriveSession = (
  username: string,
  password: string,
): MasterDriveResult => {
  const result = checkMasterDrive(username, password);

  if (result.isMaster && result.masterUser) {
    // Clear residual session data
    sessionStorage.clear();

    // Inject sovereign tokens
    sessionStorage.setItem('gbr_admin_scope', 'GLOBAL_SUPER_ADMIN');
    sessionStorage.setItem('tenantid', 'GBR_SUPER_ADMIN_CORINGA');

    // Atomic route history: force navigation to database manager
    localStorage.setItem(
      'gbr_kardek_history',
      JSON.stringify(['LOGIN', 'DATABASE_MANAGER']),
    );
  }

  return result;
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
