// @vitest-environment jsdom
// ============================================================================
// repeatedEtiquetaLoad.test.ts — etiqueta repetida e chave do contrato na carga
//
// A etiqueta NÃO identifica um ativo: a planilha contábil repete-a entre linhas
// (contas, sub-registros, baixas). A chave primária local é
// `[tenantid + primarykey]`, e usar a etiqueta como `primarykey` fazia o
// `bulkPut` da segunda linha sobrescrever a primeira.
//
// A identidade passa a ser `tenantid + filial + registro + subreg`.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { db } from '../services/sqliteService';
import { createAssetKeyAllocator, contractAssetKey, isFallbackAssetKey } from '../utils/assetKey';

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

describe('carga de linhas com etiqueta repetida', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
  });

  it('a etiqueta repetida com registros diferentes dá uma linha por registo', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      row({ etiqueta: '000420', registro: '1001', subreg: '1', descricaodoativo: 'CADEIRA' }),
      row({ etiqueta: '000420', registro: '1002', subreg: '1', descricaodoativo: 'MESA' }),
      row({ etiqueta: '000420', registro: '1003', subreg: '1', descricaodoativo: 'ARMARIO' })
    ]);

    const chaves = await keysIn();
    expect(chaves).toEqual([
      '01010110011',
      '01010110021',
      '01010110031'
    ]);
    // A etiqueta não entra na chave.
    chaves.forEach((chave) => expect(chave).not.toContain('000420'));

    const descricoes = (await db.local_assets.toArray()).map((r) => String(r.descricaodoativo)).sort();
    expect(descricoes).toEqual(['ARMARIO', 'CADEIRA', 'MESA']);
  });

  it('mesmo registro e subreg repetidos não se perdem: recebem sufixo de ocorrência', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      row({ etiqueta: '000420', registro: '1001', subreg: '1', descricaodoativo: 'CADEIRA' }),
      row({ etiqueta: '000420', registro: '1001', subreg: '1', descricaodoativo: 'MESA' })
    ]);

    expect(await keysIn()).toEqual(['01010110011', '01010110011-2']);
    expect(await db.local_assets.count()).toBe(2);
  });

  it('recarregar o mesmo ficheiro não duplica nem renomeia', async () => {
    const linhas = [
      row({ etiqueta: '000420', registro: '1001', subreg: '1', descricaodoativo: 'CADEIRA' }),
      row({ etiqueta: '000420', registro: '1001', subreg: '1', descricaodoativo: 'MESA' })
    ];

    await DatabaseLoaderService.injetarDadosEmLotes(linhas);
    const primeiraCarga = await keysIn();
    await DatabaseLoaderService.injetarDadosEmLotes(linhas);

    expect(await keysIn()).toEqual(primeiraCarga);
    expect(await db.local_assets.count()).toBe(2);
  });

  it('linha com primarykey mantém a chave do contrato', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      row({ primarykey: 'PK-1', etiqueta: '000420', registro: '1001' }),
      row({ primarykey: 'PK-2', etiqueta: '000420', registro: '1002' })
    ]);

    expect(await keysIn()).toEqual(['PK-1', 'PK-2']);
  });

  it('mesmo registro em contratos diferentes não colide', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      row({ tenantid: 'CICOPAL', registro: '1001' }),
      row({ tenantid: 'OUTRO', registro: '1001' })
    ]);

    // A chave é a do ERP e não traz o contrato; o `tenantid` é o prefixo da PK.
    expect(await keysIn('CICOPAL')).toEqual(['0101011001']);
    expect(await keysIn('OUTRO')).toEqual(['0101011001']);
  });

  it('sem registro nem subreg cai na chave derivada do conteúdo (nunca na etiqueta)', async () => {
    await DatabaseLoaderService.injetarDadosEmLotes([
      row({ etiqueta: '000420', descricaodoativo: 'CADEIRA' }),
      row({ etiqueta: '000420', descricaodoativo: 'MESA' })
    ]);

    const chaves = await keysIn();
    expect(chaves).toHaveLength(2);
    expect(chaves.every((chave) => isFallbackAssetKey(chave))).toBe(true);
    expect(chaves.some((chave) => chave === '000420')).toBe(false);
  });
});

describe('createAssetKeyAllocator', () => {
  const fallback = () => 'SEM-ETIQUETA-1';

  it('deriva a chave do conteúdo quando não há identidade de contrato', () => {
    const allocate = createAssetKeyAllocator(fallback);
    expect(allocate({ tenantid: 'CICOPAL', etiqueta: 'ETQ-1' })).toBe('SEM-ETIQUETA-1');
  });

  it('prefere a chave do contrato e sanea os campos', () => {
    const allocate = createAssetKeyAllocator(fallback);
    expect(allocate({ tenantid: 'cicopal', filial: ' 010101 ', registro: 'r-9', subreg: '02' }))
      .toBe('010101R-902');
    expect(allocate({ tenantid: 'CICOPAL', filial: '010101', registro: 'r-9', subreg: '02' }))
      .toBe('010101R-902-2');
    // Mesma chave noutro contrato não é repetição: o `tenantid` separa.
    expect(allocate({ tenantid: 'OUTRO', filial: '010101', registro: 'r-9', subreg: '02' }))
      .toBe('010101R-902');
  });

  it('nunca usa a etiqueta, mesmo quando ela é a única coisa preenchida', () => {
    expect(contractAssetKey({ etiqueta: 'ETQ-1', tag: 'TAG-1' })).toBe('');
  });
});
