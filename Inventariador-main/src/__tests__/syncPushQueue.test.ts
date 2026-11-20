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
import { ASSETS_CONFLICT_TARGET, processDataSyncQueue } from '../services/syncService';
import { SyncRequestTimeoutError, UPSERT_TIMEOUT_MS } from '../services/syncQueueGuards';

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
    localStorage.removeItem('filial');
    localStorage.removeItem('app_selected_unit');
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

    // O upsert tem de declarar a chave de origem: sem alvo de conflito o
    // PostgREST usa (tenantid, id), a fila não envia `id` e o INSERT colide com
    // o índice único (tenantid, primarykey) — o 23505 eterno dos ecrãs.
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: ASSETS_CONFLICT_TARGET });

    // A etiqueta PENDENTE NUVEM só desaparece com a marcação local.
    const local = await db.local_assets.where('primarykey').equals('01010100000005000001').first();
    expect(Number(local?._is_synced)).toBe(1);
  });

  // O CARIMBO DA NUVEM É DO SERVIDOR: se a fila enviasse `updated_at`, um
  // relógio adiantado no aparelho empurrava o checkpoint do pull delta para o
  // futuro e os outros aparelhos saltavam alterações até esse instante. Quem
  // escreve o carimbo é o trigger `assets_touch_updated_at`
  // (scripts/assets-updated-at-trigger.sql); o cliente só lê.
  it('não envia updated_at — o carimbo da nuvem é do servidor', async () => {
    await db.local_assets.put(asset({ updated_at: '2026-11-12T13:00:00.000Z' }) as never);

    await processDataSyncQueue();

    const payload = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('updated_at');
    expect(payload.conferido).toBe(true);
  });

  // TIMEOUT ≠ RECUSA: o servidor pode só não ter respondido em 15 s. Carimbar
  // `_syncFailAt` pintava o cartão de «Falha de envio» e o operador lia o
  // atraso como recusa de dados (ecrãs de 2026-11-19).
  it('um timeout não carimba falha no registo e explica que haverá nova tentativa', async () => {
    await db.local_assets.put(asset() as never);
    upsert.mockRejectedValue(new SyncRequestTimeoutError(UPSERT_TIMEOUT_MS));

    await processDataSyncQueue();

    const local = await db.local_assets.where('primarykey').equals('01010100000005000001').first();
    expect(local?._syncFailAt).toBeUndefined();
    expect(Number(local?._is_synced)).toBe(0);

    const logs = await db.audit_logs.filter((log) => log.acao === 'SYNC_RECORD_EXCEPTION').toArray();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].delta)).toContain('nova tentativa automática');
  });

  it('um timeout pára o ciclo em vez de insistir em cada registo durante 15 s', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-A', id: 'PK-A' }) as never,
      asset({ primarykey: 'PK-B', id: 'PK-B' }) as never
    ]);
    upsert.mockRejectedValue(new SyncRequestTimeoutError(UPSERT_TIMEOUT_MS));

    await processDataSyncQueue();

    // O segundo ativo não chega a ser tentado: o servidor está mudo.
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(await db.local_assets.where('_is_synced').equals(0).count()).toBe(2);
  });

  it('um timeout seguido de sucesso deixa o ativo sincronizado e sem selo vermelho', async () => {
    await db.local_assets.put(asset() as never);
    upsert.mockRejectedValue(new SyncRequestTimeoutError(UPSERT_TIMEOUT_MS));
    await processDataSyncQueue();

    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    const result = await processDataSyncQueue();

    expect(result.processedCount).toBeGreaterThan(0);
    const local = await db.local_assets.where('primarykey').equals('01010100000005000001').first();
    expect(Number(local?._is_synced)).toBe(1);
    expect(local?._syncFailAt).toBeUndefined();
  });

  it('mantém o alvo de conflito na repetição que retira uma coluna inexistente', async () => {
    await db.local_assets.put(asset() as never);

    upsert.mockResolvedValueOnce({
      error: {
        code: 'PGRST204',
        message: "Could not find the 'conferido' column of 'assets' in the schema cache"
      }
    });

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBeGreaterThan(0);
    expect(upsert).toHaveBeenCalledTimes(2);
    for (const call of upsert.mock.calls) {
      expect(call[1]).toEqual({ onConflict: ASSETS_CONFLICT_TARGET });
    }
    const segundo = upsert.mock.calls[1][0] as Record<string, unknown>;
    expect(segundo).not.toHaveProperty('conferido');
  });

  it('42P10 diz que falta o índice, sem repetir o pedido', async () => {
    await db.local_assets.put(asset() as never);

    upsert.mockResolvedValue({
      error: {
        code: '42P10',
        message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification'
      }
    });

    await processDataSyncQueue();

    // Repetir não resolve: o índice tem de existir na nuvem.
    expect(upsert).toHaveBeenCalledTimes(1);

    const local = await db.local_assets.where('primarykey').equals('01010100000005000001').first();
    expect(Number(local?._is_synced)).toBe(0);
    expect(String(local?._syncFailReason)).toContain('índice único (tenantid, primarykey)');
  });

  // O Android esvazia o `sessionStorage` quando mata a WebView em segundo
  // plano. A filial continuava visível no ecrã (a UI cai para o `localStorage`),
  // mas as guardas do envio liam só a sessão: o ciclo voltava em silêncio sem
  // enviar nada e o ativo ficava «PENDENTE NUVEM» para sempre.
  it('envia mesmo quando o reinício da WebView esvazia a filial da sessão', async () => {
    await db.local_assets.put(asset() as never);
    sessionStorage.removeItem('filial');
    localStorage.setItem('filial', '010101 CICOPAL GO');

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBeGreaterThan(0);
    expect(upsert).toHaveBeenCalledTimes(1);
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

  it('marca cada registo logo após o sucesso, mesmo que o seguinte falhe', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-A', id: 'PK-A' }) as never,
      asset({ primarykey: 'PK-B', id: 'PK-B' }) as never
    ]);

    // Rede cai no segundo registo: o primeiro já subiu e TEM de ficar marcado.
    // Antes a marcação só acontecia no fim do laço — uma quebra a meio perdia
    // o progresso e o operador via 45 pendentes com 15 já na nuvem.
    upsert.mockImplementation((payload: Record<string, unknown>) =>
      payload.primarykey === 'PK-A'
        ? Promise.resolve({ error: null })
        : Promise.reject(new Error('rede caiu'))
    );

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBe(1);
    expect(result.failedCount).toBe(1);

    const enviado = await db.local_assets.where('primarykey').equals('PK-A').first();
    const pendente = await db.local_assets.where('primarykey').equals('PK-B').first();
    expect(Number(enviado?._is_synced)).toBe(1);
    expect(Number(pendente?._is_synced)).toBe(0);

    // A falha fica registada na auditoria para não ser invisível.
    const logs = await db.audit_logs.filter((log) => log.acao === 'SYNC_RECORD_EXCEPTION').toArray();
    expect(logs).toHaveLength(1);
    expect(String(logs[0].registro_id)).toBe('PK-B');

    // No ciclo seguinte só o que falhou é reenviado.
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    await processDataSyncQueue();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect((upsert.mock.calls[0][0] as Record<string, unknown>).primarykey).toBe('PK-B');
  });

  it('marca cada registo ANTES de tentar o próximo (progresso não se perde)', async () => {
    await db.local_assets.bulkPut([
      asset({ primarykey: 'PK-A', id: 'PK-A' }) as never,
      asset({ primarykey: 'PK-B', id: 'PK-B' }) as never
    ]);

    // Fotografa o estado local no instante de cada upsert. No código antigo a
    // marcação era um lote no fim do ciclo: no segundo envio nada estava
    // marcado, e qualquer interrupção (rede, app em segundo plano, pedido
    // pendurado) perdia o progresso — 15 de 45 subiram e 45 ficaram pendentes.
    const marcadosPorEnvio: string[] = [];
    upsert.mockImplementation(async () => {
      const locais = await db.local_assets.toArray();
      marcadosPorEnvio.push(
        locais.filter(r => Number(r._is_synced) === 1).map(r => String(r.primarykey)).sort().join(',')
      );
      return { error: null };
    });

    const result = await processDataSyncQueue();
    expect(result.processedCount).toBe(2);

    // No primeiro envio nada está marcado; no segundo, o primeiro já está.
    expect(marcadosPorEnvio[0]).toBe('');
    expect(marcadosPorEnvio[1]).toBe('PK-A');
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

// ----------------------------------------------------------------------------
// A conferência local chega em formatos diferentes conforme quem gravou: o App
// grava booleano, o carregador da planilha grava 0/1 e um JSON reimportado pode
// trazer o texto `'true'`. O payload só aceitava `Number(_conferido) === 1`,
// pelo que esses ativos subiam como PENDENTES e a nuvem ficava sem a
// conferência — o oposto do que se vê no aparelho.
// ----------------------------------------------------------------------------
describe('processDataSyncQueue — formatos da conferência local', () => {
  beforeEach(async () => {
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    await db.local_assets.clear();
    await db.audit_logs.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    localStorage.removeItem('filial');
    localStorage.removeItem('app_selected_unit');
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
    sessionStorage.setItem('tenantid', 'CICOPAL');
  });

  // `status: 'PENDENTE'` isola a flag: sem ele o marcador textual legado
  // (`status = 'CONFERIDO'`) tornaria todos os casos verdadeiros.
  it.each([
    ['booleano true', { _conferido: true }],
    ['número 1', { _conferido: 1 }],
    ['texto "1"', { _conferido: '1' }],
    ['texto "true"', { _conferido: 'true' }]
  ])('sobe como conferido o ativo gravado com %s', async (_rotulo, flag) => {
    await db.local_assets.put(asset({ status: 'PENDENTE', ...flag }) as never);

    const result = await processDataSyncQueue();

    expect(result.processedCount).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect((upsert.mock.calls[0][0] as Record<string, unknown>).conferido).toBe(true);
  });

  it('sobe como conferido o ativo conferido apenas pela coluna da base', async () => {
    await db.local_assets.put(
      asset({ status: 'PENDENTE', _conferido: 0, AUDITOR_STATUS_CONFERENCIA: 'SIM' }) as never
    );

    await processDataSyncQueue();

    expect(upsert).toHaveBeenCalledTimes(1);
    expect((upsert.mock.calls[0][0] as Record<string, unknown>).conferido).toBe(true);
  });

  it.each([
    ['flag 0 sem coluna', { _conferido: 0 }],
    ['texto "0"', { _conferido: '0' }],
    ['coluna NAO', { _conferido: 0, AUDITOR_STATUS_CONFERENCIA: 'NAO' }]
  ])('mantém pendente o ativo com %s', async (_rotulo, over) => {
    await db.local_assets.put(asset({ status: 'PENDENTE', ...over }) as never);

    await processDataSyncQueue();

    expect(upsert).toHaveBeenCalledTimes(1);
    expect((upsert.mock.calls[0][0] as Record<string, unknown>).conferido).toBe(false);
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

// ----------------------------------------------------------------------------
// A fila do ciclo de fundo constrói o payload à mão (não passa pelo
// `syncAssetsToCloud`), por isso a regra da coordenada tem de valer também
// aqui: um `gps_lat: null` no `ON CONFLICT DO UPDATE` apagaria na nuvem o ponto
// que outro aparelho já tinha gravado.
// ----------------------------------------------------------------------------
describe('processDataSyncQueue — a coordenada só sobe com leitura local', () => {
  beforeEach(async () => {
    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    await db.local_assets.clear();
    await db.audit_logs.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    localStorage.removeItem('filial');
    localStorage.removeItem('app_selected_unit');
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
    sessionStorage.setItem('tenantid', 'CICOPAL');
  });

  /** O payload da única escrita feita pelo ciclo. */
  const payloadDoCiclo = async (registro: Record<string, unknown>) => {
    await db.local_assets.put(registro as never);
    const result = await processDataSyncQueue();
    expect(result.processedCount).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    return upsert.mock.calls[0][0] as Record<string, unknown>;
  };

  it('converte latitude/longitude da conferência em gps_lat/gps_lng', async () => {
    const payload = await payloadDoCiclo(asset({ latitude: -15.7942, longitude: -47.8825 }));

    expect(payload.gps_lat).toBeCloseTo(-15.7942);
    expect(payload.gps_lng).toBeCloseTo(-47.8825);
  });

  it('sem leitura local OMITE as colunas e não apaga a coordenada da nuvem', async () => {
    const payload = await payloadDoCiclo(asset());

    expect(Object.prototype.hasOwnProperty.call(payload, 'gps_lat')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, 'gps_lng')).toBe(false);
  });

  it('não trata o par (0,0) nem a ausência como coordenada', async () => {
    const zero = await payloadDoCiclo(asset({ latitude: 0, longitude: 0 }));
    expect(Object.prototype.hasOwnProperty.call(zero, 'gps_lat')).toBe(false);

    upsert.mockReset();
    upsert.mockResolvedValue({ error: null });
    const nulo = await payloadDoCiclo(asset({ latitude: null, longitude: null, gps_lat: null, gps_lng: null }));
    expect(Object.prototype.hasOwnProperty.call(nulo, 'gps_lng')).toBe(false);
  });

  it('mantém a leitura que já estava na grafia da nuvem', async () => {
    const payload = await payloadDoCiclo(asset({ gps_lat: -16.68, gps_lng: -49.25 }));

    expect(payload.gps_lat).toBeCloseTo(-16.68);
    expect(payload.gps_lng).toBeCloseTo(-49.25);
  });
});
