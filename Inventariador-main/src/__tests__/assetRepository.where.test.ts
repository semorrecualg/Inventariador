// src/__tests__/assetRepository.where.test.ts
// Fix do achado SRE: o ramo de array de `localDb.assets.where()` consultava o
// índice [tenantid+filial] com [etiqueta, unidade] — nunca casava, deixando o
// `findByEtiquetaInUnit` inoperante. Agora filtra em memória pelos campos do
// índice composto (docs/PLANO_FASE_C_HIGIENIZACAO.md §8.1).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../services/sqliteService';
import { assetRepository } from '../services/assetRepository';
import type { DexieAsset } from '../services/sqliteService';

// getCurrentTenantid() cai em 'DEMO_DEFAULT' quando não há sessão (node env).
const TENANT = 'DEMO_DEFAULT';

function seedAsset(over: Partial<DexieAsset>): DexieAsset {
  return {
    id: over.primarykey || 'PK-001',
    primarykey: over.primarykey || 'PK-001',
    tenantid: TENANT,
    filial: 'FILIAL-X',
    status: 'P',
    etiqueta: 'ABC-123',
    tag: 'ABC-123',
    qt: 1,
    descricaodoativo: 'Microcomputador',
    serial: null,
    dataaqusic: null,
    cnpj: null,
    nomefornecedor: null,
    notafiscal: null,
    endereco: null,
    registro: null,
    subreg: null,
    databaixa: null,
    contacontabil: null,
    centrodecusto: null,
    vlraquisic: 0,
    sn1_recno: null,
    sn3_recno: null,
    _is_synced: 1,
    _is_deleted: 0,
    _conferido: 0,
    _plaquetado: 0,
    _aprovado: 0,
    _isNew: 0,
    _is_unitized: 0,
    _is_divergent_baixa: 0,
    _history: null,
    DE_PARA: null,
    _photoUrl: null,
    gps_lat: null,
    gps_lng: null,
    ...over
  };
}

beforeEach(async () => {
  await db.open();
  await db.ativos.clear();
  await db.assets.clear();
  await db.local_assets.clear();
});

afterEach(async () => {
  await db.ativos.clear();
  await db.assets.clear();
  await db.local_assets.clear();
  await db.close();
});

describe('assetRepository.findByEtiquetaInUnit — ramo composto do where() (achado SRE)', () => {
  it('encontra ativo por etiqueta + filial (busca exata na unidade)', async () => {
    await db.ativos.put(seedAsset({ primarykey: 'PK-001', etiqueta: 'ABC-123', filial: 'FILIAL-X' }));
    await db.ativos.put(seedAsset({ primarykey: 'PK-002', etiqueta: 'ABC-123', filial: 'OUTRA-U' }));

    const found = await assetRepository.findByEtiquetaInUnit('ABC-123', 'FILIAL-X');
    expect(found).toBeDefined();
    expect(found?.primarykey).toBe('PK-001');
  });

  it('não retorna ativo de outra unidade', async () => {
    await db.ativos.put(seedAsset({ primarykey: 'PK-001', etiqueta: 'ABC-123', filial: 'FILIAL-X' }));

    const found = await assetRepository.findByEtiquetaInUnit('ABC-123', 'OUTRA-U');
    expect(found).toBeUndefined();
  });

  it('aplica padding de 6 zeros para etiquetas numéricas curtas', async () => {
    await db.ativos.put(seedAsset({ primarykey: 'PK-001', etiqueta: '000123', filial: 'FILIAL-X' }));

    const found = await assetRepository.findByEtiquetaInUnit('123', 'FILIAL-X');
    expect(found?.primarykey).toBe('PK-001');
  });

  it('fallback legado [etiqueta+_unitid] quando filial não casa', async () => {
    await db.ativos.put(seedAsset({
      primarykey: 'PK-001',
      etiqueta: 'ABC-123',
      filial: '',
      _unitid: 'LEGACY-U'
    }));

    const found = await assetRepository.findByEtiquetaInUnit('ABC-123', 'LEGACY-U');
    expect(found?.primarykey).toBe('PK-001');
  });

  it('first() ignora registros deletados', async () => {
    await db.ativos.put(seedAsset({ primarykey: 'PK-001', etiqueta: 'ABC-123', filial: 'FILIAL-X', _is_deleted: 1 }));

    const found = await assetRepository.findByEtiquetaInUnit('ABC-123', 'FILIAL-X');
    expect(found).toBeUndefined();
  });

  it('respeita o escopo de tenant', async () => {
    await db.ativos.put(seedAsset({ primarykey: 'PK-001', etiqueta: 'ABC-123', filial: 'FILIAL-X', tenantid: 'OUTRO_TENANT' }));

    const found = await assetRepository.findByEtiquetaInUnit('ABC-123', 'FILIAL-X');
    expect(found).toBeUndefined();
  });
});
