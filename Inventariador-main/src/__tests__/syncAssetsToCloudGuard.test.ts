// @vitest-environment jsdom
// ============================================================================
// syncAssetsToCloudGuard.test.ts — a guarda de envio tem de valer em TODOS os
// caminhos (autosave de fundo, push delta de boot, fila da nuvem, botão do
// Gestor), por isso é em `syncAssetsToCloud` que estes testes a prendem.
//
// Novo critério: a nuvem guarda uma linha por `(tenantid, primarykey)`. Duas
// linhas da planilha com a mesma etiqueta são registos distintos e sobem as
// duas; só o MESMO registo repetido no payload bloqueia.
// ============================================================================
import 'fake-indexeddb/auto';
import { autenticarClienteDeTeste } from './helpers/sessaoNuvemCliente';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';
import type { Asset } from '../types';
import { CloudPushBlockedError } from '../utils/cloudPushGuard';
import { BaseGenerationBlockedError } from '../utils/baseGeneration';
import { db } from '../services/sqliteService';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');

// O módulo lê `localStorage` no topo (getDatabaseMode). No Node 26 o global
// nativo sombreia o do jsdom, por isso o armazenamento é substituído aqui — o
// teste não depende do ambiente de quem corre.
const memoryStorage = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
  };
};
vi.stubGlobal('localStorage', memoryStorage());
vi.stubGlobal('sessionStorage', memoryStorage());

let syncAssetsToCloud: typeof SupabaseService.syncAssetsToCloud;
let resetNotice: typeof SupabaseService.resetCloudPushBlockedNotice;
let adotarGeracaoAtualDaNuvem: typeof SupabaseService.adotarGeracaoAtualDaNuvem;
let exigirGeracaoBaseCorrente: typeof SupabaseService.exigirGeracaoBaseCorrente;
let supabaseStub: { from: (table: string) => unknown };

const asset = (over: Record<string, unknown>) =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'PENDENTE',
    descricaodoativo: 'ATIVO',
    ...over
  }) as unknown as Asset;

/** Stub de `from('assets')`: upsert + a leitura de identidades (select/in/in). */
const stubTables = (cloudRows: unknown[] = [], cloudError: unknown = null) => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const byEtiqueta = vi.fn().mockResolvedValue({ data: cloudRows, error: cloudError });
  const byTenant = vi.fn(() => ({ in: byEtiqueta }));
  const select = vi.fn(() => ({ in: byTenant }));
  vi.spyOn(supabaseStub, 'from').mockImplementation(() => ({ upsert, select }));
  return { upsert, select, byTenant, byEtiqueta };
};

const collectBlocked = () => {
  const messages: string[] = [];
  const handler = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message);
  window.addEventListener('gbr_cloud_push_blocked', handler);
  return { messages, stop: () => window.removeEventListener('gbr_cloud_push_blocked', handler) };
};

/** O mesmo registo (tenantid + primarykey) duas vezes no payload. */
const repeatedRecordPayload = () => [asset({ id: 'A', primarykey: 'A' }), asset({ id: 'A', primarykey: 'A', etiqueta: '007999' })];

