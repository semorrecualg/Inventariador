// @vitest-environment jsdom
// ============================================================================
// syncRecordFailAudit.test.ts — o SYNC_RECORD_FAIL não inunda a auditoria.
//
// O ciclo de sincronização corre a cada 60 s (`App.tsx`). Sem janela, um ativo
// recusado pela nuvem (RLS, chave estrangeira) gravava uma linha em
// `audit_logs` a cada ciclo: ~1.440 linhas/dia por ativo, muito mais para um
// lote. `audit_logs` é a ferramenta com que se diagnosticou o «PENDENTE NUVEM»
// do #95 — inundada, o diagnóstico seguinte fica mais lento exactamente quando
// é preciso. Estes testes fixam a assinatura `primarykey|erro` e a janela.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

const upsert = vi.fn();

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
    registerCampaignSyncQueueDelegate: vi.fn()
  };
});

import { db } from '../services/sqliteService';
import { processDataSyncQueue } from '../services/syncService';

const RLS_ERROR = { code: '42501', message: 'new row violates row-level security policy' };

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

const failureLogs = () =>
  db.audit_logs.filter((log) => log.acao === 'SYNC_RECORD_FAIL').toArray();

beforeEach(async () => {
  upsert.mockReset();
  upsert.mockResolvedValue({ error: RLS_ERROR });
  await db.local_assets.clear();
  await db.ativos.clear();
  await db.assets.clear();
  await db.audit_logs.clear();
  localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
  localStorage.removeItem('filial');
  sessionStorage.setItem('filial', '010101 CICOPAL GO');
  sessionStorage.setItem('tenantid', 'CICOPAL');
});

describe('SYNC_RECORD_FAIL — uma linha por registo e por janela', () => {
  it('não repete a mesma recusa a cada ciclo de 60 s', async () => {
    await db.local_assets.put(asset() as never);

    await processDataSyncQueue();
    expect(await failureLogs()).toHaveLength(1);

    await processDataSyncQueue();
    await processDataSyncQueue();
    expect(await failureLogs()).toHaveLength(1);
  });

  it('um lote recusado grava uma linha por ativo, não uma por ciclo', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-A', id: 'PK-A' }) as never,
      asset({ primarykey: 'PK-B', id: 'PK-B' }) as never
    ]);

    await processDataSyncQueue();
    expect(await failureLogs()).toHaveLength(2);

    await processDataSyncQueue();
    expect(await failureLogs()).toHaveLength(2);
  });

  it('volta a registar a mesma falha depois da janela de 10 min', async () => {
    await db.local_assets.put(asset() as never);

    await processDataSyncQueue();
    const [log] = await failureLogs();
    expect(log).toBeTruthy();

    // Recua a linha para fora da janela: a próxima recusa volta a ser auditada.
    await db.audit_logs.update(String(log.id), {
      updated_at: new Date(Date.now() - 11 * 60 * 1000).toISOString()
    });
    await processDataSyncQueue();
    expect(await failureLogs()).toHaveLength(2);
  });

  it('um erro diferente do mesmo ativo é registado', async () => {
    await db.local_assets.put(asset() as never);

    await processDataSyncQueue();
    upsert.mockResolvedValue({ error: { code: '23503', message: 'insert violates foreign key constraint' } });
    await processDataSyncQueue();

    expect(await failureLogs()).toHaveLength(2);
  });
});
