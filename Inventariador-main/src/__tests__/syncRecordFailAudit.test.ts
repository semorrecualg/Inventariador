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

// As credenciais decidem o modo no carregamento de `supabaseService`; sem elas
// o modo é INTERNAL e a guarda da BASE LOCAL devolve 0 envios. `vi.hoisted`
// corre antes dos imports: um ambiente sem `.env` (o CI) precisa deste stub em
// vigor nesse instante para a fila real de envio ser exercitada.
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

import { db } from '../services/sqliteService';
import { processDataSyncQueue } from '../services/syncService';
import { inicioDoDiaDaFalha } from '../utils/syncFalha';

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

const exceptionLogs = () =>
  db.audit_logs.filter((log) => log.acao === 'SYNC_RECORD_EXCEPTION').toArray();

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

  it('a mesma recusa com texto volátil (id, data, pilha) não volta a ser registada', async () => {
    const recusa = (pedido: string, quando: string) => ({
      error: {
        code: '42501',
        message: `new row violates row-level security policy (pedido ${pedido} em ${quando}, syncService.ts:751:13)`
      }
    });

    await db.local_assets.put(asset() as never);
    upsert.mockResolvedValue(recusa('7c9e6679-7425-40de-944b-e07fc1f90ae7', '2026-11-19T18:53:08.123Z'));
    await processDataSyncQueue();
    expect(await failureLogs()).toHaveLength(1);

    // Mesmo erro: mudam só o id do pedido, o instante e a linha da pilha.
    upsert.mockResolvedValue(recusa('0d1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d', '2026-11-19T19:41:52.877Z'));
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

  it('não volta a registar a mesma falha no mesmo dia — e volta no dia seguinte', async () => {
    await db.local_assets.put(asset() as never);

    await processDataSyncQueue();
    const [log] = await failureLogs();
    expect(log).toBeTruthy();

    // A janela das falhas preservadas é o DIA (item 14): no mesmo dia, mesmo que
    // a linha tenha horas, a recusa é a mesma e não ganha outra linha.
    await db.audit_logs.update(String(log.id), {
      // Meia-noite UTC: «agora - 11 min» cairia no dia anterior. A janela é o
      // DIA, por isso a prova fica em 00:01 de hoje — independe da hora do run.
      updated_at: new Date(Date.parse(inicioDoDiaDaFalha()) + 60_000).toISOString()
    });
    await processDataSyncQueue();
    expect(await failureLogs()).toHaveLength(1);

    // Ontem: a falha continua e o dia é novo — uma linha por dia, não zero.
    await db.audit_logs.update(String(log.id), {
      updated_at: new Date(Date.parse(inicioDoDiaDaFalha()) - 1).toISOString()
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

  it('a excepção lançada no upsert segue a mesma janela de 10 min', async () => {
    await db.local_assets.put(asset() as never);
    upsert.mockRejectedValue(new Error('rede caiu no envio'));

    await processDataSyncQueue();
    await processDataSyncQueue();
    await processDataSyncQueue();

    expect(await exceptionLogs()).toHaveLength(1);
    // A recusa da nuvem não é a mesma coisa: fica na acção dela.
    expect(await failureLogs()).toHaveLength(0);
  });

  it('uma excepção diferente do mesmo ativo é registada', async () => {
    await db.local_assets.put(asset() as never);
    upsert.mockRejectedValue(new Error('rede caiu no envio'));
    await processDataSyncQueue();

    upsert.mockRejectedValue(new Error('timeout do pedido'));
    await processDataSyncQueue();

    expect(await exceptionLogs()).toHaveLength(2);
  });

  it('a excepção segue o mesmo teto: uma linha por dia', async () => {
    await db.local_assets.put(asset() as never);
    upsert.mockRejectedValue(new Error('rede caiu no envio'));
    await processDataSyncQueue();

    const [log] = await exceptionLogs();
    expect(log).toBeTruthy();
    await db.audit_logs.update(String(log.id), {
      // Meia-noite UTC: «agora - 11 min» cairia no dia anterior. A janela é o
      // DIA, por isso a prova fica em 00:01 de hoje — independe da hora do run.
      updated_at: new Date(Date.parse(inicioDoDiaDaFalha()) + 60_000).toISOString()
    });

    await processDataSyncQueue();
    expect(await exceptionLogs()).toHaveLength(1);

    await db.audit_logs.update(String(log.id), {
      updated_at: new Date(Date.parse(inicioDoDiaDaFalha()) - 1).toISOString()
    });
    await processDataSyncQueue();
    expect(await exceptionLogs()).toHaveLength(2);
  });
});
