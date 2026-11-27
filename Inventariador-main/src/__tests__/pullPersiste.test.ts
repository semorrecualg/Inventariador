// @vitest-environment jsdom
// ============================================================================
// pullPersiste.test.ts — o pull só lê; quem grava a base é o chamador.
//
// `fetchFullInventory` devolve as linhas em memória e NÃO escreve no Dexie. Os
// três sítios que o chamam (boot loader, verificação secundária e
// `syncFromCloud`) gravavam com `saveInventory(..., skipSqlAssetsInsert)` na
// premissa «o download já gravou» — que era falsa. Consequência em campo: as
// linhas do pull ficavam só em memória (o blob cifrado só entra quando o cache
// está vazio) e o aparelho continuava a ver a base vazia, repetindo o pull.
//
// Este ficheiro fixa as duas metades do contrato:
// (1) `persistAssetsBatch` grava as linhas do pull com o selo que o download
//     traz (`_is_synced: 1`) e não o devolve a 0 — a regressão do #228;
// (2) o pull não escreve, e os chamadores gravam o que receberam.
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

const linhaDaNuvem = (over: Record<string, unknown> = {}) => ({
  id: 'PK-NUVEM',
  primarykey: 'PK-NUVEM',
  tenantid: 'CICOPAL',
  filial: '010201 SNACKS PA',
  etiqueta: '009999',
  status: 'P',
  descricaodoativo: 'Empilhadeira',
  // É o que o pull acrescenta antes de gravar (`mapCloudAssetRow` não produz o
  // selo): a linha desceu da nuvem, logo já está sincronizada.
  _is_synced: 1,
  ...over
});

const guardado = async (key: string): Promise<DexieAsset | undefined> =>
  (await db.local_assets.where('primarykey').equals(key).first()) as DexieAsset | undefined;

describe('as linhas que descem da nuvem ficam no aparelho com o selo', () => {
  beforeEach(async () => {
    for (const tabela of [db.ativos, db.local_assets]) await tabela.clear();
  });

  it('grava nos dois espelhos e mantém _is_synced = 1', async () => {
    const gravadas = await sqliteService.persistAssetsBatch([linhaDaNuvem()]);

    expect(gravadas).toBe(1);
    for (const tabela of [db.ativos, db.local_assets]) {
      const row = (await tabela.where('primarykey').equals('PK-NUVEM').first()) as DexieAsset | undefined;
      expect(row).toBeDefined();
      expect(Number(row?._is_synced)).toBe(1);
      expect(String(row?.filial)).toBe('010201 SNACKS PA');
    }
  });

  it('uma base já povoada continua a receber o pull', async () => {
    // O caso do campo: instalação por cima de uma base existente. Antes, o
    // `skipSqlAssetsInsert` deixava o cache como estava e a linha nova nunca
    // chegava ao disco.
    await sqliteService.persistAssetsBatch([linhaDaNuvem({ primarykey: 'PK-ANTIGO', id: 'PK-ANTIGO' })]);
    await sqliteService.persistAssetsBatch([linhaDaNuvem({ primarykey: 'PK-NOVO', id: 'PK-NOVO' })]);

    expect(await guardado('PK-ANTIGO')).toBeDefined();
    expect(await guardado('PK-NOVO')).toBeDefined();
    expect(await db.local_assets.count()).toBe(2);
  });
});

describe('contrato — o pull só lê, os chamadores gravam', () => {
  const raiz = process.cwd();
  const supabase = readFileSync(join(raiz, 'src', 'services', 'supabaseService.ts'), 'utf8');
  const app = readFileSync(join(raiz, 'src', 'App.tsx'), 'utf8');

  it('fetchFullInventory não escreve no Dexie', () => {
    const inicio = supabase.indexOf('const fetchFullInventoryImpl');
    const fim = supabase.indexOf("recordPerf(options?.since ? 'pull.delta'");
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    const corpo = supabase.slice(inicio, fim);
    expect(corpo.length).toBeGreaterThan(1000);
    expect(corpo).not.toContain('bulkInsertAssetsOfflineFirst');
    expect(corpo).not.toContain('persistAssetsBatch');
  });

  it('o boot loader grava o que o pull trouxe, com o selo, antes de salvar a config', () => {
    expect(app).toContain('const baixados = (cloudData.assets as Asset[]).map(a => ({ ...a, _is_synced: 1 }));');
    expect(app.match(/sqliteService\.persistAssetsBatch\(baixados as unknown as Record<string, unknown>\[\]\)/g))
      .toHaveLength(2);
    // A gravação vem antes do save: sem ela o save só escrevia a configuração.
    const grava = app.indexOf('persistAssetsBatch(baixados as unknown as Record<string, unknown>[])');
    const salva = app.indexOf('await saveInventory(newState, undefined, false, true);', grava);
    expect(grava).toBeGreaterThan(-1);
    expect(salva).toBeGreaterThan(grava);
  });

  it('o sync grava o delta e a base completa que recebeu', () => {
    expect(app).toContain("logger.error('Erro ao gravar o delta do pull:', e)");
    expect(app).toContain("logger.error('Erro ao gravar a base do pull:', e)");
    expect(app).toContain('sqliteService.persistAssetsBatch(cloudAssets as unknown as Record<string, unknown>[])');
  });
});
