// @vitest-environment jsdom
// ============================================================================
// esperaDeSessao.test.ts — sem sessão o pendente NÃO é uma recusa.
//
// O portão já parava o ciclo antes do primeiro upsert; o que faltava era o meio
// do ciclo: se a sessão desaparece (logout noutro separador, refresh recusado)
// o 42501 do PostgREST não é uma recusa de dados — o registo continua pendente
// e o cartão diz «à espera de sessão». Este teste fixa as duas metades: nada é
// carimbado sem sessão, e uma recusa com sessão continua a ser carimbada.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
});

const upsert = vi.fn();
const { fetchCloudDeletedKeys, fetchCloudConflictRows } = vi.hoisted(() => ({
  fetchCloudDeletedKeys: vi.fn(),
  fetchCloudConflictRows: vi.fn()
}));
fetchCloudDeletedKeys.mockResolvedValue(new Set<string>());
fetchCloudConflictRows.mockResolvedValue(new Map<string, Record<string, unknown>>());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) }
}));

/** Sessão que o portão lê; cada teste decide se o aparelho a tem. */
let sessaoAtual: { access_token?: string; user?: { email?: string } } | null = null;

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>();
  // O portão corre DENTRO do módulo real e lê o cliente interno: o spy tem de
  // ser no `actual.supabase`, não no cliente substituído para o upsert.
  const auth = actual.supabase.auth as unknown as { getSession: () => Promise<unknown> };
  vi.spyOn(auth, 'getSession').mockImplementation(async () => ({
    data: { session: sessaoAtual },
    error: null
  }) as never);
  return {
    ...actual,
    supabase: {
      from: () => ({ upsert: (...args: unknown[]) => upsert(...args) })
    },
    fetchCloudDeletedKeys,
    fetchCloudConflictRows,
    registerCampaignSyncQueueDelegate: vi.fn()
  };
});

import { db } from '../services/sqliteService';
import { processDataSyncQueue as drenarFilaReal } from '../services/syncService';
import { SessaoNuvemAusenteError } from '../services/supabaseService';

const asset = (over: Record<string, unknown> = {}) =>
  ({
    id: '01010100000005000001',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    filial_raw: '010101 CICOPAL GO',
    primarykey: '01010100000005000001',
    etiqueta: '000420',
    status: 'CONFERIDO',
    qt: 1,
    descricaodoativo: 'CHAVE FECHADORA DE POCOS',
    sn1_recno: 6569,
    vlraquisic: 10,
    _conferido: 1,
    _is_synced: 0,
    _is_deleted: 0,
    _auditor: 'semorr@gmail.com',
    _dataLeitura: '2026-11-12T13:00:00.000Z',
    ...over
  }) as Record<string, unknown>;

const registoLocal = () =>
  db.local_assets.where('primarykey').equals('01010100000005000001').first();

const RLS = { message: 'new row violates row-level security policy', code: '42501' };

describe('processDataSyncQueue — pendentes à espera de sessão', () => {
  beforeEach(async () => {
    upsert.mockReset();
    sessaoAtual = { access_token: 'jwt-válido', user: { email: 'semorr@gmail.com' } };
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.audit_logs.clear();
    await db.sync_outbox.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    localStorage.removeItem('filial');
    localStorage.removeItem('app_selected_unit');
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
    sessionStorage.setItem('tenantid', 'CICOPAL');
  });

  it('sem sessão desde o início, o ciclo para e não carimba o registo', async () => {
    sessaoAtual = null;
    await db.local_assets.put(asset() as never);

    const result = await drenarFilaReal();

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/sem sessão/i);
    expect(upsert).not.toHaveBeenCalled();
    const local = await registoLocal();
    expect(Number(local?._is_synced)).toBe(0);
    expect(local?._syncFailAt).toBeUndefined();
    expect(local?._syncFailReason).toBeUndefined();
  });

  it('sessão perdida a meio do ciclo deixa o registo à espera, sem carimbo', async () => {
    const { syncAssetsToCloud } = await import('../services/supabaseService');
    // O isolamento por linha chama `syncAssetsToCloud`; é aí que o portão de
    // sessão lança quando o token desaparece a meio do ciclo.
    void syncAssetsToCloud;
    upsert.mockImplementation(() => { throw new SessaoNuvemAusenteError(); });
    await db.local_assets.put(asset() as never);

    const result = await drenarFilaReal();

    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/sem sessão/i);
    const local = await registoLocal();
    expect(Number(local?._is_synced)).toBe(0);
    expect(local?._syncFailAt).toBeUndefined();
    expect(local?._syncFailReason).toBeUndefined();
  });

  it('a mesma recusa com sessão válida continua a ser carimbada como falha', async () => {
    upsert.mockResolvedValue({ error: RLS });
    await db.local_assets.put(asset() as never);

    const result = await drenarFilaReal();

    expect(result.failedCount).toBe(1);
    const local = await registoLocal();
    expect(Number(local?._is_synced)).toBe(0);
    expect(typeof local?._syncFailAt).toBe('string');
    expect(String(local?._syncFailReason)).toContain('row-level security');
  });
});
