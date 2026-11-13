// ============================================================================
// copyAssetForNewItem.test.ts — cópia de dados para item novo ("não localizado")
//
// A cópia é LISTA BRANCA. O que não está em CAMPOS_DESCRITIVOS não pode viajar:
// `primarykey`, `_is_synced` e `sn1_recno` copiados faziam o registo novo
// apontar para o original e/ou nunca subir para a nuvem.
// `sn1_recno` vira `rad_recno` (REGISTRO ADOTADO + recno original) e `registro`
// não é copiado, para não colidir com um registo da unidade.
// ============================================================================
import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import { buildCopyForNewItem, CAMPOS_DESCRITIVOS } from '../utils/copyAssetForNewItem';

const baseOrigem = (over: Partial<Asset> = {}): Asset => ({
  tenantid: 'TENANT-1',
  filial: '008620 FILIAL SUL',
  status: 'ATIVO',
  etiqueta: '008491',
  qt: 2,
  descricaodoativo: 'BOMBA CENTRIFUGA 3CV',
  serial: 'SN-99881',
  dataaqusic: '12/03/2019',
  cnpj: '11.222.333/0001-44',
  nomefornecedor: 'FORNECEDOR ALFA',
  notafiscal: 'NFE2013010',
  endereco: 'CORREDOR B',
  registro: 'NFE2013010001',
  subreg: '0001',
  databaixa: '',
  contacontabil: '1.2.3.4',
  primarykey: 'CHAVE-DO-ORIGINAL',
  centrodecusto: 'CC-77',
  vlraquisic: 4500.5,
  sn1_recno: 778899,
  sn3_recno: 12,
  id: 'origem-1',
  _conferido: true,
  _is_synced: true,
  _isNew: false,
  _localMaster: 'CORREDOR B',
  TAG_INVENTARIO: 'CONFERIDO' as Asset['TAG_INVENTARIO'],
  ...over,
});

const destino = {
  unidade: '010101 CICOPAL GO',
  endereco: 'DEPOSITO CENTRAL',
  etiqueta: '008777',
  hoje: '13/11/2026',
};

describe('buildCopyForNewItem — lista branca de campos descritivos', () => {
  it('copia os campos descritivos do bem', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino);

    expect(copia.descricaodoativo).toBe('BOMBA CENTRIFUGA 3CV');
    expect(copia.serial).toBe('SN-99881');
    expect(copia.qt).toBe(2);
    expect(copia.dataaqusic).toBe('12/03/2019');
    expect(copia.nomefornecedor).toBe('FORNECEDOR ALFA');
    expect(copia.notafiscal).toBe('NFE2013010');
    expect(copia.vlraquisic).toBe(4500.5);
    expect(copia.contacontabil).toBe('1.2.3.4');
    expect(copia.centrodecusto).toBe('CC-77');
  });

  it('não copia chave, controle de sync nem estado de auditoria', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino) as Record<string, unknown>;

    for (const proibido of [
      'primarykey',
      '_is_synced',
      '_isNew',
      'id',
      'tenantid',
      '_conferido',
      '_localMaster',
      'TAG_INVENTARIO',
      'subreg',
    ]) {
      expect(copia[proibido], `${proibido} não deveria ser copiado`).toBeUndefined();
    }
    expect(copia._is_synced).not.toBe(true);
  });

  it('todo campo copiado por herança pertence à lista branca', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino) as Record<string, unknown>;
    const permitidos = new Set<string>([
      ...CAMPOS_DESCRITIVOS,
      // campos de destino/proveniência/etiquetagem definidos explicitamente
      'etiqueta', 'qt', 'dataaqusic', 'filial', 'endereco', 'AUDITOR_LOCAL_AUDITADO',
      'status', 'rad_recno', '_copiadoDe', '_copiadoDeEtiqueta', '_copiadoDeRegistro',
      '_copiadoDeRecno',
    ]);

    for (const chave of Object.keys(copia)) {
      expect(permitidos.has(chave), `campo inesperado na cópia: ${chave}`).toBe(true);
    }
  });

  it('status do item novo é ATIVO, nunca o status de origem', () => {
    const copia = buildCopyForNewItem(baseOrigem({ status: 'BAIXADO', databaixa: '01/01/2020' }), destino);
    expect(copia.status).toBe('ATIVO');
    expect(copia.databaixa).toBeUndefined();
  });
});

describe('buildCopyForNewItem — sn1_recno vira rad_recno (REGISTRO ADOTADO)', () => {
  it('guarda o recno de origem em rad_recno e não copia sn1_recno', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino);

    expect(copia.rad_recno).toBe(778899);
    expect(copia.sn1_recno).toBeUndefined();
    expect(copia.sn3_recno).toBeUndefined();
    expect(copia._copiadoDeRecno).toBe(778899);
  });

  it('sem sn1_recno na origem não inventa rad_recno', () => {
    const copia = buildCopyForNewItem(baseOrigem({ sn1_recno: null }), destino);

    expect(copia.rad_recno).toBeUndefined();
    expect(copia.sn1_recno).toBeUndefined();
    expect(copia._copiadoDeRecno).toBeNull();
  });
});

describe('buildCopyForNewItem — registro copiado poderia colidir', () => {
  it('não copia registro e mantém o original só na proveniência', () => {
    const copia = buildCopyForNewItem(baseOrigem({ registro: 'NFE2013010001' }), destino);

    expect(copia.registro).toBeUndefined();
    expect(copia._copiadoDeRegistro).toBe('NFE2013010001');
  });

  it('dois itens novos copiados do mesmo original não repetem registro entre si', () => {
    const a = buildCopyForNewItem(baseOrigem(), destino);
    const b = buildCopyForNewItem(baseOrigem(), destino);

    expect(a.registro).toBeUndefined();
    expect(b.registro).toBeUndefined();
    expect(a._copiadoDeRegistro).toBe(b._copiadoDeRegistro);
  });
});

describe('buildCopyForNewItem — destino e etiqueta', () => {
  it('o item novo nasce na unidade e no endereço abertos', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino);

    expect(copia.filial).toBe('010101 CICOPAL GO');
    expect(copia.endereco).toBe('DEPOSITO CENTRAL');
    expect(copia.AUDITOR_LOCAL_AUDITADO).toBe('DEPOSITO CENTRAL');
    expect(copia.etiqueta).toBe('008777');
  });

  it('sem código lido usa a plaqueta de origem', () => {
    const copia = buildCopyForNewItem(baseOrigem(), { ...destino, etiqueta: null });
    expect(copia.etiqueta).toBe('008491');
  });

  it('quantidade cai para 1 quando a origem não tem quantidade válida', () => {
    expect(buildCopyForNewItem(baseOrigem({ qt: 0 }), destino).qt).toBe(1);
  });

  it('guarda de onde vieram os dados e mantém a data de aquisição', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino);

    expect(copia._copiadoDe).toBe('008620 FILIAL SUL');
    expect(copia._copiadoDeEtiqueta).toBe('008491');
    expect(copia.dataaqusic).toBe('12/03/2019');
  });
});
