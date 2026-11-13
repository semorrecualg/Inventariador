// ============================================================================
// copyAssetForNewItem.test.ts — cópia de dados para item novo ("não localizado")
//
// A cópia é LISTA BRANCA. O que não está em CAMPOS_DESCRITIVOS não pode viajar:
// `primarykey`, `_is_synced` e `sn1_recno` copiados faziam o registo novo
// apontar para o original e/ou nunca subir para a nuvem.
//
// IDENTIDADE: `rad_<UNIDADE>_<DISPOSITIVO>_<000001>` em `rad_recno` e
// `registro`. A unidade + o código curto da instalação existem para que dois
// aparelhos (ou duas unidades) nunca emitam o mesmo rótulo; o contador
// persistido garante que a série continua mesmo depois de apagar o item.
// `subreg` é sempre `0001`: cada cópia abre um registro novo.
// ============================================================================
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import {
  buildCopyForNewItem,
  CAMPOS_DESCRITIVOS,
  deviceCode,
  getDeviceCode,
  nextRadLabel,
  radLabel,
  radPrefix,
  radSequenceOf,
  readRadCounter,
  SUBREG_ADOTADO,
  unitCode,
  writeRadCounter,
} from '../utils/copyAssetForNewItem';

/* -------------------------------------------------------------------------- */
/* localStorage falso (o ambiente dos testes é `node`)                        */
/* -------------------------------------------------------------------------- */
const criarStorage = (): Storage => {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (chave: string) => (dados.has(chave) ? (dados.get(chave) as string) : null),
    key: (indice: number) => Array.from(dados.keys())[indice] ?? null,
    removeItem: (chave: string) => void dados.delete(chave),
    setItem: (chave: string, valor: string) => void dados.set(chave, String(valor)),
  };
};

type ComWindow = { window?: { localStorage: Storage } };

beforeEach(() => {
  (globalThis as unknown as ComWindow).window = { localStorage: criarStorage() };
});

afterEach(() => {
  delete (globalThis as unknown as ComWindow).window;
});

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */
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
  dispositivo: '7K3F',
  hoje: '13/11/2026',
};

