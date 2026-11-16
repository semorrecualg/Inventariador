// @vitest-environment jsdom
// ============================================================================
// syncAssetsToCloudGuard.test.ts — a guarda de cópias tem de valer em TODOS os
// caminhos de envio, não só no botão do Gestor. `syncAssetsToCloud` é o ponto
// único por onde passam o autosave de fundo, o push delta de boot, a fila da
// nuvem e os envios de uma linha, por isso é aqui que o teste a prende.
// ============================================================================
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import type * as SupabaseService from '../services/supabaseService';
import type { Asset } from '../types';
import { CloudPushBlockedError } from '../utils/cloudPushGuard';

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

const stubUpsert = () => {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  vi.spyOn(supabaseStub, 'from').mockImplementation(() => ({ upsert }));
  return upsert;
};

const collectBlocked = () => {
  const messages: string[] = [];
  const handler = (event: Event) => messages.push((event as CustomEvent<{ message: string }>).detail.message);
  window.addEventListener('gbr_cloud_push_blocked', handler);
  return { messages, stop: () => window.removeEventListener('gbr_cloud_push_blocked', handler) };
};

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
    const upsert = stubUpsert();
    const blocked = collectBlocked();

    await expect(
      syncAssetsToCloud(
        [asset({ id: 'PK-1', primarykey: 'PK-1' }), asset({ id: 'PK-2', primarykey: 'PK-2' })],
        'CICOPAL'
      )
    ).rejects.toBeInstanceOf(CloudPushBlockedError);

    blocked.stop();
    expect(upsert).not.toHaveBeenCalled();
    expect(blocked.messages).toHaveLength(1);
    expect(blocked.messages[0]).toContain('ENVIO BLOQUEADO');
    expect(blocked.messages[0]).toContain('1 cópia(s) repetida(s) em 1 grupo(s)');
  });

  it('bloqueia também a cópia introduzida por caixa/espaços diferentes', async () => {
    const upsert = stubUpsert();

    await expect(
      syncAssetsToCloud(
        [
          asset({ id: 'A', primarykey: 'A', filial: '010101 CICOPAL GO' }),
          asset({ id: 'B', primarykey: 'B', filial: '010101  cicopal-go', tenantid: ' cicopal ' })
        ],
        'CICOPAL'
      )
    ).rejects.toBeInstanceOf(CloudPushBlockedError);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('avisa uma só vez por episódio, mesmo com a fila a tentar de novo', async () => {
    stubUpsert();
    const blocked = collectBlocked();
    const payload = () => [asset({ id: 'A', primarykey: 'A' }), asset({ id: 'B', primarykey: 'B' })];

    // Duas tentativas seguidas do mesmo payload = um único aviso.
    await expect(syncAssetsToCloud(payload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    await expect(syncAssetsToCloud(payload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    expect(blocked.messages).toHaveLength(1);
    blocked.stop();
  });

  it('volta a avisar depois de um envio aceito', async () => {
    const upsert = stubUpsert();
    const blocked = collectBlocked();
    const payload = () => [asset({ id: 'A', primarykey: 'A' }), asset({ id: 'B', primarykey: 'B' })];

    await expect(syncAssetsToCloud(payload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);
    // Limpeza feita: um payload limpo sobe e fecha o episódio.
    await syncAssetsToCloud([asset({ id: 'C', primarykey: 'C', etiqueta: '009999' })], 'CICOPAL');
    await expect(syncAssetsToCloud(payload(), 'CICOPAL')).rejects.toBeInstanceOf(CloudPushBlockedError);

    blocked.stop();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(blocked.messages).toHaveLength(2);
  });

  it('avisa de novo quando os números do bloqueio mudam', async () => {
    stubUpsert();
    const blocked = collectBlocked();

    await expect(
      syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' }), asset({ id: 'B', primarykey: 'B' })], 'CICOPAL')
    ).rejects.toBeInstanceOf(CloudPushBlockedError);

    // Agora 2 grupos com cópias: são outros números, é outro aviso.
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
    const upsert = stubUpsert();

    const result = await syncAssetsToCloud([asset({ id: 'A', primarykey: 'A' })], 'CICOPAL');

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['A']);
  });

  it('não confunde a mesma etiqueta em contratos diferentes', async () => {
    const upsert = stubUpsert();

    const result = await syncAssetsToCloud(
      [
        asset({ id: 'A', primarykey: 'A', tenantid: 'CICOPAL' }),
        asset({ id: 'B', primarykey: 'B', tenantid: 'CARPER' })
      ],
      ['CICOPAL', 'CARPER']
    );

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(result.sort()).toEqual(['A', 'B']);
  });
});
