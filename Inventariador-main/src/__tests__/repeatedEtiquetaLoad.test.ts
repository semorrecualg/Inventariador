// @vitest-environment jsdom
// ============================================================================
// repeatedEtiquetaLoad.test.ts — etiqueta repetida sem primarykey na carga
//
// A chave primária local é `[tenantid + primarykey]`. Sem `primarykey`, a
// etiqueta passa a ser a chave, e duas linhas com a mesma etiqueta no mesmo
// contrato colidiam: o `bulkPut` da segunda sobrescrevia a primeira e a
// planilha com N linhas deixava uma na base.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { db } from '../services/sqliteService';
import { createAssetKeyAllocator } from '../utils/assetKey';

const row = (over: Record<string, unknown> = {}) => ({
  tenantid: 'CICOPAL',
  filial: '010101',
  descricaodoativo: 'ATIVO',
  status: 'ATIVO',
  qt: 1,
  ...over
});

const keysIn = async (tenantid = 'CICOPAL') => {
  const rows = await db.local_assets.where('tenantid').equals(tenantid).toArray();
  return rows.map((r) => String(r.primarykey)).sort();
};

describe('carga de linhas com etiqueta repetida e sem primarykey', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
  });

  it('guarda as três linhas da planilha em vez de a segunda sobrescrever a primeira', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      row({ etiqueta: '000420', descricaodoativo: 'CADEIRA' }),
      row({ etiqueta: '000420', descricaodoativo: 'MESA' }),
      row({ etiqueta: '000420', descricaodoativo: 'ARMARIO' })
    ]);

    expect(await keysIn()).toEqual(['000420', '000420-2', '000420-3']);

    // Nenhuma descrição se perdeu no caminho.
    const descricoes = (await db.local_assets.toArray()).map((r) => String(r.descricaodoativo)).sort();
    expect(descricoes).toEqual(['ARMARIO', 'CADEIRA', 'MESA']);
  });

  it('recarregar o mesmo ficheiro não duplica nem renomeia as linhas', async () => {
    const linhas = [
      row({ etiqueta: '000420', descricaodoativo: 'CADEIRA' }),
      row({ etiqueta: '000420', descricaodoativo: 'MESA' })
    ];

    await DatabaseLoaderService.injetarDadosEmLotes(linhas);
    const primeiraCarga = await keysIn();
    await DatabaseLoaderService.injetarDadosEmLotes(linhas);

    expect(await keysIn()).toEqual(primeiraCarga);
    expect(await db.local_assets.count()).toBe(2);
  });

  it('linha com primarykey mantém a chave do contrato, mesmo com etiqueta repetida', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      row({ primarykey: 'PK-1', etiqueta: '000420' }),
      row({ primarykey: 'PK-2', etiqueta: '000420' })
    ]);

    expect(await keysIn()).toEqual(['PK-1', 'PK-2']);
  });

  it('a mesma etiqueta em contratos diferentes não recebe sufixo', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      row({ tenantid: 'CICOPAL', etiqueta: '000420' }),
      row({ tenantid: 'OUTRO', etiqueta: '000420' })
    ]);

    expect(await keysIn('CICOPAL')).toEqual(['000420']);
    expect(await keysIn('OUTRO')).toEqual(['000420']);
  });

  it('mantém a contagem por etiqueta repetida mesmo com 10 linhas iguais', async () => {
    const linhas = Array.from({ length: 10 }, (_, i) => row({ etiqueta: '0042', descricaodoativo: `ITEM ${i}` }));

    await DatabaseLoaderService.injetarDadosEmLotes(linhas);

    const chaves = await keysIn();
    expect(chaves).toHaveLength(10);
    expect(new Set(chaves).size).toBe(10);
    expect(chaves).toContain('0042');
    expect(chaves).toContain('0042-10');
  });
});

describe('createAssetKeyAllocator', () => {
  const fallback = () => 'SEM-ETIQUETA-1';

  it('deriva a chave do conteúdo quando não há identidade nenhuma', () => {
    const allocate = createAssetKeyAllocator(fallback);
    expect(allocate({ tenantid: 'CICOPAL' })).toBe('SEM-ETIQUETA-1');
  });

  it('normaliza a etiqueta antes de decidir a ocorrência', () => {
    const allocate = createAssetKeyAllocator(fallback);
    expect(allocate({ tenantid: 'cicopal', etiqueta: ' sm-01 ' })).toBe('SM-01');
    expect(allocate({ tenantid: 'CICOPAL', etiqueta: 'sm-01' })).toBe('SM-01-2');
  });
});
