// @vitest-environment jsdom
// ============================================================================
// campaignSnapshotPhotoMode.test.ts — o mesmo corte de modo, nos restantes pontos.
//
// `createCampaignSnapshot`, `getCampaignSnapshot` e a fila de fotos usavam
// `localStorage.getItem('app_database_mode') || 'INTERNAL'`. Sem a chave gravada
// (primeira sessão do aparelho) o laudo ficava só no SQLite e as fotos paravam na
// fila, enquanto o resto do app já falava com a nuvem.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
});

const { getCampaignsMock, getAllAssetsMock, toArrayMock, snapshotPutMock, saveCampaignMock } = vi.hoisted(() => ({
  getCampaignsMock: vi.fn().mockResolvedValue([]),
  getAllAssetsMock: vi.fn().mockResolvedValue([]),
  toArrayMock: vi.fn().mockResolvedValue([]),
  snapshotPutMock: vi.fn().mockResolvedValue(undefined),
  saveCampaignMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../services/sqliteService', () => ({
  db: {
    campaigns: { get: vi.fn().mockResolvedValue(null) },
    campaign_snapshots: {
      put: snapshotPutMock,
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: toArrayMock })) }))
    }
  },
  sqliteService: {
    isImportingBatch: false,
    getIsInitialized: () => true,
    getCampaigns: getCampaignsMock,
    getAllAssets: getAllAssetsMock,
    saveCampaign: saveCampaignMock,
    persist: vi.fn().mockResolvedValue(undefined),
    logAuditEvent: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) }
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import * as supabaseModule from '../services/supabaseService';
import { photoSyncManager } from '../services/syncService';

const client = supabaseModule.supabase as unknown as { from: (table: string) => unknown };

const campaignRow = { id: 'camp-a', tenantid: 'CICOPAL', filial: '010101 CICOPAL GO' };
const assetRow = { id: 'a1', _conferido: true, filial: '010101 CICOPAL GO' };

const stubCloud = () => {
  const insertSnapshot = vi.fn().mockResolvedValue({ error: null });
  const updateCampaign = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'snap-cloud', campaign_id: 'camp-a' }, error: null });

  const from = vi.spyOn(client, 'from').mockImplementation((table: string) => {
    if (table === 'campaigns') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: campaignRow }) }) }),
        update: updateCampaign
      };
    }
    if (table === 'assets') {
      return {
        select: () => ({ eq: () => ({ eq: async () => ({ data: [assetRow], error: null }) }) })
      };
    }
    if (table === 'campaign_snapshots') {
      return {
        insert: insertSnapshot,
        select: () => ({ eq: () => ({ maybeSingle }) })
      };
    }
    return {};
  });

  return { from, insertSnapshot, updateCampaign, maybeSingle };
};

describe('snapshots e fila de fotos — modo resolvido por getDatabaseMode()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    getCampaignsMock.mockClear();
    getAllAssetsMock.mockClear();
    toArrayMock.mockClear();
    snapshotPutMock.mockClear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
  });

  it('createCampaignSnapshot grava o laudo na nuvem quando o modo não está gravado', async () => {
    localStorage.removeItem('app_database_mode');
    const cloud = stubCloud();

    const ok = await supabaseModule.createCampaignSnapshot('camp-a', 'ana@gbr.com');

    expect(ok).toBe(true);
    expect(cloud.from).toHaveBeenCalledWith('campaign_snapshots');
    expect(cloud.insertSnapshot).toHaveBeenCalled();
    // O caminho local não foi usado.
    expect(getCampaignsMock).not.toHaveBeenCalled();
    expect(snapshotPutMock).not.toHaveBeenCalled();
  });

  it('createCampaignSnapshot com INTERNAL gravado continua no SQLite', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    // O ramo local resolve o contrato pelo cache da sessão (getDatabaseMode não o dá).
    localStorage.setItem('app_last_tenant', 'CICOPAL');
    const cloud = stubCloud();

    await supabaseModule.createCampaignSnapshot('camp-a', 'ana@gbr.com');

    expect(getCampaignsMock).toHaveBeenCalledWith('CICOPAL');
    expect(cloud.insertSnapshot).not.toHaveBeenCalled();
  });

  it('getCampaignSnapshot lê o laudo na nuvem quando o modo não está gravado', async () => {
    localStorage.removeItem('app_database_mode');
    const cloud = stubCloud();

    const snap = await supabaseModule.getCampaignSnapshot('camp-a');

    expect(cloud.maybeSingle).toHaveBeenCalled();
    expect(snap).toMatchObject({ id: 'snap-cloud' });
    expect(toArrayMock).not.toHaveBeenCalled();
  });

  it('getCampaignSnapshot com INTERNAL gravado usa o Dexie', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    const cloud = stubCloud();

    await supabaseModule.getCampaignSnapshot('camp-a');

    expect(toArrayMock).toHaveBeenCalled();
    expect(cloud.maybeSingle).not.toHaveBeenCalled();
  });

  it('a fila de fotos não para quando o modo não está gravado', async () => {
    localStorage.removeItem('app_database_mode');

    const result = await photoSyncManager.processPhotoSyncQueue();

    expect(result.success).toBe(true);
  });

  it('a fila de fotos respeita o INTERNAL gravado de propósito', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');

    const result = await photoSyncManager.processPhotoSyncQueue();

    expect(result.success).toBe(false);
  });
});
