// @vitest-environment jsdom
// ============================================================================
// syncAssetsToCloudGuard.test.ts — a guarda de cópias tem de valer em TODOS os
// caminhos de envio, não só no botão do Gestor. `syncAssetsToCloud` é o ponto
// único por onde passam o autosave de fundo, o push delta de boot, a fila da
// nuvem e os envios de uma linha, por isso é aqui que os testes a prendem.
//
// Duas defesas:
//  1. payload com duas linhas da mesma identidade (base local com cópias);
//  2. linha cuja identidade já existe na nuvem com outro `primarykey` — o caso
//     que o payload sozinho não vê, porque o delta traz uma única linha.
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';
import type { Asset } from '../types';
import { CloudPushBlockedError, CloudPushIdentityConflictError } from '../utils/cloudPushGuard';

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

const duplicatePayload = () => [asset({ id: 'A', primarykey: 'A' }), asset({ id: 'B', primarykey: 'B' })];

describe('syncAssetsToCloud — guarda de cópias locais', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
    resetNotice();
  });

  // O módulo arrasta sqliteService/Dexie/imagens; o import demora bem mais que
  // os 10 s padrão do Vitest neste ambiente, daí o timeout explícito.
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    syncAssetsToCloud = mod.syncAssetsToCloud;
    resetNotice = mod.resetCloudPushBlockedNotice;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  }, 120000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recusa o payload com o mesmo tenantid+filial+etiqueta e não chama a nuvem', async () => {
    const stubs = stubTables();
    const blocked = collectBlocked();

    await expect(syncAssetsToCloud(duplicatePayload(), 'CICOPAL')).rejects.toBeInstanceOf(
      CloudPushBlockedError
    );

    blocked.stop();
    expect(stubs.upsert).not.toHaveBeenCalled();
    expect(stubs.select).not.toHaveBeenCalled(); // nem chega a consultar a nuvem
    expect(blocked.messages).toHaveLength(1);
    expect(blocked.messages[0]).toContain('ENVIO BLOQUEADO');
    expect(blocked.messages[0]).toContain('1 cópia(s) repetida(s) em 1 grupo(s)');
  });

  it('bloqueia também a cópia introduzida por caixa/espaços diferentes', async () => {
    const stubs = stubTables();

    await expect(
      syncAssetsToCloud(
        [
          asset({ id: 'A', primarykey: 'A', filial: '010101 CICOPAL GO' }),
          asset({ id: 'B', primarykey: 'B', filial: '010101  cicopal-go', tenantid: ' cicopal ' })
        ],
        'CICOPAL'
      )
    ).rejects.toBeInstanceOf(CloudPushBlockedError);
    expect(stubs.upsert).not.toHaveBeenCalled();
  });

  it('avisa uma só vez por episódio, mesmo com a fila a tentar de novo', async () => {
    stubTables();
    const blocked = collectBlocked();

    await expect(syncAssetsToCloud(duplicatePayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    await expect(syncAssetsToCloud(duplicatePayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    expect(blocked.messages).toHaveLength(1);
    blocked.stop();
  });

  it('volta a avisar depois de um envio aceito', async () => {
    const stubs = stubTables();
    const blocked = collectBlocked();

    await expect(syncAssetsToCloud(duplicatePayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    // Limpeza feita: um payload limpo sobe e fecha o episódio.
    await syncAssetsToCloud([asset({ id: 'C', primarykey: 'C', etiqueta: '009999' })], 'CICOPAL');
    await expect(syncAssetsToCloud(duplicatePayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);

    blocked.stop();
    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(blocked.messages).toHaveLength(2);
  });

  it('avisa de novo quando os números do bloqueio mudam', async () => {
    stubTables();
    const blocked = collectBlocked();

    await expect(syncAssetsToCloud(duplicatePayload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    await expect(
      syncAssetsToCloud(
        [
          asset({ id: 'A', primarykey: 'A' }),
          asset({ id: 'B', primarykey: 'B' }),
          asset({ id: 'C', primarykey: 'C', etiqueta: '007223' }),
          asset({ id: 'D', primarykey: 'D', etiqueta: '007223' })
        ],
        'CICOPAL'
      )
    ).rejects.toBeInstanceOf(CloudPushBlockedError);

    blocked.stop();
    expect(blocked.messages).toHaveLength(2);
    expect(blocked.messages[1]).toContain('2 cópia(s) repetida(s) em 2 grupo(s)');
  });

  it('deixa passar um payload sem cópias (push delta de uma linha continua a subir)', async () => {
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
    resetNotice();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cloudRow = (over: Record<string, unknown> = {}) => ({
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    primarykey: 'KEEPER-NUVEM',
    ...over
  });

  it('recusa a linha suja que criaria uma segunda linha para o mesmo ativo', async () => {
    const stubs = stubTables([cloudRow()]);
    const blocked = collectBlocked();

    await expect(
      syncAssetsToCloud([asset({ id: 'COPIA-LOCAL', primarykey: 'COPIA-LOCAL' })], 'CICOPAL')
    ).rejects.toBeInstanceOf(CloudPushIdentityConflictError);

    blocked.stop();
    expect(stubs.upsert).not.toHaveBeenCalled();
    expect(blocked.messages).toHaveLength(1);
    expect(blocked.messages[0]).toContain('já presente na nuvem sob outro primarykey');
  });

  it('mostra a identidade e os dois primarykeys no aviso', async () => {
    stubTables([cloudRow()]);

    try {
      await syncAssetsToCloud([asset({ id: 'COPIA-LOCAL', primarykey: 'COPIA-LOCAL' })], 'CICOPAL');
      throw new Error('devia ter bloqueado');
    } catch (err) {
      expect(err).toBeInstanceOf(CloudPushIdentityConflictError);
      const lines = (err as CloudPushIdentityConflictError).lines.join(' | ');
      expect(lines).toContain('010101 CICOPAL GO · etiqueta 007222');
      expect(lines).toContain('local COPIA-LOCAL');
      expect(lines).toContain('nuvem KEEPER-NUVEM');
    }
  });

  it('deixa passar a linha que é o próprio keeper da nuvem (upsert normal)', async () => {
    const stubs = stubTables([cloudRow({ primarykey: 'A' })]);

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(stubs.upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
  });

  it('compara a identidade como a limpeza (caixa, acentos, espaços)', async () => {
    const stubs = stubTables([cloudRow({ tenantid: ' cicopal ', filial: '010101  cicopal-go' })]);

    await expect(
      syncAssetsToCloud([asset({ id: 'COPIA', primarykey: 'COPIA' })], 'CICOPAL')
    ).rejects.toBeInstanceOf(CloudPushIdentityConflictError);
    expect(stubs.upsert).not.toHaveBeenCalled();
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

  it('avisa uma só vez por episódio também no conflito de identidade', async () => {
    stubTables([cloudRow()]);
    const blocked = collectBlocked();

    await expect(
      syncAssetsToCloud([asset({ id: 'COPIA', primarykey: 'COPIA' })], 'CICOPAL')
    ).rejects.toBeInstanceOf(CloudPushIdentityConflictError);
    await expect(
      syncAssetsToCloud([asset({ id: 'COPIA', primarykey: 'COPIA' })], 'CICOPAL')
    ).rejects.toBeInstanceOf(CloudPushIdentityConflictError);

    blocked.stop();
    expect(blocked.messages).toHaveLength(1);
  });
});
