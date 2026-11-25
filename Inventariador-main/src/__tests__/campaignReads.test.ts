// @vitest-environment jsdom
// ============================================================================
// campaignReads.test.ts — leituras por campanha (`currentCampaignId`).
//
// `currentCampaignId` NUNCA foi índice: nem em `assets` (onde a query nasceu)
// nem em `ativos` (para onde o A.3a.1 a mudou). O Dexie recusa `.where()`
// numa chave sem índice com SchemaError, por isso `getMapData` e
// `removeCampaignFromAssets` rebentavam e o mapa/limpeza vinham vazios.
// Estes testes fixam a leitura por filtro (sem índice) e travam o regresso do
// `.where()` numa chave não indexada.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import { localDb } from '../services/localDbService';

const ativo = (over: Record<string, unknown> = {}) =>
  ({
    tenantid: 'CICOPAL',
    primarykey: 'PK-1',
    id: 'PK-1',
    filial: '010101_CICOPAL_GO',
    etiqueta: '000123',
    status: 'Em uso',
    currentCampaignId: 'CAMP-1',
    _is_deleted: 0,
    _is_synced: 1,
    ...over
  }) as Record<string, unknown>;

describe('leituras por campanha — `currentCampaignId` sem índice', () => {
  beforeEach(async () => {
    await db.ativos.clear();
    await db.local_assets.clear();
    localStorage.setItem('gbr_user_session', JSON.stringify({ id: 'u-1', tenantid: 'CICOPAL' }));
    sessionStorage.setItem('tenantid', 'CICOPAL');
    localStorage.setItem('filial', '010101 CICOPAL GO');
  });

  it('o índice não existe: `.where(currentCampaignId)` lança — a causa da falha', async () => {
    // Prova da causa: não é bug de dados, é chave sem índice no schema.
    await expect(
      db.ativos.where('currentCampaignId').equals('CAMP-1').toArray()
    ).rejects.toThrow(/not indexed|indexed/i);
  });

  it('getMapData devolve os ativos da campanha', async () => {
    await db.ativos.bulkPut([
      ativo({ primarykey: 'PK-1', id: 'PK-1' }) as never,
      ativo({ primarykey: 'PK-2', id: 'PK-2', currentCampaignId: 'CAMP-2' }) as never,
      ativo({ primarykey: 'PK-3', id: 'PK-3', currentCampaignId: null }) as never
    ]);

    const doMapa = await localDb.assets.getMapData('CAMP-1');

    expect(doMapa.map((a) => String(a.primarykey || a.id))).toEqual(['PK-1']);
  });

  it('getMapData respeita a exclusão e o contrato da sessão', async () => {
    await db.ativos.bulkPut([
      ativo({ primarykey: 'PK-1', id: 'PK-1' }) as never,
      ativo({ primarykey: 'PK-2', id: 'PK-2', _is_deleted: 1 }) as never,
      ativo({ primarykey: 'PK-3', id: 'PK-3', tenantid: 'OUTRO' }) as never
    ]);

    const doMapa = await localDb.assets.getMapData('CAMP-1');

    expect(doMapa.map((a) => String(a.primarykey || a.id))).toEqual(['PK-1']);
  });
});
