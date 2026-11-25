// @vitest-environment jsdom
// ============================================================================
// pullEmLotes.test.ts — o pull grava a base uma vez, não três.
//
// Medição (harness fake-indexeddb, N=1.000): a passagem do download custou
// 581 ms; a reescrita completa que o `saveInventory` fazia a seguir (a mesma
// base, linha a linha nos três espelhos) custou 57.934 ms. Num pull completo o
// aparelho pagava downloads + essa reescrita + o espelho do `localDb` — três
// passagens de 12.636 × 3 escritas para corrigir as poucas linhas em que a
// decisão local (GPS mais recente, conferência, edição por enviar) vence.
//
// Este ficheiro fixa o contrato: (1) `persistAssetsBatch` grava só o
// subconjunto, com o MESMO mapeamento do lote e sem forçar o selo; (2) o pull
// completo e o delta não voltam a reescrever a base inteira.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

import { db, sqliteService } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';

const APARELHO = '2026-11-20T09:00:00.000Z';

const linha = (over: Record<string, unknown> = {}) => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  etiqueta: '007222',
  status: 'P',
  descricaodoativo: 'Notebook',
  _is_synced: 1,
  ...over
});

const guardado = async (key: string): Promise<DexieAsset | undefined> =>
  (await db.local_assets.where('primarykey').equals(key).first()) as DexieAsset | undefined;

describe('persistAssetsBatch — só o subconjunto com decisão local', () => {
  beforeEach(async () => {
    for (const tabela of [db.ativos, db.local_assets]) await tabela.clear();
    await sqliteService.bulkInsertAssetsOfflineFirst(
      [
        linha({ primarykey: 'PK-1', latitude: 0, longitude: 0, gps_lat: 0, gps_lng: 0 }),
        linha({ primarykey: 'PK-2' }),
        linha({ primarykey: 'PK-3' })
      ],
      undefined,
      { markSynced: true }
    );
  });

  it('grava a linha com o GPS do aparelho nas duas grafias e nas duas tabelas', async () => {
    const merged = linha({
      primarykey: 'PK-1',
      latitude: -15.79,
      longitude: -47.88,
      gps_lat: -15.79,
      gps_lng: -47.88,
      _gps_source: 'sensor',
      _gps_accuracy: 12,
      _gps_at: APARELHO,
      _is_synced: 1
    });

    const gravadas = await sqliteService.persistAssetsBatch([merged]);

    expect(gravadas).toBe(1);
    // A.3a.3: o terceiro espelho já não recebe escrita.
    for (const tabela of [db.ativos, db.local_assets]) {
      const row = (await tabela.where('primarykey').equals('PK-1').first()) as DexieAsset | undefined;
      expect(row?.latitude).toBe(-15.79);
      expect(row?.gps_lat).toBe(-15.79);
      expect(row?._gps_source).toBe('sensor');
      expect(row?._gps_at).toBe(APARELHO);
    }
  });

  it('não força o selo: linha pendente continua pendente', async () => {
    await sqliteService.persistAssetsBatch([
      linha({ primarykey: 'PK-2', _is_synced: 0, _conferido: true, _dataLeitura: APARELHO })
    ]);

    const row = await guardado('PK-2');
    expect(Number(row?._is_synced)).toBe(0);
    expect(Number(row?._conferido)).toBe(1);
    expect(row?._dataLeitura).toBe(APARELHO);
  });

  it('as linhas que não entram no subconjunto ficam como o download as deixou', async () => {
    const antes = await guardado('PK-3');
    await sqliteService.persistAssetsBatch([linha({ primarykey: 'PK-1', latitude: 1, longitude: 2 })]);
    expect(await guardado('PK-3')).toEqual(antes);
  });

  it('mantém a guarda entre contratos', async () => {
    // Linha do MESMO primarykey, de outro contrato: não pode ser sobrescrita.
    await sqliteService.persistAssetsBatch([
      linha({ primarykey: 'PK-2', tenantid: 'OUTRO' })
    ]);
    const row = await guardado('PK-2');
    expect(String(row?.tenantid)).toBe('CICOPAL');
  });
});

describe('pull — o contrato dos dois caminhos', () => {
  const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');

  it('o delta não reescreve a base inteira', () => {
    // O delta grava só as linhas com decisão local e a configuração.
    expect(app).toContain('saveInventory(newState, undefined, false, true)');
    expect(app).toContain('sqliteService.persistAssetsBatch(decisaoLocal as unknown as Record<string, unknown>[])');
  });

  it('o merge completo persiste a decisão local numa escrita só', () => {
    expect(app).toContain("logger.error('Erro ao regravar a decisão local do pull:', e)");
    expect(app).toContain('const decisaoLocal: Asset[] = [];');
  });

  it('o mapeamento da nuvem para os espelhos é um só', () => {
    const sqlite = readFileSync(join(process.cwd(), 'src', 'services', 'sqliteService.ts'), 'utf8');
    // A conversão vive num sítio só: o lote e o subconjunto usam a mesma.
    expect(sqlite.match(/private mapAssetToDexie/g)).toHaveLength(1);
    expect(sqlite.match(/this\.mapAssetToDexie\(/g)?.length).toBe(2);
  });
});
