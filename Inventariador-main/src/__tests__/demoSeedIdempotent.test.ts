// @vitest-environment jsdom
// ============================================================================
// demoSeedIdempotent.test.ts — Regressão do smoke test offline.
//
// Sintoma real: abrir o modo demo duas vezes deixou 104 linhas em
// local_assets/ativos/assets, mas a UI (filtrada pelo contrato DEMO_DEFAULT)
// mostrava 52. Causa: no ciclo carregar→gravar, `normalizeAssetContract`
// preteria o `tenantid` canónico e adotava `GRUPO_EMPRESARIAL: 'EMPRESA_DEMO'`,
// re-gravando os mesmos 52 ativos sob outro contrato.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { demoService } from '../services/demoService';
import { localDb } from '../services/localDbService';
import { db } from '../services/sqliteService';
import { normalizeAssetContract } from '../utils/schema';

const SEED_SIZE = 52;

const contarEspelhos = async () => ({
  local_assets: await db.local_assets.count(),
  ativos: await db.ativos.count(),
  assets: await db.assets.count(),
});

const tenantsGravados = async (): Promise<string[]> => {
  const rows = await db.local_assets.toArray();
  return [...new Set(rows.map((r) => String(r.tenantid)))].sort();
};

/** O que o App faz ao arrancar: carrega a base, normaliza e volta a gravar. */
const cicloCarregarEGravar = async (): Promise<void> => {
  const carregados = (await db.local_assets.toArray()).map((a) =>
    normalizeAssetContract(a as unknown as Record<string, unknown>)
  );
  await localDb.assets.bulkPut(carregados);
};

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await db.local_assets.clear();
  await db.ativos.clear();
  await db.assets.clear();
});

describe('seed do modo demo', () => {
  it('normalizeAssetContract preserva o tenantid canónico sobre GRUPO_EMPRESARIAL', () => {
    const normalizado = normalizeAssetContract({
      tenantid: 'DEMO_DEFAULT',
      GRUPO_EMPRESARIAL: 'EMPRESA_DEMO',
      filial: 'MATRIZ',
    });

    expect(normalizado.tenantid).toBe('DEMO_DEFAULT');
  });

  it('semear e recarregar a base mantém 52 ativos num único contrato', async () => {
    await demoService.initDemoSession();
    expect(await contarEspelhos()).toEqual({
      local_assets: SEED_SIZE,
      ativos: SEED_SIZE,
      assets: SEED_SIZE,
    });

    // Ciclo do boot/login: carregar, normalizar e espelhar de novo.
    await cicloCarregarEGravar();

    expect(await contarEspelhos()).toEqual({
      local_assets: SEED_SIZE,
      ativos: SEED_SIZE,
      assets: SEED_SIZE,
    });
    expect(await tenantsGravados()).toEqual(['DEMO_DEFAULT']);
  });

  it('semear duas vezes seguidas não acumula linhas', async () => {
    await demoService.initDemoSession();
    await demoService.initDemoSession();

    expect(await contarEspelhos()).toEqual({
      local_assets: SEED_SIZE,
      ativos: SEED_SIZE,
      assets: SEED_SIZE,
    });
    expect(await tenantsGravados()).toEqual(['DEMO_DEFAULT']);
  });
});
