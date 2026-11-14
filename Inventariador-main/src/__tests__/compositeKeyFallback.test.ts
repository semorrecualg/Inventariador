// @vitest-environment jsdom
// ============================================================================
// compositeKeyFallback.test.ts — fallback do tenant da sessão nas chaves
// compostas `[tenantid+primarykey]`.
//
// Com `tenantid` vazio a chave vira `['', primarykey]`: o `get`/`update` não
// encontra a linha gravada e o ativo é ignorado em silêncio (flushFieldChanges)
// ou o guard de contrato fica inoperante (filterCrossTenantWrites). Estes testes
// fixam o fallback no `sqliteService` e no wrapper `localDb.assets.update`.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, sqliteService } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { localDb, resolveTenantKey } from '../services/localDbService';

const TENANT = 'CICOPAL';
const PK = 'ABC-1001';

const row = (over: Partial<DexieAsset> = {}): DexieAsset => ({
  id: PK,
  primarykey: PK,
  tenantid: TENANT,
  filial: '010101 CICOPAL GO',
  descricaodoativo: 'CADEIRA',
  _is_synced: 1,
  ...over,
}) as DexieAsset;

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: TENANT }));
  for (const t of ['ativos', 'assets', 'local_assets'] as const) {
    await db[t].clear();
    await db[t].bulkPut([row()]);
  }
  await db.audit_logs.clear();
});

describe('sqliteService.flushFieldChanges — ativo sem tenantid', () => {
  it('aplica a alteração na linha do contrato da sessão em vez de ignorar', async () => {
    // `asset` sem tenantid (objeto parcial vindo da UI/buffer), já com o novo valor.
    sqliteService.bufferFieldChange(
      { id: PK, primarykey: PK, descricaodoativo: 'POLTRONA' },
      'descricaodoativo', 'CADEIRA', 'POLTRONA', 'auditor@x'
    );
    await sqliteService.flushFieldChanges();

    const gravado = await db.ativos.get([TENANT, PK]);
    expect(gravado?.descricaodoativo).toBe('POLTRONA');
    // O merge manteve os campos do registo existente (o `get` encontrou a linha).
    expect(gravado?.filial).toBe('010101 CICOPAL GO');
    expect(gravado?._is_synced).toBe(0);
    expect(await db.ativos.get(['', PK])).toBeUndefined();
  });
});

describe('sqliteService.patchAsset — ativo sem tenantid', () => {
  it('actualiza o registo do contrato da sessão', async () => {
    await sqliteService.patchAsset('', PK, { gps_lat: -15.79 });

    expect((await db.ativos.get([TENANT, PK]))?.gps_lat).toBe(-15.79);
    expect((await db.local_assets.get([TENANT, PK]))?.gps_lat).toBe(-15.79);
  });
});

describe('sqliteService.filterCrossTenantWrites — carga sem tenantid', () => {
  it('adopta o tenant da sessão e não cria chave vazia', async () => {
    const safe = await sqliteService.filterCrossTenantWrites([
      row({ tenantid: '', primarykey: 'NOVO-1', descricaodoativo: 'MESA' })
    ]);

    expect(safe).toHaveLength(1);
    expect(safe[0].tenantid).toBe(TENANT);

    await db.local_assets.bulkPut(safe);
    expect(await db.local_assets.get([TENANT, 'NOVO-1'])).toBeDefined();
    expect(await db.local_assets.get(['', 'NOVO-1'])).toBeUndefined();
  });

  it('continua a bloquear escrita de outro contrato', async () => {
    await db.local_assets.put(row({ primarykey: 'CROSS-1', tenantid: 'OUTRO' }));

    const safe = await sqliteService.filterCrossTenantWrites([
      row({ tenantid: 'OUTRO', primarykey: 'CROSS-1' })
    ]);
    // Colisão impossível com chave composta: o par é preservado como veio.
    expect(safe[0].tenantid).toBe('OUTRO');
  });
});

describe('localDb.assets.update — alteração sem tenantid', () => {
  it('resolve o tenant da sessão e aplica a alteração', async () => {
    await localDb.assets.update(PK, { descricaodoativo: 'ARMARIO' });

    expect((await db.local_assets.get([TENANT, PK]))?.descricaodoativo).toBe('ARMARIO');
  });
});

describe('resolveTenantKey — regra única', () => {
  it('é a mesma exportada pelo localDbService e pelos utils', async () => {
    const util = await import('../utils/tenantSession');
    expect(util.resolveTenantKey).toBe(resolveTenantKey);
    expect(util.resolveTenantKey('')).toBe(TENANT);
  });
});