/* -------------------------------------------------------------------------- */
/* Código da unidade e do dispositivo                                          */
/* -------------------------------------------------------------------------- */
describe('unitCode / deviceCode — componentes do rótulo', () => {
  it('usa o primeiro token da unidade, sem acentos nem símbolos', () => {
    expect(unitCode('010101 CICOPAL GO')).toBe('010101');
    expect(unitCode('filial são josé')).toBe('FILIAL');
    expect(unitCode('0007-A / CENTRO')).toBe('0007A');
  });

  it('trunca a unidade em 8 caracteres e cai em UNID quando vazia', () => {
    expect(unitCode('ABCDEFGHIJKLO')).toBe('ABCDEFGH');
    expect(unitCode('')).toBe('UNID');
    expect(unitCode(null)).toBe('UNID');
  });

  it('normaliza o código do dispositivo em 4 caracteres', () => {
    expect(deviceCode('7k3f')).toBe('7K3F');
    expect(deviceCode('a-b!c-d')).toBe('ABCD');
    expect(deviceCode('')).toBe('DEV1');
    expect(deviceCode(undefined)).toBe('DEV1');
  });

  it('monta o prefixo e o rótulo completo', () => {
    expect(radPrefix('010101 CICOPAL GO', '7K3F')).toBe('rad_010101_7K3F_');
    expect(radLabel('010101 CICOPAL GO', '7K3F', 1)).toBe('rad_010101_7K3F_000001');
    expect(radLabel('010101 CICOPAL GO', '7K3F', 42)).toBe('rad_010101_7K3F_000042');
  });

  it('lê a sequência do formato novo e do legado', () => {
    expect(radSequenceOf('rad_010101_7K3F_000007')).toBe(7);
    expect(radSequenceOf('rad_000010')).toBe(10);
    expect(radSequenceOf('NFE2013010001')).toBeNull();
    expect(radSequenceOf(null)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Unicidade                                                                   */
/* -------------------------------------------------------------------------- */
describe('unicidade do rótulo RAD', () => {
  it('aparelhos diferentes na mesma unidade não geram o mesmo rótulo', () => {
    const a = radLabel('010101 CICOPAL GO', '7K3F', 1);
    const b = radLabel('010101 CICOPAL GO', 'M9Q2', 1);

    expect(a).not.toBe(b);
    expect(a).toBe('rad_010101_7K3F_000001');
    expect(b).toBe('rad_010101_M9Q2_000001');
  });

  it('unidades diferentes no mesmo aparelho não geram o mesmo rótulo', () => {
    const a = radLabel('010101 CICOPAL GO', '7K3F', 1);
    const b = radLabel('008620 FILIAL SUL', '7K3F', 1);

    expect(a).not.toBe(b);
  });

  it('cada cópia do mesmo original recebe um rótulo novo', () => {
    const primeira = buildCopyForNewItem(baseOrigem(), destino, []);
    const segunda = buildCopyForNewItem(baseOrigem(), destino, [
      { registro: primeira.registro, rad_recno: primeira.rad_recno },
    ] as Partial<Asset>[]);

    expect(primeira.registro).toBe('rad_010101_7K3F_000001');
    expect(segunda.registro).toBe('rad_010101_7K3F_000002');
    expect(segunda.registro).not.toBe(primeira.registro);
  });

  it('a sequência ignora rótulos de outra unidade/aparelho na base', () => {
    const existentes = [
      { registro: 'rad_010101_M9Q2_000090' },
      { registro: 'rad_008620_7K3F_000900' },
      { registro: 'rad_010101_7K3F_000004' },
      { registro: 'NFE2013010001' },
      null,
    ] as Partial<Asset>[];

    expect(nextRadLabel('010101 CICOPAL GO', '7K3F', existentes)).toBe('rad_010101_7K3F_000005');
  });

  it('o contador persistido continua a série mesmo com a base vazia', () => {
    expect(nextRadLabel('010101 CICOPAL GO', '7K3F', [], 17)).toBe('rad_010101_7K3F_000018');
  });

  it('o contador nunca anda para trás', () => {
    writeRadCounter('010101 CICOPAL GO', '7K3F', 5);
    expect(readRadCounter('010101 CICOPAL GO', '7K3F')).toBe(5);

    writeRadCounter('010101 CICOPAL GO', '7K3F', 3);
    expect(readRadCounter('010101 CICOPAL GO', '7K3F')).toBe(5);
  });

  it('o contador é separado por unidade e por aparelho', () => {
    writeRadCounter('010101 CICOPAL GO', '7K3F', 9);
    writeRadCounter('008620 FILIAL SUL', '7K3F', 2);
    writeRadCounter('010101 CICOPAL GO', 'M9Q2', 4);

    expect(readRadCounter('010101 CICOPAL GO', '7K3F')).toBe(9);
    expect(readRadCounter('008620 FILIAL SUL', '7K3F')).toBe(2);
    expect(readRadCounter('010101 CICOPAL GO', 'M9Q2')).toBe(4);
    expect(readRadCounter('008620 FILIAL SUL', 'M9Q2')).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Código do dispositivo                                                       */
/* -------------------------------------------------------------------------- */
describe('getDeviceCode — identidade estável da instalação', () => {
  it('cria um código de 4 caracteres e devolve o mesmo nas chamadas seguintes', () => {
    const primeiro = getDeviceCode();
    const segundo = getDeviceCode();

    expect(primeiro).toHaveLength(4);
    expect(primeiro).toMatch(/^[A-Z0-9]{4}$/);
    expect(segundo).toBe(primeiro);
  });

  it('sem storage devolve um código válido em vez de lançar', () => {
    delete (globalThis as unknown as ComWindow).window;

    const codigo = getDeviceCode();
    expect(codigo).toMatch(/^[A-Z0-9]{4}$/);
  });
});

/* -------------------------------------------------------------------------- */
/* Item novo                                                                   */
/* -------------------------------------------------------------------------- */
describe('buildCopyForNewItem — identidade do registro adotado', () => {
  it('registro e rad_recno recebem o mesmo rótulo; subreg é 0001', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino);

    expect(copia.rad_recno).toBe('rad_010101_7K3F_000001');
    expect(copia.registro).toBe(copia.rad_recno);
    expect(copia.subreg).toBe(SUBREG_ADOTADO);
    expect(copia.subreg).toBe('0001');
  });

  it('funciona mesmo quando o utilizador esqueceu sn1_recno na origem', () => {
    const copia = buildCopyForNewItem(baseOrigem({ sn1_recno: null }), destino);

    expect(copia.rad_recno).toBe('rad_010101_7K3F_000001');
    expect(copia._copiadoDeRecno).toBeNull();
  });

  it('não herda registro nem subreg da origem', () => {
    const copia = buildCopyForNewItem(
      baseOrigem({ registro: 'NFE2013010001', subreg: '0003' }),
      destino,
    );

    expect(copia.registro).not.toBe('NFE2013010001');
    expect(copia.subreg).toBe('0001');
    expect(copia._copiadoDeRegistro).toBe('NFE2013010001');
  });

  it('nunca copia sn1_recno nem sn3_recno da origem', () => {
    const copia = buildCopyForNewItem(baseOrigem(), destino);

    expect(copia.sn1_recno).toBeUndefined();
    expect(copia.sn3_recno).toBeUndefined();
    expect(copia._copiadoDeRecno).toBe(778899);
  });

  it('usa o contador persistido quando a base já não tem o último rótulo', () => {
    const copia = buildCopyForNewItem(baseOrigem(), { ...destino, ultimoContador: 12 });

    expect(copia.rad_recno).toBe('rad_010101_7K3F_000013');
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
    const copia = buildCopyForNewItem(
      baseOrigem({ status: 'BAIXADO', databaixa: '01/01/2020' }),
      destino,
    );

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
