// @vitest-environment jsdom
// ============================================================================
// syncConfigToCloud.test.ts — Regressão (run #98): o job de testes do CI NÃO
// recebe os secrets do Supabase, por isso `isInternalMode` valia `true`, o
// módulo nascia em modo INTERNAL e `syncConfigToCloud` saía cedo — o teste caía
// com "expected 'INTERNAL' to be 'SUPABASE'" e a promessa rejeitada nunca
// acontecia. As credenciais falsas abaixo são fixadas ANTES do import dinâmico
// (mesmo padrão de fetchTenantFiliais.test.ts), de modo que o resultado não
// depende do ambiente de quem corre os testes.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';
import { db } from '../services/sqliteService';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

let syncConfigToCloud: typeof SupabaseService.syncConfigToCloud;
let getDatabaseMode: typeof SupabaseService.getDatabaseMode;
let supabaseStub: { from: (table: string) => unknown };

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

  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    syncConfigToCloud = mod.syncConfigToCloud;
    getDatabaseMode = mod.getDatabaseMode;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  });

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

  it('sem contrato não envia config e NÃO encerra a sessão', async () => {
    // Autosave em segundo plano (logout, dono global antes de escolher o
    // contrato): antes disparava `gbr_session_expired` e o utilizador levava
    // com o modal "SESSÃO EXPIRADA · envio das configurações bloqueado" sem
    // ter perdido sessão nenhuma.
    const events: Event[] = [];
    const listener = (event: Event) => events.push(event);
    window.addEventListener('gbr_session_expired', listener);

    try {
      await syncConfigToCloud(config as never);
    } finally {
      window.removeEventListener('gbr_session_expired', listener);
    }

    expect(stubs.upsert).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
  });

  it('registra CONFIG_SYNC_FAIL na trilha local quando a gravação falha', async () => {
    await db.audit_logs.clear();
    stubs.upsert.mockResolvedValue({
      error: { code: '42501', message: 'permission denied for table inventory_config' }
    });

    await expect(syncConfigToCloud(config as never, 'CICOPAL')).rejects.toMatchObject({
      code: '42501'
    });

    // F2: a trilha é gravada no Dexie e sobe pela fila. Não há mais `insert`
    // direto em `audit_logs` — por isso o rasto tem de estar no aparelho, por
    // subir (`_synced: 0`), e não numa chamada à nuvem.
    await vi.waitFor(async () => {
      expect(await db.audit_logs.count()).toBeGreaterThan(0);
    });

    const entry = (await db.audit_logs.toArray()).find((log) => log.acao === 'CONFIG_SYNC_FAIL');
    expect(entry).toBeTruthy();
    expect(entry?.tabela).toBe('inventory_config');
    expect(entry?.registro_id).toBe('config_CICOPAL');
    expect(String(entry?.details)).toContain('config_CICOPAL');
    expect(String(entry?.details)).toContain('42501');
    expect(entry?._synced).toBe(0);
    // A auditoria não pode virar gravação de config: só a config levou upsert.
    expect(stubs.insert).not.toHaveBeenCalled();
    expect(stubs.upsert).toHaveBeenCalledTimes(1);
  });
});
