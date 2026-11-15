import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { canProvisionLicenses } from '../utils/authUtils';

/**
 * Gate das LICENÇAS (provisionar novo cliente: tenant + MASTER).
 *
 * Regra de governança testada:
 *  - provisionar licença é acção de PLATAFORMA: só ADMIN (papel), o email do
 *    dono (VITE_ADMIN_EMAIL) ou o super-admin do sistema;
 *  - MASTER NÃO abre clientes novos — administra o contrato que já tem;
 *  - sem VITE_ADMIN_EMAIL configurado, nenhum email passa (governança estrita).
 */
describe('Gate das Licenças (canProvisionLicenses)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('com VITE_ADMIN_EMAIL configurado', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_ADMIN_EMAIL', 'semorr@gmail.com');
    });

    it('libera o email do dono, mesmo com caixa e espaços diferentes', () => {
      expect(canProvisionLicenses({ email: 'semorr@gmail.com' })).toBe(true);
      expect(canProvisionLicenses({ email: '  SEMORR@GMAIL.COM ' })).toBe(true);
    });

    it('libera o papel ADMIN independente do email', () => {
      expect(canProvisionLicenses({ email: 'admin@cliente.com', role: 'ADMIN' })).toBe(true);
    });

    it('bloqueia MASTER: administra o próprio contrato, não abre clientes', () => {
      expect(canProvisionLicenses({ email: 'master@cliente.com', role: 'MASTER' })).toBe(false);
    });

    it('bloqueia AUDITOR e papéis desconhecidos', () => {
      expect(canProvisionLicenses({ email: 'auditor@empresa.com', role: 'AUDITOR' })).toBe(false);
      expect(canProvisionLicenses({ email: 'x@y.com', role: 'USER' })).toBe(false);
    });

    it('bloqueia usuário nulo ou sem email', () => {
      expect(canProvisionLicenses(null)).toBe(false);
      expect(canProvisionLicenses(undefined)).toBe(false);
      expect(canProvisionLicenses({ email: '' })).toBe(false);
    });
  });

  describe('sem VITE_ADMIN_EMAIL (zero valor fixo embutido)', () => {
    beforeEach(() => {
      vi.stubEnv('VITE_ADMIN_EMAIL', '');
    });

    it('bloqueia o email que seria o dono', () => {
      expect(canProvisionLicenses({ email: 'semorr@gmail.com' })).toBe(false);
    });

    it('mantém o papel ADMIN como única via', () => {
      expect(canProvisionLicenses({ email: 'admin@cliente.com', role: 'ADMIN' })).toBe(true);
    });
  });

  describe('super-admin do sistema', () => {
    it('libera independente do email e da configuração', () => {
      vi.stubEnv('VITE_ADMIN_EMAIL', '');
      expect(canProvisionLicenses({ email: 'operador@x.com', isSuperAdmin: true })).toBe(true);
    });
  });
});
