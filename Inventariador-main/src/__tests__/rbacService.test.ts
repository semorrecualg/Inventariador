import { describe, it, expect } from 'vitest';
import { UserRole } from '../types';
import {
  hasPermission,
  getRolePermissions,
  isAdminRole,
  isAuditorRole,
  isOperatorRole,
  isOwnerEmail,
  userHasPermission,
  isAdminUser,
  isAuditorUser,
} from '../services/rbacService';

describe('rbacService — Matriz de Governança RBAC (Relatório Canônico)', () => {
  describe('TRILHA A — Administrativo (ADMIN / MASTER)', () => {
    it.each(['ADMIN', 'MASTER'])('%s possui governança total', (role) => {
      expect(hasPermission(role, 'manage_campaigns')).toBe(true);
      expect(hasPermission(role, 'configure_fields')).toBe(true);
      expect(hasPermission(role, 'configure_qr_code')).toBe(true);
      expect(hasPermission(role, 'manage_users')).toBe(true);
      expect(hasPermission(role, 'configure_units')).toBe(true);
      expect(hasPermission(role, 'manage_database')).toBe(true);
      expect(isAdminRole(role)).toBe(true);
    });
  });

  describe('TRILHA B — Auditoria e Concordância (AUDITOR / AUXILIARY_AUDITOR)', () => {
    it.each(['AUDITOR', 'AUXILIARY_AUDITOR'])('%s acessa auditoria mas NÃO gestão', (role) => {
      expect(hasPermission(role, 'view_reconciliation')).toBe(true);
      expect(hasPermission(role, 'view_impairment')).toBe(true);
      expect(hasPermission(role, 'view_audit_logs')).toBe(true);
      expect(hasPermission(role, 'view_soft_delete')).toBe(true);
      expect(hasPermission(role, 'view_global_performance')).toBe(true);
      expect(hasPermission(role, 'sign_documents')).toBe(true);
      // Negativo: rotinas administrativas são exclusivas da Trilha A
      expect(hasPermission(role, 'manage_users')).toBe(false);
      expect(hasPermission(role, 'manage_campaigns')).toBe(false);
      expect(hasPermission(role, 'configure_units')).toBe(false);
      expect(isAuditorRole(role)).toBe(true);
      expect(isAdminRole(role)).toBe(false);
    });
  });

  describe('TRILHA C — Operação de Campo (USER / OPERADOR)', () => {
    it('USER opera o campo mas não enxerga auditoria/administração', () => {
      expect(hasPermission('USER', 'field_inventory')).toBe(true);
      expect(hasPermission('USER', 'field_labeling')).toBe(true);
      expect(hasPermission('USER', 'field_consultation')).toBe(true);
      expect(hasPermission('USER', 'field_active_search')).toBe(true);
      expect(hasPermission('USER', 'view_reconciliation')).toBe(false);
      expect(hasPermission('USER', 'sign_documents')).toBe(false);
      expect(hasPermission('USER', 'view_audit_logs')).toBe(false);
      expect(hasPermission('USER', 'manage_users')).toBe(false);
      expect(isOperatorRole('USER')).toBe(true);
      expect(isAdminUser({ role: UserRole.USER })).toBe(false);
      expect(isAuditorUser({ role: UserRole.USER })).toBe(false);
    });
  });

  describe('Soberania do proprietário (flags legados + email VITE_ADMIN_EMAIL)', () => {
    it('email do proprietário mantém acesso total mesmo com role OPERADOR', () => {
      expect(
        userHasPermission({ role: UserRole.USER, email: 'semorr@gmail.com' }, 'manage_users')
      ).toBe(true);
      expect(
        userHasPermission({ role: UserRole.USER, email: 'semorr@gmail.com' }, 'manage_database')
      ).toBe(true);
      expect(isAdminUser({ role: UserRole.USER, email: 'semorr@gmail.com' })).toBe(true);
    });

    it('flags legados is_admin/isAdmin garantem acesso total', () => {
      expect(userHasPermission({ role: UserRole.USER, is_admin: true }, 'manage_users')).toBe(true);
      expect(userHasPermission({ role: UserRole.USER, isAdmin: true }, 'manage_campaigns')).toBe(true);
    });

    it('isOwnerEmail normaliza case', () => {
      expect(isOwnerEmail('Semorr@Gmail.com')).toBe(true);
      expect(isOwnerEmail('outro@email.com')).toBe(false);
    });
  });

  describe('Perfis especiais e desconhecidos', () => {
    it('DEMO/MOBILE_SINGLE/GESTOR mantêm paridade com comportamento legado (acesso amplo)', () => {
      expect(hasPermission('DEMO', 'manage_campaigns')).toBe(true);
      expect(hasPermission('MOBILE_SINGLE', 'sign_documents')).toBe(true);
      expect(hasPermission('GESTOR', 'manage_database')).toBe(true);
    });

    it('papel desconhecido cai no fallback de operação de campo (nunca fica sem acesso)', () => {
      const perms = getRolePermissions('FUTURO_ROLE');
      expect(perms.has('field_inventory')).toBe(true);
      expect(perms.has('view_audit_logs')).toBe(false);
    });

    it('role nulo/vazio não concede permissões de governança', () => {
      expect(hasPermission(null, 'manage_users')).toBe(false);
      expect(hasPermission(undefined, 'field_inventory')).toBe(true); // fallback operacional
      expect(userHasPermission(null, 'field_inventory')).toBe(false);
    });
  });

  describe('Hierarquia de papéis', () => {
    it('admin também é auditor e operador; auditor também é operador', () => {
      expect(isAuditorRole('ADMIN')).toBe(true);
      expect(isOperatorRole('ADMIN')).toBe(true);
      expect(isOperatorRole('AUDITOR')).toBe(true);
    });
  });
});
