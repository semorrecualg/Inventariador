// @vitest-environment jsdom
// src/__tests__/postSelectionRouting.test.ts
// Após a escolha de contrato/filial no seletor pós-login, o app roteia com o
// NOVO contexto: base vazia do contrato → primeira carga (GESTOR); auditor com
// base pronta → hub da filial direto (sem repetir a seleção de unidade).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolvePostSelectionScreen } from '../utils/routingUtils';
import { sqliteService } from '../services/sqliteService';
import { AppScreen, UserRole } from '../types';

vi.mock('../services/sqliteService', () => ({
  sqliteService: {
    countAtivos: vi.fn(),
    countAtivosByTenant: vi.fn()
  }
}));

const mockedSqlite = vi.mocked(sqliteService);

function profile(role: UserRole, email: string, tenantid: string | null) {
  return { email, role, tenantid };
}

describe('resolvePostSelectionScreen — roteamento após escolher contrato/filial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_ADMIN_EMAIL', 'semorr@gmail.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('MASTER com contrato vazio → GESTOR DE BASE (primeira carga)', async () => {
    mockedSqlite.countAtivosByTenant.mockResolvedValue(0);
    const screen = await resolvePostSelectionScreen(profile(UserRole.MASTER, 'master.teste@cliente.com', 'CLIENTETESTE'));
    expect(mockedSqlite.countAtivosByTenant).toHaveBeenCalledWith('CLIENTETESTE');
    expect(screen).toBe(AppScreen.DATABASE_MANAGER);
  });

  it('MASTER com dados do contrato escolhido → painel (módulos)', async () => {
    mockedSqlite.countAtivosByTenant.mockResolvedValue(2066);
    const screen = await resolvePostSelectionScreen(profile(UserRole.MASTER, 'master.teste@cliente.com', 'CLIENTETESTE'));
    expect(screen).toBe(AppScreen.MODULE_SELECTION);
  });

  it('auditor com contrato vazio → aguardando provisionamento (módulos)', async () => {
    mockedSqlite.countAtivosByTenant.mockResolvedValue(0);
    const screen = await resolvePostSelectionScreen(profile(UserRole.AUDITOR, 'auditor@cliente.com', 'CICOPAL'));
    expect(screen).toBe(AppScreen.MODULE_SELECTION);
  });

  it('auditor com base pronta → hub da filial DIRETO (sem repetir seleção)', async () => {
    mockedSqlite.countAtivosByTenant.mockResolvedValue(1200);
    const screen = await resolvePostSelectionScreen(profile(UserRole.AUDITOR, 'auditor@cliente.com', 'CICOPAL'));
    expect(screen).toBe(AppScreen.MAIN_MENU);
  });

  it('dono (super admin) → painel global, sem depender da contagem', async () => {
    mockedSqlite.countAtivos.mockResolvedValue(12636);
    const screen = await resolvePostSelectionScreen(profile(UserRole.ADMIN, 'semorr@gmail.com', null));
    expect(screen).toBe(AppScreen.MODULE_SELECTION);
  });

  it('DEMO → dashboard de demonstração', async () => {
    const screen = await resolvePostSelectionScreen(profile(UserRole.DEMO, 'demo@gbr.com', null));
    expect(screen).toBe(AppScreen.DASHBOARD);
  });
});