describe('syncAssetsToCloud — guarda de registo repetido', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    // O envio exige sessão da nuvem: estes testes correm com utilizador autenticado.
    autenticarClienteDeTeste(supabaseStub);
    resetNotice();
  });

  // O módulo arrasta sqliteService/Dexie/imagens; o import demora bem mais que
  // os 10 s padrão do Vitest neste ambiente, daí o timeout explícito.
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    syncAssetsToCloud = mod.syncAssetsToCloud;
    resetNotice = mod.resetCloudPushBlockedNotice;
    adotarGeracaoAtualDaNuvem = mod.adotarGeracaoAtualDaNuvem;
    exigirGeracaoBaseCorrente = mod.exigirGeracaoBaseCorrente;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  }, 120000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recusa o payload com o mesmo primarykey duas vezes e não chama a nuvem', async () => {
    const stubs = stubTables();
    const blocked = collectBlocked();

    await expect(syncAssetsToCloud(repeatedRecordPayload(), 'CICOPAL')).rejects.toBeInstanceOf(
      CloudPushBlockedError
    );

    blocked.stop();
    expect(stubs.upsert).not.toHaveBeenCalled();
    expect(stubs.select).not.toHaveBeenCalled(); // nem chega a consultar a nuvem
    expect(blocked.messages).toHaveLength(1);
    expect(blocked.messages[0]).toContain('ENVIO BLOQUEADO');
    expect(blocked.messages[0]).toContain('1 linha(s) repetida(s) do mesmo registo em 1 primarykey(s)');
  });

  it('avisa uma só vez por episódio, mesmo com a fila a tentar de novo', async () => {
    stubTables();
    const blocked = collectBlocked();

    await expect(syncAssetsToCloud(repeatedRecordPayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    await expect(syncAssetsToCloud(repeatedRecordPayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    expect(blocked.messages).toHaveLength(1);
    blocked.stop();
  });

  it('volta a avisar depois de um envio aceito', async () => {
    const stubs = stubTables();
    const blocked = collectBlocked();

    await expect(syncAssetsToCloud(repeatedRecordPayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    await syncAssetsToCloud([asset({ id: 'C', primarykey: 'C', etiqueta: '009999' })], 'CICOPAL');
    await expect(syncAssetsToCloud(repeatedRecordPayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);

    blocked.stop();
    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(blocked.messages).toHaveLength(2);
  });

  it('deixa subir duas linhas da planilha com a mesma etiqueta', async () => {
    const stubs = stubTables();

    const result = await syncAssetsToCloud(
      [
        asset({ id: '01010100000003480050', primarykey: '01010100000003480050' }),
        asset({ id: '01010100000003480051', primarykey: '01010100000003480051' })
      ],
      'CICOPAL'
    );

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result.sort()).toEqual(['01010100000003480050', '01010100000003480051']);
  });

  it('deixa passar um payload sem repetições (push delta de uma linha)', async () => {
    const stubs = stubTables();

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
  });

  it('consulta só as identidades do lote — o delta não lê a tabela inteira', async () => {
    const stubs = stubTables();

    await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A', etiqueta: '007222' })], 'CICOPAL');

    expect(stubs.byTenant).toHaveBeenCalledWith('tenantid', ['CICOPAL']);
    expect(stubs.byEtiqueta).toHaveBeenCalledWith('etiqueta', ['007222']);
  });

  it('não confunde a mesma etiqueta em contratos diferentes', async () => {
    const stubs = stubTables();

    const result = await syncAssetsToCloud(
      [
        asset({ id: 'A', primarykey: 'A', tenantid: 'CICOPAL' }),
        asset({ id: 'B', primarykey: 'B', tenantid: 'CARPER' })
      ],
      ['CICOPAL', 'CARPER']
    );

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result.sort()).toEqual(['A', 'B']);
  });
});

describe('syncAssetsToCloud — identidade já existente na nuvem com outro primarykey', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    // O envio exige sessão da nuvem: estes testes correm com utilizador autenticado.
    autenticarClienteDeTeste(supabaseStub);
    resetNotice();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cloudRow = (over: Record<string, unknown> = {}) => ({
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    primarykey: 'PRIMEIRA-LINHA',
    ...over
  });

  it('envia a segunda linha da mesma etiqueta em vez de a recusar', async () => {
    const stubs = stubTables([cloudRow()]);

    const result = await syncAssetsToCloud(
      [asset({ id: 'SEGUNDA-LINHA', primarykey: 'SEGUNDA-LINHA' })],
      'CICOPAL'
    );

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['SEGUNDA-LINHA']);
  });

  it('deixa passar a linha que é o próprio keeper da nuvem (upsert normal)', async () => {
    const stubs = stubTables([cloudRow({ primarykey: 'A' })]);

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
  });

  it('não penaliza o delta quando a consulta de identidade falha (fail-open)', async () => {
    const stubs = stubTables([], { code: 'PGRST301', message: 'timeout' });

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
  });

  it('não bloqueia quando a etiqueta do lote está vazia (sem identidade)', async () => {
    const stubs = stubTables([cloudRow({ etiqueta: '' })]);

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A', etiqueta: '' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
  });

  it('deixa passar filhos de unitarização ainda com etiqueta ETIQUETAR', async () => {
    const stubs = stubTables([cloudRow({ primarykey: 'FILHO-ANTIGO', etiqueta: 'ETIQUETAR' })]);

    const result = await syncAssetsToCloud(
      [
        asset({ id: 'PAI', primarykey: 'PAI', etiqueta: '007222' }),
        asset({ id: 'U1', primarykey: 'U1', etiqueta: 'ETIQUETAR' })
      ],
      'CICOPAL'
    );

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result.sort()).toEqual(['PAI', 'U1']);
  });
});

