// @vitest-environment jsdom
// ============================================================================
// campaignSnapshotCloudConferencia.test.ts — o laudo em modo nuvem.
//
// `createCampaignSnapshot` lia `a._conferido` em linhas cruas do Postgres, onde
// a conferência se chama `conferido`: `stats.inventoried` saía SEMPRE 0, e o
// snapshot arquivado (JSONB `assets_data` e a cópia local) não guardava quem
// conferiu nem quando — embora esses valores estivessem na própria linha.
//
// Decisão fixada aqui: arquiva-se a linha ORIGINAL do Postgres acrescentada só
// de `_conferido`/`_auditor`/`_dataLeitura`. A identidade (`tenantid`, `filial`)
// fica como estava — nada de normalização para maiúsculas nem `unitid` legado
// dentro de um documento fiscal fechado.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
});

const { snapshotPutMock } = vi.hoisted(() => ({
  snapshotPutMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/sqliteService', () => ({
  db: {
    campaigns: { get: vi.fn().mockResolvedValue(null) },
    campaign_snapshots: {
      put: snapshotPutMock,
      where: vi.fn(() => ({ equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })) })),
    },
  },
  sqliteService: {
    isImportingBatch: false,
    getIsInitialized: () => true,
    getCampaigns: vi.fn().mockResolvedValue([]),
    getAllAssets: vi.fn().mockResolvedValue([]),
    saveCampaign: vi.fn().mockResolvedValue(undefined),
    persist: vi.fn().mockResolvedValue(undefined),
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import * as supabaseModule from '../services/supabaseService';

const client = supabaseModule.supabase as unknown as { from: (table: string) => unknown };
const campaignRow = { id: 'camp-a', tenantid: 'cicopal', filial: '010101 cicopal go' };

/** Linha crua do Postgres: atenção ao `tenantid`/`filial` em minúsculas. */
const linha = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  primarykey: 'a1',
  tenantid: 'cicopal',
  filial: '010101 cicopal go',
  status: 'PENDENTE',
  etiqueta: '004229',
  ...over,
});

const stubCloud = (rows: Record<string, unknown>[]) => {
  const insertSnapshot = vi.fn().mockResolvedValue({ error: null });
  const updateCampaign = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));

  const from = vi.spyOn(client, 'from').mockImplementation((table: string) => {
    if (table === 'campaigns') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: campaignRow }) }) }),
        update: updateCampaign,
      };
    }
    if (table === 'assets') {
      return { select: () => ({ eq: () => ({ eq: async () => ({ data: rows, error: null }) }) }) };
    }
    if (table === 'campaign_snapshots') {
      return { insert: insertSnapshot };
    }
    return {};
  });

  return { from, insertSnapshot, updateCampaign };
};

// O insert do Supabase recebe uma lista de linhas.
const arquivado = (insertSnapshot: { mock: { calls: unknown[][] } }) => {
  const argumento = insertSnapshot.mock.calls[0][0];
  const linhaInserida = Array.isArray(argumento) ? argumento[0] : argumento;
  return linhaInserida as Record<string, unknown>;
};

describe('createCampaignSnapshot — laudo em modo nuvem', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.removeItem('app_database_mode');
    snapshotPutMock.mockClear();
  });

  it('conta a conferência pela coluna e arquiva-a no laudo', async () => {
    const rows = [
      linha({ conferido: true, auditor: 'ana@gbr.com', data_leitura: '2026-11-01T10:00:00.000Z' }),
      linha({ id: 'a2', primarykey: 'a2', conferido: false }),
    ];
    const cloud = stubCloud(rows);

    const ok = await supabaseModule.createCampaignSnapshot('camp-a', 'ana@gbr.com');

    expect(ok).toBe(true);

    const enviado = arquivado(cloud.insertSnapshot);
    expect(enviado.metadata).toMatchObject({ total: 2, inventoried: 1 });

    const ativos = enviado.assets_data as Record<string, unknown>[];
    expect(ativos).toHaveLength(2);
    expect(ativos[0]).toMatchObject({
      _conferido: true,
      _auditor: 'ana@gbr.com',
      _dataLeitura: '2026-11-01T10:00:00.000Z',
    });
    expect(ativos[1]._conferido).toBe(false);
    expect(ativos[1]._auditor).toBeUndefined();
  });

  it('não reescreve a identidade da linha dentro do documento fiscal', async () => {
    const cloud = stubCloud([linha({ conferido: true })]);

    await supabaseModule.createCampaignSnapshot('camp-a', 'ana@gbr.com');

    const [ativo] = arquivado(cloud.insertSnapshot).assets_data as Record<string, unknown>[];
    expect(ativo.tenantid).toBe('cicopal');       // como estava no Postgres
    expect(ativo.filial).toBe('010101 cicopal go');
    expect(ativo.status).toBe('PENDENTE');        // a coluna crua não é mexida
    expect(ativo.unitid).toBeUndefined();         // sem campo legado do runtime
  });

  it('sem a coluna (script pendente), status CONFERIDO continua a contar', async () => {
    const cloud = stubCloud([linha({ status: 'CONFERIDO' })]);

    await supabaseModule.createCampaignSnapshot('camp-a', 'ana@gbr.com');

    expect(arquivado(cloud.insertSnapshot).metadata).toMatchObject({ total: 1, inventoried: 1 });
  });

  it('grava a mesma linha enriquecida na cópia local do laudo', async () => {
    const rows = [linha({ conferido: true, auditor: 'ana@gbr.com' })];
    stubCloud(rows);

    await supabaseModule.createCampaignSnapshot('camp-a', 'ana@gbr.com');

    const copiaLocal = snapshotPutMock.mock.calls[0][0] as Record<string, unknown>;
    const ativos = JSON.parse(String(copiaLocal.assets_data)) as Record<string, unknown>[];
    expect(ativos[0]).toMatchObject({ _conferido: true, _auditor: 'ana@gbr.com' });
    expect(JSON.parse(String(copiaLocal.metadata))).toMatchObject({ inventoried: 1 });
  });
});

describe('comConferenciaLocal', () => {
  it('acrescenta a conferência sem alterar a linha recebida', () => {
    const crua = linha({ conferido: true, auditor: 'ana@gbr.com' });

    const enriquecida = supabaseModule.comConferenciaLocal(crua);

    expect(enriquecida).toMatchObject({ _conferido: true, _auditor: 'ana@gbr.com' });
    expect(crua).not.toHaveProperty('_conferido');
    expect(enriquecida.tenantid).toBe(crua.tenantid);
  });

  it('linha não conferida não ganha autor nem data', () => {
    const enriquecida = supabaseModule.comConferenciaLocal(linha({ conferido: false }));

    expect(enriquecida._conferido).toBe(false);
    expect(enriquecida).not.toHaveProperty('_auditor');
    expect(enriquecida).not.toHaveProperty('_dataLeitura');
  });
});
