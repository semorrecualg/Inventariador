// @vitest-environment jsdom
// ============================================================================
// tenantKeyFallback.test.ts — tenant vazio na chave composta.
//
// Com `tenantid` ausente a chave vira `['', primarykey]`, que nunca coincide
// com a linha gravada: o `get` devolve undefined em silêncio e o merge/actualização
// do registo perde-se (InventoryCard e persistenceService). O fallback passa a
// ser o tenant da sessão.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { saveCollectedAssetAtomic } from '../services/persistenceService';
import { resolveTenantKey } from '../services/localDbService';

const TENANT = 'CICOPAL';

const LOTE = [
  { tenantid: TENANT, filial: '010101 CICOPAL GO', primarykey: 'ABC-1001', etiqueta: 'etq-1', descricaodoativo: 'CADEIRA', qt: 1 }
];

const sessao = (tenantid: string | null) => {
  localStorage.clear();
  sessionStorage.clear();
  if (tenantid === null) return;
  sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid }));
};

beforeEach(async () => {
  await db.local_assets.clear();
  await db.ativos.clear();
  await db.assets.clear();
  await db.audit_logs.clear();
  sessao(TENANT);
  await DatabaseLoaderService.injetarDadosEmLotes(LOTE);
});

describe('resolveTenantKey — tenant canónico da chave composta', () => {
  it('normaliza o tenant do próprio registo', () => {
    expect(resolveTenantKey('  cicopal  ')).toBe(TENANT);
  });

  it('cai para o tenant da sessão quando o registo não traz tenantid', () => {
    expect(resolveTenantKey(undefined)).toBe(TENANT);
    expect(resolveTenantKey('')).toBe(TENANT);
    expect(resolveTenantKey('   ')).toBe(TENANT);
    expect(resolveTenantKey(null)).toBe(TENANT);
  });

  it('sem sessão devolve vazio (não inventa contrato)', () => {
    sessao(null);
    expect(resolveTenantKey(undefined)).toBe('');
  });
});

describe('saveCollectedAssetAtomic — conferência sem tenantid no objeto', () => {
  it('encontra o registo existente pela chave da sessão (antes o get falhava)', async () => {
    await saveCollectedAssetAtomic({ primarykey: 'ABC-1001' });

    const gravado = await db.local_assets.get([TENANT, 'ABC-1001']);
    expect(gravado).toBeDefined();
    expect(gravado?._conferido).toBe(1);
    // O merge preservou os campos da carga.
    expect(gravado?.descricaodoativo).toBe('CADEIRA');
    expect(await db.local_assets.count()).toBe(1);
  });

  it('não cria uma linha paralela com tenant vazio', async () => {
    await saveCollectedAssetAtomic({ primarykey: 'ABC-1001' });

    expect(await db.local_assets.get(['', 'ABC-1001'])).toBeUndefined();
    expect((await db.local_assets.toArray()).map((r) => (r as unknown as DexieAsset).tenantid))
      .toEqual([TENANT]);
  });
});
