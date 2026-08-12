import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { canAccessDatabaseManager } from '../utils/authUtils';

/**
 * Gate do Gestor de Base (Database Manager).
 *
 * Regra de governança testada:
 *  - Com VITE_ADMIN_EMAIL configurado, apenas o email do admin (ou super-admin) acessa;
 *  - Sem VITE_ADMIN_EMAIL configurado, NENHUM email acessa (governança estrita,
 *    zero valor fixo embutido no produto);
 *  - isSuperAdmin libera independente do email.
 */
describe('Gate do Gestor de Base (canAccessDatabaseManager)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('com VITE_ADMIN_EMAIL configurado (admin real definido)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_ADMIN_EMAIL', 'semorr@gmail.com');
    });

    it('libera o admin configurado (mesmo email)', () => {
      expect(canAccessDatabaseManager({ email: 'semorr@gmail.com' })).toBe(true);
    });

    it('libera email com caixa diferente e espacos (case-insensitive + trim)', () => {
      expect(canAccessDatabaseManager({ email: '  SEMORR@GMAIL.COM ' })).toBe(true);
    });

    it('bloqueia usuario nao-admin', () => {
      expect(canAccessDatabaseManager({ email: 'auditor@empresa.com' })).toBe(false);
    });

    it('bloqueia usuario sem email', () => {
      expect(canAccessDatabaseManager({ email: undefined })).toBe(false);
      expect(canAccessDatabaseManager({ email: '' })).toBe(false);
    });

    it('bloqueia usuario nulo', () => {
      expect(canAccessDatabaseManager(null)).toBe(false);
      expect(canAccessDatabaseManager(undefined)).toBe(false);
    });
  });

  describe('sem VITE_ADMIN_EMAIL (nao configurado — zero valor fixo)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_ADMIN_EMAIL', '');
    });

    it('bloqueia ate o email que seria o admin', () => {
      expect(canAccessDatabaseManager({ email: 'semorr@gmail.com' })).toBe(false);
    });

    it('bloqueia qualquer email', () => {
      expect(canAccessDatabaseManager({ email: 'qualquer@empresa.com' })).toBe(false);
    });
  });

  describe('isSuperAdmin (bypass legitimo de sistema)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_ADMIN_EMAIL', 'semorr@gmail.com');
    });

    it('libera super-admin independente do email', () => {
      expect(canAccessDatabaseManager({ email: 'operador@x.com', isSuperAdmin: true })).toBe(true);
    });

    it('libera super-admin mesmo sem VITE_ADMIN_EMAIL configurado', () => {
      vi.stubEnv('VITE_ADMIN_EMAIL', '');
      expect(canAccessDatabaseManager({ email: 'operador@x.com', isSuperAdmin: true })).toBe(true);
    });
  });

  describe('Trilha A do RBAC (docs/RBAC_GOVERNANCA.md): ADMIN/MASTER acessam o Gestor de Base', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_ADMIN_EMAIL', 'semorr@gmail.com');
    });

    it('libera MASTER (cliente provisionado) independente do email', () => {
      expect(canAccessDatabaseManager({ email: 'master@cliente.com', role: 'MASTER' })).toBe(true);
    });

    it('libera ADMIN independente do email', () => {
      expect(canAccessDatabaseManager({ email: 'admin@cliente.com', role: 'ADMIN' })).toBe(true);
    });

    it('bloqueia AUDITOR mesmo com email válido', () => {
      expect(canAccessDatabaseManager({ email: 'auditor@empresa.com', role: 'AUDITOR' })).toBe(false);
    });

    it('bloqueia papel desconhecido/sem papel', () => {
      expect(canAccessDatabaseManager({ email: 'x@y.com', role: 'USER' })).toBe(false);
      expect(canAccessDatabaseManager({ email: 'x@y.com' })).toBe(false);
    });
  });
});
