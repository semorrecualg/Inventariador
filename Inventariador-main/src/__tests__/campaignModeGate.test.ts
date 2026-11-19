// @vitest-environment jsdom
// ============================================================================
// campaignModeGate.test.ts — modo herdado não pode congelar a nuvem.
//
// `updateCampaignStatus` e a fila de campanhas decidiam o modo com
// `localStorage.getItem('app_database_mode') || 'INTERNAL'`: sem a chave gravada
// (primeira sessão do aparelho) o UPDATE e o DELETE eram pulados, enquanto
// `fetchCampaigns` consultava a nuvem — a campanha apagada/alterada no aparelho
// voltava no merge.
// Agora os dois usam `getDatabaseMode()`, que só é INTERNAL sem credenciais no
// build ou quando o modo INTERNAL está gravado de propósito.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `isInternalMode` é lido na avaliação de supabaseService, por isso o stub tem de
// correr antes dos imports (o CI corre `npm test` sem as credenciais no env).
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
});

const { saveCampaign, campaignRow } = vi.hoisted(() => ({
  saveCampaign: vi.fn().mockResolvedValue(undefined),
  campaignRow: {
    id: 'camp-a',
    name: 'Inventário nov 2026',
    status: 'ACTIVE',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    created_at: '2026-11-11T10:00:00.000Z',
    start_date: '2026-11-11T10:00:00.000Z'
  }
}));

vi.mock('../services/sqliteService', () => ({
  db: { campaigns: { get: vi.fn(async () => campaignRow) } },
  sqliteService: {
    isImportingBatch: false,
    getIsInitialized: () => true,
    saveCampaign,
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
import { processCampaignSyncQueue, addCampaignToSyncQueue } from '../services/syncService';
import { CampaignStatus } from '../types';

const client = supabaseModule.supabase as unknown as { from: (table: string) => unknown };

describe('modo herdado INTERNAL não bloqueia a nuvem', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    saveCampaign.mockClear();
    // Sessão válida para a fila (tenant + filial).
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', email: 'semorr@gmail.com', tenantid: 'CICOPAL' }));
    sessionStorage.setItem('filial', '010101 CICOPAL GO');
  });

  it('updateCampaignStatus faz o UPDATE na nuvem quando o modo não está gravado', async () => {
    localStorage.removeItem('app_database_mode');

    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    vi.spyOn(client, 'from').mockReturnValue({ update } as never);

    const ok = await supabaseModule.updateCampaignStatus('camp-a', CampaignStatus.ACTIVE);

    expect(ok).toBe(true);
    expect(saveCampaign).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: CampaignStatus.ACTIVE }));
    expect(eq).toHaveBeenCalledWith('id', 'camp-a');
  });

  it('a fila de campanhas tenta o DELETE remoto quando o modo não está gravado', async () => {
    localStorage.removeItem('app_database_mode');

    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn(() => ({ eq }));
    vi.spyOn(client, 'from').mockReturnValue({ delete: del } as never);

    await addCampaignToSyncQueue('camp-q', 'DELETE');
    const result = await processCampaignSyncQueue();

    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 'camp-q');
    // O item saiu da fila depois do DELETE (nada fica preso).
    expect(result.success).toBe(true);
  });

  it('modo INTERNAL gravado de propósito continua sem tocar na nuvem', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');

    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const del = vi.fn(() => ({ eq }));
    vi.spyOn(client, 'from').mockReturnValue({ update, delete: del } as never);

    await supabaseModule.updateCampaignStatus('camp-a', CampaignStatus.ACTIVE);
    await addCampaignToSyncQueue('camp-int', 'DELETE');
    await processCampaignSyncQueue();

    expect(update).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
