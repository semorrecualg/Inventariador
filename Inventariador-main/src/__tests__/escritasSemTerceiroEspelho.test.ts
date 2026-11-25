// @vitest-environment jsdom
// ============================================================================
// escritasSemTerceiroEspelho.test.ts — A.3a.3.
//
// O terceiro espelho `assets` já não recebe escrita: criar, corrigir ou limpar
// campanha grava só em `ativos` + `local_assets`. A tabela continua no schema
// (e é esvaziada nos resets) até a A.3a.4 a remover, mas nada de negócio a
// escreve — é o que estes casos travam.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqliteService } from '../services/sqliteService';
import { localDb } from '../services/localDbService';

const ativo = (over: Record<string, unknown> = {}) => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  filial_raw: '010101 CICOPAL GO',
  etiqueta: '000123',
  tag: '000123',
  status: 'Em uso',
  qt: 1,
  descricaodoativo: 'Ativo de prova',
  currentCampaignId: 'CAMP-1',
  _is_synced: 0,
  _is_deleted: 0,
  _conferido: 0,
  ...over
});

describe('A.3a.3 — escritas não tocam no terceiro espelho', () => {
  beforeEach(async () => {
    await db.ativos.clear();
    await db.local_assets.clear();
  });

  // A.3a.4: a tabela deixou de existir no schema (v10).
  const temTerceiroEspelho = () => db.tables.some((t) => t.name === 'assets');

  it('criar um ativo grava só nas duas tabelas vivas', async () => {
    await localDb.assets.add(ativo() as never);

    expect(await db.ativos.count()).toBe(1);
    expect(await db.local_assets.count()).toBe(1);
    expect(temTerceiroEspelho()).toBe(false);
  });

  it('corrigir um campo (`patchAsset`) não escreve em `assets`', async () => {
    await db.ativos.put(ativo() as never);
    await db.local_assets.put(ativo() as never);

    await sqliteService.patchAsset('CICOPAL', 'PK-1', { status: 'Baixado' });

    expect(temTerceiroEspelho()).toBe(false);
    expect(temTerceiroEspelho()).toBe(false);
    expect((await db.ativos.get(['CICOPAL', 'PK-1']))?.status).toBe('Baixado');
    expect((await db.local_assets.get(['CICOPAL', 'PK-1']))?.status).toBe('Baixado');
  });

  it('tirar a campanha dos ativos não escreve em `assets`', async () => {
    await db.ativos.put(ativo() as never);
    await db.local_assets.put(ativo() as never);

    await localDb.assets.removeCampaignFromAssets('CAMP-1');

    expect(temTerceiroEspelho()).toBe(false);
    expect(temTerceiroEspelho()).toBe(false);
    expect((await db.ativos.get(['CICOPAL', 'PK-1']))?.currentCampaignId).toBeNull();
    expect((await db.local_assets.get(['CICOPAL', 'PK-1']))?.currentCampaignId).toBeNull();
  });
});
