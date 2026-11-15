// @vitest-environment jsdom
// ============================================================================
// fiscalAccountResync.test.ts — reparação única da conta 131105001
//
// O corte fiscal marcava os registos da conta `131105001` com `_is_synced = 1`
// e seguia sem upsert. Retirar o corte não os recupera: a fila só lê
// `_is_synced = 0`. Estes testes garantem que a reparação os devolve à fila uma
// vez, que não apanha outros registos e que a partir daí eles sobem de facto.
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
import {
  FISCAL_ACCOUNT_REPAIR_FLAG,
  processDataSyncQueue,
  requeueFiscalAccountRecordsOnce
} from '../services/syncService';

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
    contacontabil: '131105001',
    sn1_recno: 6569,
    vlraquisic: 10,
    _conferido: 1,
    _is_synced: 1, // marcado pelo corte fiscal, sem ter chegado à nuvem
    _is_deleted: 0,
    _auditor: 'semorr@gmail.com',
    _dataLeitura: '2026-11-12T13:00:00.000Z',
    ...over
  }) as Record<string, unknown>;

describe('reparação única da conta fiscal 131105001', () => {
  beforeEach(async () => {
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    localStorage.clear();
    sessionStorage.clear();
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
    sessionStorage.setItem('tenantid', 'CICOPAL');
  });

  it('devolve à fila os registos da conta dados por sincronizados, também nos espelhos', async () => {
    await db.local_assets.put(asset() as never);
    await db.ativos.put(asset() as never);
    await db.assets.put(asset() as never);

    const requeued = await requeueFiscalAccountRecordsOnce();

    expect(requeued).toBe(1);
    const local = await db.local_assets.where('primarykey').equals('01010100000005000001').first();
    const ativo = await db.ativos.where('primarykey').equals('01010100000005000001').first();
    const espelho = await db.assets.where('primarykey').equals('01010100000005000001').first();
    expect(Number(local?._is_synced)).toBe(0);
    expect(Number(ativo?._is_synced)).toBe(0);
    expect(Number(espelho?._is_synced)).toBe(0);
    expect(localStorage.getItem(FISCAL_ACCOUNT_REPAIR_FLAG)).toBe('done');

    // O resultado fica auditado com a origem e a contagem.
    const logs = await db.audit_logs.filter((log) => log.acao === 'FISCAL_ACCOUNT_RESYNC').toArray();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].details)).toContain('origem: sync');
    expect(String(logs[0].details)).toContain('1 registo(s)');
  });

  it('no arranque usa a mesma flag: repara uma vez e regista a origem', async () => {
    await db.local_assets.put(asset() as never);

    expect(await requeueFiscalAccountRecordsOnce('startup')).toBe(1);

    const logs = await db.audit_logs.filter((log) => log.acao === 'FISCAL_ACCOUNT_RESYNC').toArray();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].details)).toContain('origem: startup');

    // O ciclo de sincronização que corra depois não repete nem audita de novo.
    await db.local_assets.where('primarykey').equals('01010100000005000001').modify({ _is_synced: 1 });
    expect(await requeueFiscalAccountRecordsOnce('sync')).toBe(0);
    const depois = await db.audit_logs.filter((log) => log.acao === 'FISCAL_ACCOUNT_RESYNC').toArray();
    expect(depois).toHaveLength(1);
  });

  it('deteta a conta mesmo quando o ERP a entrega concatenada com o nome', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-CONC', id: 'PK-CONC', contacontabil: '131105001PROJETOSEMANDAMENTO' }) as never,
      asset({ primarykey: 'PK-OUTRA', id: 'PK-OUTRA', contacontabil: '131102001EQUIPAMENTOSDETELEFONIA' }) as never
    ]);

    const requeued = await requeueFiscalAccountRecordsOnce();

    expect(requeued).toBe(1);
    const conc = await db.local_assets.where('primarykey').equals('PK-CONC').first();
    const outra = await db.local_assets.where('primarykey').equals('PK-OUTRA').first();
    expect(Number(conc?._is_synced)).toBe(0);
    expect(Number(outra?._is_synced)).toBe(1);
  });

  it('não mexe noutras contas nem em registos apagados', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-OUTRA', id: 'PK-OUTRA', contacontabil: '131101001' }) as never,
      asset({ primarykey: 'PK-APAGADO', id: 'PK-APAGADO', _is_deleted: 1 }) as never,
      asset({ primarykey: 'PK-PENDENTE', id: 'PK-PENDENTE', _is_synced: 0 }) as never
    ]);

    const requeued = await requeueFiscalAccountRecordsOnce();

    expect(requeued).toBe(0);
    const outra = await db.local_assets.where('primarykey').equals('PK-OUTRA').first();
    const apagado = await db.local_assets.where('primarykey').equals('PK-APAGADO').first();
    expect(Number(outra?._is_synced)).toBe(1);
    expect(Number(apagado?._is_synced)).toBe(1);
  });

  it('corre uma só vez por instalação: não reabre registos já depois da reparação', async () => {
    await db.local_assets.put(asset() as never);
    expect(await requeueFiscalAccountRecordsOnce()).toBe(1);

    // Um registo da conta volta a ser marcado como sincronizado (envio novo).
    await db.local_assets.where('primarykey').equals('01010100000005000001').modify({ _is_synced: 1 });

    expect(await requeueFiscalAccountRecordsOnce()).toBe(0);
    const local = await db.local_assets.where('primarykey').equals('01010100000005000001').first();
    expect(Number(local?._is_synced)).toBe(1);
  });

  it('arranque e sincronização simultâneos não executam a reparação duas vezes', async () => {
    await db.local_assets.put(asset() as never);

    const [primeiro, segundo] = await Promise.all([
      requeueFiscalAccountRecordsOnce('startup'),
      requeueFiscalAccountRecordsOnce('sync')
    ]);

    // As duas chamadas partilham a mesma execução (mesmo resultado)...
    expect(primeiro).toBe(1);
    expect(segundo).toBe(1);
    const logs = await db.audit_logs.filter((log) => log.acao === 'FISCAL_ACCOUNT_RESYNC').toArray();
    expect(logs).toHaveLength(1);
  });

  it('na fila real: o registo reparado é enviado à nuvem', async () => {
    await db.local_assets.put(asset() as never);

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect((upsert.mock.calls[0][0] as Record<string, unknown>).contacontabil).toBe('131105001');

    const local = await db.local_assets.where('primarykey').equals('01010100000005000001').first();
    expect(Number(local?._is_synced)).toBe(1);
  });
});
