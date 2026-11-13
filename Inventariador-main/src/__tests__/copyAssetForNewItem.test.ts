// ============================================================================
// copyAssetForNewItem.test.ts — cópia de dados para item novo ("não localizado")
//
// A cópia é LISTA BRANCA. O que não está em CAMPOS_DESCRITIVOS não pode viajar:
// `primarykey`, `_is_synced` e `sn1_recno` copiados faziam o registo novo
// apontar para o original e/ou nunca subir para a nuvem.
//
// IDENTIDADE: o registo adotado recebe `rad_000001`, `rad_000002`, ... em
// `rad_recno` e `registro` (mesmo rótulo, para o De/Para agrupar os sub-itens)
// e `subreg` crescente `0001`, `0002`, ... O `sn1_recno` da origem nunca é
// copiado — quando o utilizador esquece de o preencher, o registo novo fica
// identificado na mesma.
// ============================================================================
import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import {
  buildCopyForNewItem,
  CAMPOS_DESCRITIVOS,
  nextRadLabel,
  nextSubreg,
  radLabel,
  radSequenceOf,
} from '../utils/copyAssetForNewItem';

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
  subreg: '0003',
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

describe('rad_ — identidade do REGISTRO ADOTADO', () => {
  it('monta o rótulo rad_NNNNNN a partir da sequência', () => {
    expect(radLabel(1)).toBe('rad_000001');
    expect(radLabel(42)).toBe('rad_000042');
    expect(radLabel(1234567)).toBe('rad_1234567');
  });

  it('lê a sequência de um rótulo RAD e ignora registro normal da base', () => {
    expect(radSequenceOf('rad_000007')).toBe(7);
    expect(radSequenceOf(' RAD_000010 ')).toBe(10);
    expect(radSequenceOf('NFE2013010001')).toBeNull();
    expect(radSequenceOf(null)).toBeNull();
  });

  it('a sequência continua depois do maior rad_ da base', () => {
    const existentes = [
      { rad_recno: 'rad_000001' },
      { registro: 'rad_000007' },
      { registro: 'NFE2013010001' },
      null,
    ] as Partial<Asset>[];

    expect(nextRadLabel(existentes)).toBe('rad_000008');
  });

  it('base vazia começa em rad_000001', () => {
    expect(nextRadLabel([])).toBe('rad_000001');
  });

  it('subreg começa em 0001 e continua dentro do mesmo registro', () => {
    expect(nextSubreg('rad_000001', [])).toBe('0001');
    expect(
      nextSubreg('rad_000001', [
        { registro: 'rad_000001', subreg: '0001' },
        { registro: 'rad_000001', subreg: '0002' },
        { registro: 'rad_000002', subreg: '0007' },
      ] as Partial<Asset>[]),
    ).toBe('0003');
  });
});

describe('buildCopyForNewItem — identidade rad_ no item novo', () => {
  it('registro e rad_recno recebem o mesmo rótulo RAD; subreg é 0001', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino);

    expect(copia.registro).toBe('rad_000001');
    expect(copia.rad_recno).toBe('rad_000001');
    expect(copia.subreg).toBe('0001');
  });

  it('funciona mesmo quando o utilizador esqueceu sn1_recno na origem', () => {
    const copia = buildCopyForNewItem(baseOrigem({ sn1_recno: null }), destino);

    expect(copia.registro).toBe('rad_000001');
    expect(copia.rad_recno).toBe('rad_000001');
    expect(copia._copiadoDeRecno).toBeNull();
  });

  it('não herda registro nem subreg da origem', () => {
    const copia = buildCopyForNewItem(baseOrigem({ registro: 'NFE2013010001', subreg: '0003' }), destino);

    expect(copia.registro).not.toBe('NFE2013010001');
    expect(copia.subreg).not.toBe('0003');
    expect(copia._copiadoDeRegistro).toBe('NFE2013010001');
  });

  it('duas cópias seguidas não repetem o registro adotado', () => {
    const primeira = buildCopyForNewItem(baseOrigem(), destino);
    const segunda = buildCopyForNewItem(baseOrigem(), destino, [
      { rad_recno: primeira.rad_recno, registro: primeira.registro, subreg: primeira.subreg },
    ] as Partial<Asset>[]);

    expect(primeira.registro).toBe('rad_000001');
    expect(segunda.registro).toBe('rad_000002');
    expect(segunda.rad_recno).toBe('rad_000002');
    expect(segunda.subreg).toBe('0001');
  });

  it('nunca copia sn1_recno nem sn3_recno da origem', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino);
    expect(copia.sn1_recno).toBeUndefined();
    expect(copia.sn3_recno).toBeUndefined();
    expect(copia._copiadoDeRecno).toBe(778899);
  });
});

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
    ]) {
      expect(copia[proibido], `${proibido} não deveria ser copiado`).toBeUndefined();
    }
    expect(copia._is_synced).not.toBe(true);
  });

  it('todo campo copiado pertence à lista branca ou é do destino/proveniência', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino) as Record<string, unknown>;
    const permitidos = new Set<string>([
      ...CAMPOS_DESCRITIVOS,
      'etiqueta', 'qt', 'dataaqusic', 'registro', 'subreg', 'rad_recno',
      'filial', 'endereco', 'AUDITOR_LOCAL_AUDITADO', 'status',
      '_copiadoDe', '_copiadoDeEtiqueta', '_copiadoDeRegistro', '_copiadoDeRecno',
    ]);

    for (const chave of Object.keys(copia)) {
      expect(permitidos.has(chave), `campo inesperado na cópia: ${chave}`).toBe(true);
    }
  });

  it('status do item novo é ATIVO e não herda databaixa', () => {
    const copia = buildCopyForNewItem(baseOrigem({ status: 'BAIXADO', databaixa: '01/01/2020' }), destino);
    expect(copia.status).toBe('ATIVO');
    expect(copia.databaixa).toBeUndefined();
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