// ============================================================================
// SELO DE GERAÇÃO — o aparelho com a base antiga não pode repovoar a nuvem
// depois de um reset. O portão vive no mesmo ponto único de envio.
// ============================================================================
describe('syncAssetsToCloud — selo de geração da base', () => {
  const seedLocalAsset = async (key: string) => {
    await db.local_assets.put({
      id: key,
      tenantid: 'CICOPAL',
      filial: '010101 CICOPAL GO',
      primarykey: key,
      etiqueta: '007222',
      _is_synced: 0
    } as never);
  };

  /** Stub com `base_generation` + as leituras de identidade do lote. */
  const stubComGeracao = (geracao: { generation: string; seq: number } | null) => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: geracao, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const selectGen = vi.fn(() => ({ eq }));
    const byEtiqueta = vi.fn().mockResolvedValue({ data: [], error: null });
    const byTenant = vi.fn(() => ({ in: byEtiqueta }));
    const select = vi.fn(() => ({ in: byTenant }));
    vi.spyOn(supabaseStub, 'from').mockImplementation((table: string) => (
      table === 'base_generation' ? { select: selectGen } : { upsert, select }
    ));
    return { upsert, selectGen, maybeSingle };
  };

  const collectGenerationBlocked = () => {
    const messages: string[] = [];
    const handler = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener('gbr_base_generation_blocked', handler);
    return { messages, stop: () => window.removeEventListener('gbr_base_generation_blocked', handler) };
  };

  const g = (generation: string, seq: number) => ({ generation, seq });

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    // O envio exige sessão da nuvem: estes testes correm com utilizador autenticado.
    autenticarClienteDeTeste(supabaseStub);
    resetNotice();
    await db.local_assets.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recusa a base de geração anterior antes de qualquer upsert', async () => {
    localStorage.setItem('gbr_base_generation', JSON.stringify(g('geracao-antiga', 1)));
    await seedLocalAsset('A');
    const stubs = stubComGeracao(g('geracao-nova', 2));
    const blocked = collectGenerationBlocked();

    await expect(syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL'))
      .rejects.toBeInstanceOf(BaseGenerationBlockedError);

    blocked.stop();
    expect(stubs.upsert).not.toHaveBeenCalled();
    expect(stubs.selectGen).toHaveBeenCalledTimes(1);
    expect(blocked.messages).toHaveLength(1);
    expect(blocked.messages[0]).toContain('ENVIO BLOQUEADO');
    expect(blocked.messages[0]).toContain('geração 2');
    expect(blocked.messages[0]).toContain('Preparar Nova Carga');
  });

  it('avisa uma só vez por episódio, mesmo com a fila a tentar de novo', async () => {
    localStorage.setItem('gbr_base_generation', JSON.stringify(g('geracao-antiga', 1)));
    await seedLocalAsset('A');
    stubComGeracao(g('geracao-nova', 2));
    const blocked = collectGenerationBlocked();

    await expect(syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL'))
      .rejects.toBeInstanceOf(BaseGenerationBlockedError);
    await expect(syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL'))
      .rejects.toBeInstanceOf(BaseGenerationBlockedError);
    expect(blocked.messages).toHaveLength(1);
    blocked.stop();
  });

  it('segue quando o aparelho está na geração corrente', async () => {
    localStorage.setItem('gbr_base_generation', JSON.stringify(g('geracao-atual', 2)));
    const stubs = stubComGeracao(g('geracao-atual', 2));

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
  });

  it('adota a geração 1 sem selo local (rollout com aparelhos já em campo)', async () => {
    await seedLocalAsset('A');
    const stubs = stubComGeracao(g('primeira-geracao', 1));

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
    expect(JSON.parse(localStorage.getItem('gbr_base_generation') || 'null')).toEqual(g('primeira-geracao', 1));
  });

  it('adota sem bloqueio quando a base local está vazia (acabou de ser preparada)', async () => {
    const stubs = stubComGeracao(g('geracao-nova', 3));

    await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('gbr_base_generation') || 'null')).toEqual(g('geracao-nova', 3));
  });

  it('falha aberto quando a nuvem não tem selo (projeto ainda sem o bootstrap novo)', async () => {
    const stubs = stubComGeracao(null);

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
  });
});

// ============================================================================
// ADOÇÃO EXPLÍCITA — restauro de um pacote que pertence à geração corrente
// ============================================================================
describe('adotarGeracaoAtualDaNuvem', () => {
  const stubGeracao = (geracao: { generation: string; seq: number } | null) => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: geracao, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const selectGen = vi.fn(() => ({ eq }));
    const byEtiqueta = vi.fn().mockResolvedValue({ data: [], error: null });
    const byTenant = vi.fn(() => ({ in: byEtiqueta }));
    const select = vi.fn(() => ({ in: byTenant }));
    vi.spyOn(supabaseStub, 'from').mockImplementation((table: string) => (
      table === 'base_generation' ? { select: selectGen } : { upsert, select }
    ));
    return { upsert, selectGen };
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    // O envio exige sessão da nuvem: estes testes correm com utilizador autenticado.
    autenticarClienteDeTeste(supabaseStub);
    resetNotice();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grava o selo da nuvem e liberta o envio sem apagar a base', async () => {
    const stubs = stubGeracao({ generation: 'geracao-atual', seq: 4 });
    const adopted: number[] = [];
    const handler = (event: Event) => adopted.push((event as CustomEvent<{ seq: number }>).detail.seq);
    window.addEventListener('gbr_base_generation_adopted', handler);

    const result = await adotarGeracaoAtualDaNuvem();

    window.removeEventListener('gbr_base_generation_adopted', handler);
    expect(result.adopted).toBe(true);
    expect(JSON.parse(localStorage.getItem('gbr_base_generation') || 'null')).toEqual({
      generation: 'geracao-atual',
      seq: 4
    });
    // O envio deixa de estar bloqueado na chamada seguinte.
    await expect(exigirGeracaoBaseCorrente()).resolves.toBeUndefined();
    expect(adopted).toEqual([4]);

    // E um envio já passa a chegar à nuvem.
    await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');
    expect(stubs.upsert).toHaveBeenCalledTimes(1);
  });

  it('não adota quando a nuvem não devolve selo legível', async () => {
    stubGeracao(null);

    const result = await adotarGeracaoAtualDaNuvem();

    expect(result.adopted).toBe(false);
    if (!result.adopted) expect(result.reason).toContain('não devolveu um selo');
    expect(localStorage.getItem('gbr_base_generation')).toBeNull();
  });
});
