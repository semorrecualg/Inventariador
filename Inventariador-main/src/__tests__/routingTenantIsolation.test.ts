// @vitest-environment jsdom
// src/__tests__/routingTenantIsolation.test.ts
// SRE ISOLAMENTO: o roteamento pós-login decide a tela pela contagem de ativos
// DO TENANT do usuário, não pela contagem global. Sem isso, um MASTER de um
// tenant novo (ex.: CLIENTETESTE) herdaria a base global em cache (ex.:
// CICOPAL) e cairia no fluxo de "base preenchida" em vez de ser direcionado à
// primeira carga de dados (/load-database).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processarRoteamentoPosLoginSaas, type SupabaseUserProfile } from '../utils/routingUtils';
import { sqliteService } from '../services/sqliteService';
import { UserRole } from '../types';

vi.mock('../services/sqliteService', () => ({
  sqliteService: {
    countAtivos: vi.fn(),
    countAtivosByTenant: vi.fn()
  }
}));

const mockedSqlite = vi.mocked(sqliteService);

function masterUser(tenantid: string | null): SupabaseUserProfile {
  return {
    userId: 'u-master',
    email: 'master.teste@cliente.com',
    role: UserRole.MASTER,
    tenantid
  };
}

describe('processarRoteamentoPosLoginSaas — roteamento por tenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_ADMIN_EMAIL', 'semorr@gmail.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('MASTER de tenant sem dados → /load-database mesmo com base global cheia (CICOPAL em cache)', async () => {
    // Cache local global cheio (dados de outro contrato)...
    mockedSqlite.countAtivos.mockResolvedValue(12636);
    // ...mas o tenant do usuário não tem nada.
    mockedSqlite.countAtivosByTenant.mockResolvedValue(0);

    const nav = vi.fn();
    await processarRoteamentoPosLoginSaas(masterUser('CLIENTETESTE'), nav);

    expect(mockedSqlite.countAtivosByTenant).toHaveBeenCalledWith('CLIENTETESTE');
    expect(mockedSqlite.countAtivos).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/load-database');
  });

  it('MASTER com dados do próprio tenant → /admin/painel-controle', async () => {
    mockedSqlite.countAtivosByTenant.mockResolvedValue(500);

    const nav = vi.fn();
    await processarRoteamentoPosLoginSaas(masterUser('CLIENTETESTE'), nav);

    expect(nav).toHaveBeenCalledWith('/admin/painel-controle');
    expect(sessionStorage.getItem('gbr_active_tenant')).toBe('CLIENTETESTE');
  });

  it('MASTER sem tenantid é bloqueado (erro de consistência)', async () => {
    const nav = vi.fn();
    await expect(processarRoteamentoPosLoginSaas(masterUser(null), nav)).rejects.toThrow(
      /MASTER sem empresa vinculada/
    );
    expect(nav).not.toHaveBeenCalled();
  });

  it('super admin (dono, sem tenant) usa a contagem global e vai ao painel global', async () => {
    mockedSqlite.countAtivos.mockResolvedValue(12636);

    const nav = vi.fn();
    await processarRoteamentoPosLoginSaas(
      { userId: 'u-admin', email: 'semorr@gmail.com', role: UserRole.ADMIN, tenantid: null },
      nav
    );

    expect(mockedSqlite.countAtivos).toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/saas/painel-global');
  });

  it('auditor com base global cheia mas sem dados do tenant → aguardando carga', async () => {
    mockedSqlite.countAtivosByTenant.mockResolvedValue(0);

    const nav = vi.fn();
    await processarRoteamentoPosLoginSaas(
      { userId: 'u-aud', email: 'auditor@cliente.com', role: UserRole.AUDITOR, tenantid: 'CLIENTETESTE' },
      nav
    );

    expect(nav).toHaveBeenCalledWith('/auditor/aguardando-carga');
  });
});
