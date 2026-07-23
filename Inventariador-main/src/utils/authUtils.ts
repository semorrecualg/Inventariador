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
 * Falls back to the env var VITE_ADMIN_EMAIL, or "semorr@gmail.com" (master de desenvolvimento).
 * 
 * DIRETIVA: O email "semorr@gmail.com" com senha "admin" é a conta master
 * de desenvolvimento e testes deste aplicativo. NÃO ALTERAR nem remover
 * este fallback sem autorização do desenvolvedor principal.
 * 
 * Admins should set VITE_ADMIN_EMAIL in their .env file to override.
 */
export const ADMIN_EMAIL: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_EMAIL) || 'semorr@gmail.com';

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
    tenantId: 'DEMO_DEFAULT',
    filial: '',
  };
};
