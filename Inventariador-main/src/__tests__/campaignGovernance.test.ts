// @vitest-environment jsdom
// ============================================================================
// campaignGovernance.test.ts — a guarda de filial corre nos SERVIÇOS, não só no
// ecrã: criar campanha, ativar campanha e excluir campanha.
//
// Cobre os três bloqueios da Fase 1:
//   • criar sem filial  → FILIAL_OBRIGATORIA (nada é gravado);
//   • criar/ativar numa filial que já tem campanha aberta → CAMPANHA_ABERTA;
//   • excluir campanha com ativos lidos → TRABALHO_DE_AUDITORIA.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
});

const state = vi.hoisted(() => ({
  campaigns: [] as Array<Record<string, unknown>>,
  workAssets: [] as Array<{ currentCampaignId?: string | null }>,
  saveCampaign: vi.fn(async () => undefined),
  deleteCampaignSql: vi.fn(async () => undefined)
}));

vi.mock('../services/sqliteService', () => ({
  db: {
    campaigns: {
      get: vi.fn(async (id: string) => state.campaigns.find((c) => c.id === id) ?? null)
    },
    local_assets: {
      filter: (fn: (asset: { currentCampaignId?: string | null }) => boolean) => ({
        limit: (n: number) => ({ toArray: async () => state.workAssets.filter(fn).slice(0, n) })
      })
    },
    campaign_snapshots: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) }
  },
  sqliteService: {
    isImportingBatch: false,
    getIsInitialized: () => true,
    getCampaigns: async () => state.campaigns,
    saveCampaign: state.saveCampaign,
    persist: async () => undefined,
    deleteCampaignSql: state.deleteCampaignSql,
    logAuditEvent: async () => undefined
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) }
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import * as supabaseModule from '../services/supabaseService';
import { CampaignStatus } from '../types';

const FILIAL = '010101 CICOPAL GO';
const TENANT = 'CICOPAL';

const campanhaAberta = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: `Campanha ${id}`,
  status: CampaignStatus.ACTIVE,
  tenantid: TENANT,
  filial: FILIAL,
  created_at: '2026-11-17T10:00:00.000Z',
  start_date: '2026-11-17T10:00:00.000Z',
  ...over
});

beforeEach(() => {
  state.campaigns.length = 0;
  state.workAssets.length = 0;
  localStorage.clear();
  vi.clearAllMocks();
});

describe('createCampaign — filial obrigatória', () => {
  it('recusa campanha sem filial e não grava nada', async () => {
    await expect(
      supabaseModule.createCampaign({ name: 'Sem filial', tenantid: TENANT })
    ).rejects.toMatchObject({ code: 'FILIAL_OBRIGATORIA' });

    expect(state.saveCampaign).not.toHaveBeenCalled();
  });
});

describe('createCampaign — uma campanha aberta por filial', () => {
  it('bloqueia quando a filial já tem campanha CREATED (ainda não ativada)', async () => {
    state.campaigns.push(campanhaAberta('camp-criada', { status: CampaignStatus.CREATED }));

    await expect(
      supabaseModule.createCampaign({ name: 'Segunda', tenantid: TENANT, filial: FILIAL })
    ).rejects.toMatchObject({ code: 'CAMPANHA_ABERTA' });

    expect(state.saveCampaign).not.toHaveBeenCalled();
  });

  it('bloqueia quando a filial já tem campanha ACTIVE', async () => {
    state.campaigns.push(campanhaAberta('camp-ativa'));

    await expect(
      supabaseModule.createCampaign({ name: 'Segunda', tenantid: TENANT, filial: FILIAL })
    ).rejects.toMatchObject({ code: 'CAMPANHA_ABERTA' });
  });

  it('não bloqueia por campanha legada sem tenantid (outro contrato)', async () => {
    state.campaigns.push(campanhaAberta('camp-legada', { tenantid: '' }));
    state.campaigns.push(campanhaAberta('camp-outro-contrato', { tenantid: 'CLIENTETESTE' }));

    const criada = await supabaseModule.createCampaign({
      name: 'Nova',
      tenantid: TENANT,
      filial: FILIAL
    });

    expect(criada?.tenantid).toBe(TENANT);
    expect(state.saveCampaign).toHaveBeenCalledTimes(1);
  });

  it('deixa criar quando a campanha anterior da filial está encerrada', async () => {
    state.campaigns.push(campanhaAberta('camp-antiga', { status: CampaignStatus.CLOSED }));

    const criada = await supabaseModule.createCampaign({
      name: 'Nova',
      tenantid: TENANT,
      filial: FILIAL,
      status: CampaignStatus.CREATED
    });

    expect(criada?.filial).toBe(FILIAL);
    expect(state.saveCampaign).toHaveBeenCalledTimes(1);
  });
});

describe('createCampaign — BASE LOCAL não fala com a nuvem', () => {
  it('grava a campanha no aparelho e não faz insert no Supabase', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    const client = supabaseModule.supabase as unknown as { from: (table: string) => unknown };
    const from = vi.spyOn(client, 'from');

    const criada = await supabaseModule.createCampaign({
      name: 'Campanha Local',
      tenantid: TENANT,
      filial: FILIAL
    });

    expect(criada?.filial).toBe(FILIAL);
    expect(state.saveCampaign).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
    from.mockRestore();
  });
});

describe('updateCampaignStatus — ativação respeita a filial', () => {
  it('bloqueia ativar outra campanha na mesma filial', async () => {
    state.campaigns.push(
      campanhaAberta('camp-b'),
      campanhaAberta('camp-a', { status: CampaignStatus.CLOSED })
    );

    await expect(
      supabaseModule.updateCampaignStatus('camp-a', CampaignStatus.ACTIVE)
    ).rejects.toMatchObject({ code: 'CAMPANHA_ABERTA' });

    expect(state.saveCampaign).not.toHaveBeenCalled();
  });

  it('permite reativar a única campanha da filial (a própria não bloqueia)', async () => {
    state.campaigns.push(campanhaAberta('camp-a', { status: CampaignStatus.CLOSED }));

    const ok = await supabaseModule.updateCampaignStatus('camp-a', CampaignStatus.ACTIVE);

    expect(ok).toBe(true);
    expect(state.saveCampaign).toHaveBeenCalledTimes(1);
  });
});

describe('deleteCampaign — só sem trabalho de auditoria', () => {
  it('bloqueia a exclusão quando a campanha já tem ativos lidos', async () => {
    state.workAssets.push({ currentCampaignId: 'camp-a' });

    await expect(supabaseModule.deleteCampaign('camp-a')).rejects.toMatchObject({
      code: 'TRABALHO_DE_AUDITORIA'
    });

    expect(state.deleteCampaignSql).not.toHaveBeenCalled();
  });

  it('exclui campanha sem ativos lidos', async () => {
    state.workAssets.push({ currentCampaignId: 'outra-campanha' });

    const ok = await supabaseModule.deleteCampaign('camp-a');

    expect(ok).toBe(true);
    expect(state.deleteCampaignSql).toHaveBeenCalledWith('camp-a');
  });
});
