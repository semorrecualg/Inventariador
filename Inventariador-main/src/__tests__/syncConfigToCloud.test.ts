// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabase, syncConfigToCloud, getDatabaseMode } from '../services/supabaseService';

const supabaseStub = supabase as unknown as { from: (table: string) => unknown };

function stubTables() {
  const upsert = vi.fn();
  const insert = vi.fn().mockResolvedValue({ error: null });
  const fromSpy = vi
    .spyOn(supabaseStub, 'from')
    .mockImplementation((table: string) => (table === 'inventory_config' ? { upsert } : { insert }));

  return { upsert, insert, fromSpy };
}

/**
 * Modo nuvem: a configuração do contrato tem de subir para `config_<TENANT>`
 * (chave primária `id`) e, quando falha, deixar rasto em `audit_logs` com
 * `action = 'CONFIG_SYNC_FAIL'`.
 */
describe('syncConfigToCloud — modo nuvem', () => {
  let stubs: ReturnType<typeof stubTables>;

  const config = {
    status: 'IN_USE',
    companies: ['010101 CICOPAL GO'],
    lastUpdated: '2026-11-12T02:59:07.536Z',
    darkMode: true
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    stubs = stubTables();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('faz o upsert com id config_<TENANT> (chave primária)', async () => {
    expect(getDatabaseMode()).toBe('SUPABASE');
    stubs.upsert.mockResolvedValue({ error: null });

    await syncConfigToCloud(config as never, 'CICOPAL');

    expect(stubs.fromSpy).toHaveBeenCalledWith('inventory_config');
    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    const [payload, options] = stubs.upsert.mock.calls[0];
    expect(payload.id).toBe('config_CICOPAL');
    expect(payload.tenantid).toBe('CICOPAL');
    expect(payload.status).toBe('IN_USE');
    expect(payload.last_updated).toBe('2026-11-12T02:59:07.536Z');
    expect(payload.dark_mode).toBe(true);
    expect(options).toEqual({ onConflict: 'id' });
  });

  it('registra CONFIG_SYNC_FAIL em audit_logs quando a gravação falha', async () => {
    stubs.upsert.mockResolvedValue({
      error: { code: '42501', message: 'permission denied for table inventory_config' }
    });

    await expect(syncConfigToCloud(config as never, 'CICOPAL')).rejects.toMatchObject({
      code: '42501'
    });

    await vi.waitFor(() => expect(stubs.insert).toHaveBeenCalled());

    const entry = stubs.insert.mock.calls[0][0][0];
    expect(entry.action).toBe('CONFIG_SYNC_FAIL');
    expect(entry.table_name).toBe('inventory_config');
    expect(entry.record_id).toBe('config_CICOPAL');
    expect(String(entry.details)).toContain('config_CICOPAL');
    expect(String(entry.details)).toContain('42501');
    // A auditoria não pode virar gravação de config: só a config levou upsert.
    expect(stubs.upsert).toHaveBeenCalledTimes(1);
  });
});
