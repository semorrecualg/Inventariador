// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { saveCollectedAssetAtomic } from '../services/persistenceService';
import { isFallbackAssetKey } from '../utils/assetKey';

/**
 * Regressão das cópias: o mesmo ativo saía com `ABC-1`, `abc-1` e `ABC1`
 * conforme o caminho que gravava, e a chave local composta
 * [tenantid + primarykey] transformava cada grafia numa linha nova.
 *
 * Estes testes gravam pela CARGA (injetarDadosEmLotes) e pela CONFERÊNCIA
 * (saveCollectedAssetAtomic) e exigem UMA linha por ativo, com a mesma chave.
 */
const LOTE = [
  // Chave com minúsculas, espaços e barra — o caso que divergia entre caminhos.
  { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', primarykey: ' abc-1/001 ', etiqueta: 'etq-1', descricaodoativo: 'CADEIRA', qt: 1 },
  // Sem coluna primarykey: a etiqueta é a identidade.
  { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', etiqueta: 'etq 2', descricaodoativo: 'MESA', qt: 1 },
  // Sem primarykey, etiqueta e tag: chave derivada do conteúdo (nunca aleatória).
  { tenantid: 'CICOPAL', filial: '010101 CICOPAL GO', descricaodoativo: 'ARMARIO', serial: 'SN-9', qt: 1 }
];

const keys = async (): Promise<string[]> =>
  ((await db.local_assets.toArray()) as unknown as DexieAsset[]).map((row) => row.primarykey).sort();

describe('assetKey · caminhos de escrita gravam a mesma chave', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
  });

  it('carga da planilha: chave canónica em maiúsculas, sem separadores', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes(LOTE);

    const stored = (await db.local_assets.toArray()) as unknown as DexieAsset[];
    expect(stored).toHaveLength(3);
    stored.forEach((row) => {
      expect(row.primarykey).toBe(row.id);
      expect(row.primarykey).toBe(row.primarykey.toUpperCase());
    });
    expect(stored.map((row) => row.primarykey)).toEqual(
      expect.arrayContaining(['ABC-1001', 'ETQ2'])
    );
  });

  it('reimportar a MESMA planilha não cria cópias (antes o ALT- e a caixa duplicavam)', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes(LOTE);
    const first = await keys();

    await DatabaseLoaderService.injetarDadosEmLotes(LOTE);
    expect(await keys()).toEqual(first);
    expect(await db.local_assets.count()).toBe(3);
  });

  it('linha sem identidade recebe chave derivada estável entre cargas', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes(LOTE);
    const derived = (await keys()).find((key) => isFallbackAssetKey(key));
    expect(derived).toBeDefined();

    await DatabaseLoaderService.injetarDadosEmLotes(LOTE);
    expect(await keys()).toContain(derived as string);
    expect(await db.local_assets.count()).toBe(3);
  });

  it('conferência usa a MESMA chave da carga (não cria uma linha nova)', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes(LOTE);

    await saveCollectedAssetAtomic({
      tenantid: 'CICOPAL',
      primarykey: ' abc-1/001 ',
      etiqueta: 'etq-1'
    });

    const stored = (await db.local_assets.toArray()) as unknown as DexieAsset[];
    expect(stored).toHaveLength(3); // nenhuma linha extra
    const conferido = stored.find((row) => row.primarykey === 'ABC-1001');
    expect(conferido?._conferido).toBe(1);
  });

  it('duas conferências do mesmo ativo continuam a ser um registo só', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes(LOTE);
    // Mesma chave escrita de três formas: caixa, espaços em volta e barra.
    await saveCollectedAssetAtomic({ tenantid: 'CICOPAL', primarykey: 'abc-1/001' });
    await saveCollectedAssetAtomic({ tenantid: 'CICOPAL', primarykey: ' abc-1 / 001 ' });

    expect(await db.local_assets.count()).toBe(3);
    expect(await db.ativos.count()).toBe(3);
  });
});
