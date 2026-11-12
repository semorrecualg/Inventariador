// @vitest-environment jsdom
// ============================================================================
// auditLogModeGate.test.ts — audit log num build SEM credenciais.
//
// `logAuditEvent` usava `localStorage.getItem('app_database_mode') === 'INTERNAL'`.
// Sem a chave gravada (e num build sem credenciais) isso dava `false`: o registo
// ia para o Supabase — que não existe — em vez do Dexie, e o evento de auditoria
// perdia-se. Agora decide por `getDatabaseMode()`.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build SEM credenciais: isInternalMode = true (lido na avaliação do módulo).
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
});

const { addAuditMock } = vi.hoisted(() => ({
  addAuditMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/localDbService', () => ({
  localDb: {
    auditLogs: { add: addAuditMock },
    assets: {},
    campaigns: {}
  }
}));

vi.mock('../services/sqliteService', () => ({
  db: {},
  sqliteService: {
    isImportingBatch: false,
    getIsInitialized: () => false,
    logAuditEvent: vi.fn(),
    persist: vi.fn()
  }
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const entry = {
  user_email: 'semorr@gmail.com',
  action: 'DELETE_ASSET',
  table_name: 'assets',
  record_id: 'PK-1',
  details: 'teste',
  tenantid: 'CICOPAL'
};

describe('logAuditEvent — build sem credenciais', () => {
  beforeEach(() => {
    localStorage.clear();
    addAuditMock.mockClear();
    vi.resetModules();
  });

  it('grava no Dexie mesmo sem `app_database_mode` gravado (não tenta a nuvem)', async () => {
    const mod = await import('../services/supabaseService');

    // Confirma o cenário: sem credenciais o modo resolvido é INTERNAL.
    expect(mod.getDatabaseMode()).toBe('INTERNAL');
    expect(mod.isInternalMode).toBe(true);

    await mod.logAuditEvent(entry);

    expect(addAuditMock).toHaveBeenCalledTimes(1);
    const saved = addAuditMock.mock.calls[0][0] as Record<string, unknown>;
    expect(saved.action).toBe('DELETE_ASSET');
    expect(saved.user).toBe('semorr@gmail.com');
  });

  it('também grava no Dexie com INTERNAL gravado de propósito', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    const mod = await import('../services/supabaseService');

    await mod.logAuditEvent(entry);

    expect(addAuditMock).toHaveBeenCalledTimes(1);
  });
});
