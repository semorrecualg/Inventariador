// @vitest-environment jsdom
// ============================================================================
// syncPushQueue.test.ts — Regressão do "PENDENTE NUVEM" eterno.
//
// `processDataSyncQueue` começava com uma constante fixa em `true`
// (`IS_OFFLINE_FIRST_PHASE`) que devolvia `{ success: true, processedCount: 0 }`
// sem enviar nada. O Supabase estava conectado, o login era válido, o ativo era
// conferido no aparelho — e a nuvem nunca recebia a conferência. Estes testes
// garantem que a fila faz o upsert de verdade e leva a conferência junto.
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

describe('processDataSyncQueue — envio real da conferência do aparelho', () => {
  beforeEach(async () => {
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
    sessionStorage.setItem('tenantid', 'CICOPAL');
  });

  it('envia o ativo pendente e leva conferido, auditor e data da leitura', async () => {
    await db.local_assets.put(asset() as never);

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBeGreaterThan(0);
    expect(upsert).toHaveBeenCalledTimes(1);

    const payload = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      tenantid: 'CICOPAL',
      primarykey: '01010100000005000001',
      etiqueta: '000420',
      conferido: true,
      auditor: 'semorr@gmail.com',
      data_leitura: '2026-11-12T13:00:00.000Z'
    });

    // A etiqueta PENDENTE NUVEM só desaparece com a marcação local.
    const local = await db.local_assets.where('primarykey').equals('01010100000005000001').first();
    expect(Number(local?._is_synced)).toBe(1);
  });

  it('reenvia sem a coluna que a nuvem ainda não tem, em vez de perder o ativo', async () => {
    await db.local_assets.put(asset() as never);

    // O payload é mutado entre tentativas — guarda-se uma cópia de cada envio.
    const envelopes: Record<string, unknown>[] = [];
    const responses = [
      { error: { code: 'PGRST204', message: "Could not find the 'conferido' column of 'assets' in the schema cache" } },
      { error: null }
    ];
    upsert.mockImplementation((payload: Record<string, unknown>) => {
      envelopes.push({ ...payload });
      return Promise.resolve(responses[envelopes.length - 1]);
    });

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBeGreaterThan(0);
    expect(envelopes).toHaveLength(2);
    expect(envelopes[0]).toHaveProperty('conferido');
    expect(envelopes[1]).not.toHaveProperty('conferido');
    // O resto da conferência continua a subir.
    expect(envelopes[1]).toMatchObject({ auditor: 'semorr@gmail.com' });
  });

  it('não envia nada quando o ativo pertence a outro contrato', async () => {
    await db.local_assets.put(asset({ tenantid: 'OUTRO', filial: '010101 CICOPAL GO' }) as never);

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
    const logs = await db.audit_logs.filter((log) => log.acao === 'SYNC_PENDING_DISCARDED').toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0].details).toContain('OUTRO');
  });

  it('aceita o mesmo rótulo de unidade escrito de outra forma', async () => {
    await db.local_assets.put(asset({ filial: '010101 CICOPAL GO' }) as never);
    sessionStorage.setItem('filial', '010101');

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBeGreaterThan(0);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(await db.audit_logs.filter((log) => log.acao === 'SYNC_PENDING_DISCARDED').count()).toBe(0);
  });
});

describe('filtro de filial da fila — tolerância ao rótulo da unidade', () => {
  const variacoes: Array<[string, string]> = [
    ['010101 CICOPAL GO', '010101'],
    ['010101', '010101 CICOPAL GO'],
    ['010101-CICOPAL-GO', '010101 CICOPAL GO'],
    ['010101 cicopal go', '010101 CICOPAL GO'],
    [' 010101  CICOPAL  GO ', '010101 CICOPAL GO']
  ];

  beforeEach(async () => {
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    await db.local_assets.clear();
    await db.audit_logs.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    sessionStorage.setItem('tenantid', 'CICOPAL');
  });

  it.each(variacoes)('sincroniza com filial do registo %s e da sessão %s', async (registro, sessao) => {
    await db.local_assets.put(asset({ filial: registro }) as never);
    sessionStorage.setItem('filial', sessao);

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBeGreaterThan(0);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('NÃO mistura unidades diferentes do mesmo contrato', async () => {
    await db.local_assets.put(asset({ filial: '010105 CICOPAL PA' }) as never);
    sessionStorage.setItem('filial', '010101 CICOPAL GO');

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('descarte de pendentes — registro em audit_logs', () => {
  beforeEach(async () => {
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    await db.local_assets.clear();
    await db.audit_logs.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    sessionStorage.setItem('tenantid', 'CICOPAL');
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
  });

  const discardLogs = () => db.audit_logs.filter((log) => log.acao === 'SYNC_PENDING_DISCARDED').toArray();

  it('diz na auditoria quantos pendentes caíram e de que contrato/filial eram', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', id: 'PK-1', filial: '010105 CICOPAL PA' }) as never,
      asset({ primarykey: 'PK-2', id: 'PK-2', filial: '010201 SNACKS PA' }) as never
    ]);

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBe(0);
    expect(upsert).not.toHaveBeenCalled();

    const logs = await discardLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].registro_id).toBe('CICOPAL|010101 CICOPAL GO');
    expect(logs[0].details).toContain('Todos os 2 ativo(s) pendente(s)');
    expect(logs[0].details).toContain('010105 CICOPAL PA');
    expect(logs[0].details).toContain('010201 SNACKS PA');
    expect(logs[0].details).toContain('Nada foi apagado');
    expect(JSON.parse(String(logs[0].delta))).toMatchObject({
      pending: { count: 2 }
    });

    // O ciclo roda a cada 60 s: a mesma situação não vira uma enxurrada de logs.
    await processDataSyncQueue();
    expect(await discardLogs()).toHaveLength(1);
  });

  it('não registra nada quando há pendentes que casam com a sessão', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-1', id: 'PK-1' }) as never,
      asset({ primarykey: 'PK-2', id: 'PK-2', filial: '010105 CICOPAL PA' }) as never
    ]);

    await processDataSyncQueue();

    expect(await discardLogs()).toHaveLength(0);
  });
});
