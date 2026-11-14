// @vitest-environment jsdom
// ============================================================================
// campaignAssetUnlink.test.ts — desvínculo de ativos por campanha.
//
// Sintoma real: excluir uma campanha deixava o rodapé preso em
// "CAMPANHAS ENCONTRADAS: 1" e o refresh do App nunca corria. Causa:
// `removeCampaignFromAssets`/`getMapData` usavam
// `db.ativos.where('currentCampaignId')`, coluna que NÃO é índice no schema
// Dexie v7 — a chamada lança SchemaError e abortava o fluxo pós-exclusão.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { localDb } from '../services/localDbService';
import { db } from '../services/sqliteService';

const asset = (primarykey: string, campaignId: string | null) => ({
  id: primarykey,
  primarykey,
  tenantid: 'DEMO_DEFAULT',
  filial: 'MATRIZ',
  currentCampaignId: campaignId,
  _is_deleted: 0,
  descricaodoativo: `ATIVO ${primarykey}`
}) as never;

beforeEach(async () => {
  await db.ativos.clear();
  await db.assets.clear();
  await db.local_assets.clear();
  localStorage.setItem('tenantid', 'DEMO_DEFAULT');
  // `getMapData` resolve o contrato pelo usuário da sessão (getCurrentTenantid).
  localStorage.setItem('user', JSON.stringify({ tenantid: 'DEMO_DEFAULT' }));
  // Espelha o que o app faz ao carregar a base.
  await db.ativos.bulkPut([asset('PK-1', 'camp-a'), asset('PK-2', 'camp-b')]);
  await db.assets.bulkPut([asset('PK-1', 'camp-a'), asset('PK-2', 'camp-b')]);
  await db.local_assets.bulkPut([asset('PK-1', 'camp-a'), asset('PK-2', 'camp-b')]);
});

describe('localDb.assets · campanha nos ativos', () => {
  it('desvincula só os ativos da campanha excluída, sem lançar SchemaError', async () => {
    await localDb.assets.removeCampaignFromAssets('camp-a');

    const ativos = await db.ativos.toArray();
    expect(ativos.find(a => a.primarykey === 'PK-1')?.currentCampaignId).toBeNull();
    expect(ativos.find(a => a.primarykey === 'PK-2')?.currentCampaignId).toBe('camp-b');

    const espelhos = await db.local_assets.toArray();
    expect(espelhos.find(a => a.primarykey === 'PK-1')?.currentCampaignId).toBeNull();
  });

  it('getMapData lê por campanha sem depender de índice', async () => {
    const rows = await localDb.assets.getMapData('camp-b');
    expect(rows.map(r => r.primarykey)).toEqual(['PK-2']);
  });
});
