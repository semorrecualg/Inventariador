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

describe('syncAssetsToCloud — guarda de cópias locais', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('app_database_mode', 'SUPABASE');
  });

  // O módulo arrasta sqliteService/Dexie/imagens; o import demora bem mais que
  // os 10 s padrão do Vitest neste ambiente, daí o timeout explícito.
  beforeAll(async () => {
    const mod = await import('../services/supabaseService');
    syncAssetsToCloud = mod.syncAssetsToCloud;
    supabaseStub = mod.supabase as unknown as { from: (table: string) => unknown };
  }, 120000);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recusa o payload com o mesmo tenantid+filial+etiqueta e não chama a nuvem', async () => {
    const upsert = stubUpsert();
    const blocked: string[] = [];
    const onBlocked = (event: Event) => blocked.push((event as CustomEvent<{ message: string }>).detail.message);
    window.addEventListener('gbr_cloud_push_blocked', onBlocked);

    const result = await syncAssetsToCloud(
      [asset({ id: 'PK-1', primarykey: 'PK-1' }), asset({ id: 'PK-2', primarykey: 'PK-2' })],
      'CICOPAL'
    );

    window.removeEventListener('gbr_cloud_push_blocked', onBlocked);
    expect(result).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toContain('ENVIO BLOQUEADO');
    expect(blocked[0]).toContain('1 cópia(s) repetida(s) em 1 grupo(s)');
  });

  it('bloqueia também a cópia introduzida por caixa/espaços diferentes', async () => {
    const upsert = stubUpsert();

    const result = await syncAssetsToCloud(
      [
        asset({ id: 'A', primarykey: 'A', filial: '010101 CICOPAL GO' }),
        asset({ id: 'B', primarykey: 'B', filial: '010101  cicopal-go', tenantid: ' cicopal ' })
      ],
      'CICOPAL'
    );

    expect(result).toEqual([]);
    expect(upsert).not.toHaveBeenCalled();
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
