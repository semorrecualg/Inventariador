// @vitest-environment jsdom
// ============================================================================
// syncFailureStamp.test.ts — a fila carimba a recusa no registo local.
//
// A recusa da nuvem ia só para `audit_logs`; o cartão continuava a mostrar o
// âmbar genérico de pendente. Este teste conduz o ciclo real de
// `processDataSyncQueue` (Supabase stubado) e verifica o carimbo que alimenta o
// selo vermelho — incluindo o limite de escritas e a limpeza no sucesso.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// O modo (INTERNAL vs SUPABASE) é decidido no carregamento de `supabaseService`
// pelas credenciais. `vi.hoisted` corre antes dos imports: num ambiente sem
// `.env` (o CI) o stub tem de estar em vigor nesse instante, senão o modo fica
// INTERNAL, a guarda da BASE LOCAL fecha a fila e o carimbo nunca é exercitado.
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
});

const upsert = vi.fn();
// Guarda «exclusão vence a subida»: mockada para não ir à rede (nada apagado).
const { fetchCloudDeletedKeys } = vi.hoisted(() => ({ fetchCloudDeletedKeys: vi.fn() }));
fetchCloudDeletedKeys.mockResolvedValue(new Set<string>());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) }
}));

vi.mock('../services/supabaseService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/supabaseService')>();
  return {
    ...actual,
    supabase: {
      from: () => ({ upsert: (...args: unknown[]) => upsert(...args) })
    },
    fetchCloudDeletedKeys,
    registerCampaignSyncQueueDelegate: vi.fn()
  };
});

import { db, sqliteService } from '../services/sqliteService';
import { processDataSyncQueue } from '../services/syncService';
import { SYNC_FAILURE_STAMP_WINDOW_MS } from '../utils/syncFalha';

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

describe('processDataSyncQueue — carimbo da recusa no registo local', () => {
  beforeEach(async () => {
    upsert.mockReset();
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    localStorage.removeItem('filial');
    localStorage.removeItem('app_selected_unit');
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
    sessionStorage.setItem('tenantid', 'CICOPAL');
  });

  it('carimba o ativo quando a nuvem recusa o upsert', async () => {
    upsert.mockResolvedValue({ error: RLS });
    await db.local_assets.put(asset() as never);

    const result = await processDataSyncQueue();

    expect(result.failedCount).toBe(1);
    const local = await registoLocal();
    // Continua pendente — o carimbo diz PORQUÊ, não esconde a pendência.
    expect(Number(local?._is_synced)).toBe(0);
    expect(typeof local?._syncFailAt).toBe('string');
    expect(String(local?._syncFailReason)).toContain('row-level security');
    expect(Date.now() - new Date(String(local?._syncFailAt)).getTime()).toBeLessThan(
      SYNC_FAILURE_STAMP_WINDOW_MS
    );
  });

  it('também carimba quando o envio lança uma exceção', async () => {
    upsert.mockRejectedValue(new Error('rede caiu'));
    await db.local_assets.put(asset() as never);

    await processDataSyncQueue();

    const local = await registoLocal();
    expect(Number(local?._is_synced)).toBe(0);
    expect(String(local?._syncFailReason)).toContain('rede caiu');
  });

  it('não reescreve o carimbo no ciclo seguinte com o mesmo erro', async () => {
    upsert.mockResolvedValue({ error: RLS });
    await db.local_assets.put(asset() as never);
    await processDataSyncQueue();
    const primeiroCarimbo = String((await registoLocal())?._syncFailAt);

    await processDataSyncQueue();

    expect(String((await registoLocal())?._syncFailAt)).toBe(primeiroCarimbo);
  });

  it('carimba de novo quando o motivo muda', async () => {
    upsert.mockResolvedValue({ error: RLS });
    await db.local_assets.put(asset() as never);
    await processDataSyncQueue();
    const primeiroCarimbo = String((await registoLocal())?._syncFailAt);

    upsert.mockReset();
    upsert.mockResolvedValue({ error: { message: 'timeout ao gravar', code: 'ETIMEDOUT' } });
    await processDataSyncQueue();

    const local = await registoLocal();
    expect(String(local?._syncFailAt)).not.toBe(primeiroCarimbo);
    expect(String(local?._syncFailReason)).toContain('timeout');
  });

  it('a marcação de sincronizado de outro caminho também apaga o carimbo', async () => {
    upsert.mockResolvedValue({ error: RLS });
    await db.local_assets.put(asset() as never);
    await processDataSyncQueue();
    expect((await registoLocal())?._syncFailAt).toBeTruthy();

    // `syncAssetsToCloudAndMark` marca por `sqliteService.markAssetsSynced`.
    await sqliteService.markAssetsSynced(['01010100000005000001']);

    const local = await registoLocal();
    expect(local?._syncFailAt).toBeUndefined();
    expect(Number(local?._is_synced)).toBe(1);
  });

  it('apaga o carimbo quando o envio é aceite', async () => {
    upsert.mockResolvedValue({ error: RLS });
    await db.local_assets.put(asset() as never);
    await processDataSyncQueue();
    expect((await registoLocal())?._syncFailAt).toBeTruthy();

    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    await processDataSyncQueue();

    const local = await registoLocal();
    expect(local?._syncFailAt).toBeUndefined();
    expect(local?._syncFailReason).toBeUndefined();
    expect(Number(local?._is_synced)).toBe(1);
  });
});
