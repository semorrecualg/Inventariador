// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';

/**
 * REGRA DA CARGA: os dados entram na base exatamente como estão na planilha.
 *
 * Regressão do caso real: a etiqueta `008810 CICOPAL` era gravada como
 * `008810CICOPAL` porque passava por `sanitizeAssetKey` (expurgo de tudo o que
 * não é A-Z/0-9/-). O mesmo acontecia com serial, CNPJ, descrição, endereço e
 * contas. A chave interna (`primarykey`) continua canónica — o DADO não.
 */
const LINHA = {
  tenantid: 'CICOPAL',
  filial: '010101 CICOPAL GO',
  status: 'Em uso',
  etiqueta: '008810 CICOPAL',
  qt: 1,
  descricaodoativo: 'CADEIRA   GIRATÓRIA (AZUL)',
  serial: 'SN 12/34-A',
  dataaqusic: '31/12/2025',
  cnpj: '00.000.000/0000-00',
  nomefornecedor: 'Fornecedor  XPTO Ltda.',
  notafiscal: 'NF 000.123',
  endereco: '151840 PRODUCAO - PV1 REFRESCO - ENVASE 1 / 2 CDC 70110',
  registro: ' REG 01 ',
  subreg: 'A 1',
  databaixa: '01/02/2024',
  contacontabil: '1.2.3.4',
  primarykey: '008810 CICOPAL',
  centrodecusto: 'CC 001',
  vlraquisic: 'R$ 1.234,56',
  sn1_recno: 700,
  sn3_recno: 900
};

const carregar = async (): Promise<DexieAsset> => {
  await DatabaseLoaderService.injetarDadosEmLotes([LINHA]);
  const rows = (await db.local_assets.toArray()) as unknown as DexieAsset[];
  expect(rows).toHaveLength(1);
  return rows[0];
};

describe('carga da planilha — dados copiados na íntegra', () => {
  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
  });

  it('a etiqueta mantém o espaço: "008810 CICOPAL" não vira "008810CICOPAL"', async () => {
    const stored = await carregar();
    expect(stored.etiqueta).toBe('008810 CICOPAL');
    expect(stored.tag).toBe('008810 CICOPAL');
    // A chave interna continua canónica — é identidade, não é o dado do cliente.
    expect(stored.primarykey).toBe('008810CICOPAL');
  });

  it('texto, caixa, espaços duplos e pontuação ficam como escritos', async () => {
    const stored = await carregar();
    expect(stored.descricaodoativo).toBe('CADEIRA   GIRATÓRIA (AZUL)');
    expect(stored.serial).toBe('SN 12/34-A');
    expect(stored.cnpj).toBe('00.000.000/0000-00');
    expect(stored.nomefornecedor).toBe('Fornecedor  XPTO Ltda.');
    expect(stored.notafiscal).toBe('NF 000.123');
    expect(stored.endereco).toBe('151840 PRODUCAO - PV1 REFRESCO - ENVASE 1 / 2 CDC 70110');
    expect(stored.registro).toBe(' REG 01 ');
    expect(stored.subreg).toBe('A 1');
    expect(stored.contacontabil).toBe('1.2.3.4');
    expect(stored.centrodecusto).toBe('CC 001');
    expect(stored.status).toBe('Em uso');
    expect(stored.filial_raw).toBe('010101 CICOPAL GO');
  });

  it('guarda a linha inteira em _sourceRow, com datas e valores como escritos', async () => {
    const stored = await carregar();
    const source = stored._sourceRow as Record<string, string>;

    expect(Object.keys(source).sort()).toEqual(
      [
        'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 'serial',
        'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 'registro',
        'subreg', 'databaixa', 'contacontabil', 'primarykey', 'centrodecusto',
        'vlraquisic', 'sn1_recno', 'sn3_recno'
      ].sort()
    );
    expect(source.etiqueta).toBe('008810 CICOPAL');
    expect(source.primarykey).toBe('008810 CICOPAL');
    expect(source.databaixa).toBe('01/02/2024');
    expect(source.dataaqusic).toBe('31/12/2025');
    expect(source.vlraquisic).toBe('R$ 1.234,56');
    expect(source.descricaodoativo).toBe('CADEIRA   GIRATÓRIA (AZUL)');

    // Os campos tipados continuam a existir para cálculo/ordenação.
    expect(stored.databaixa).toBe('2024-02-01');
    expect(stored.vlraquisic).toBe(1234.56);
  });

  it('reimportar a mesma planilha mantém uma linha e o mesmo texto', async () => {
    await carregar();
    const again = await carregar();
    expect(again.etiqueta).toBe('008810 CICOPAL');
    expect(await db.local_assets.count()).toBe(1);
    expect(await db.ativos.count()).toBe(1);
  });
});

/**
 * FASE 2 — IDENTIDADE INTERNA E CARGA APPEND-ONLY.
 *
 * A `primarykey` da planilha passa a ser DADO (`source_primarykey`) e a
 * identidade do registo é interna. Duas linhas com a mesma chave de origem
 * deixam de se substituir no `bulkPut`: a planilha N = base N.
 */
const carregarVarias = async (linhas: Record<string, unknown>[]): Promise<DexieAsset[]> => {
  await DatabaseLoaderService.injetarDadosEmLotes(linhas);
  return (await db.local_assets.toArray()) as unknown as DexieAsset[];
};

describe('carga da planilha — identidade interna e proveniência', () => {
  const SEGUNDA = { ...LINHA, descricaodoativo: 'MESA DE REUNIÃO', serial: 'SN 99-2' };

  beforeEach(async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();
  });

  it('grava a primarykey da planilha em source_primarykey, sem tocar no dado', async () => {
    const stored = await carregar();
    expect(stored.source_primarykey).toBe('008810 CICOPAL');
    expect(stored.source_row).toBe(1);
    expect(typeof stored.import_batch).toBe('string');
    expect(String(stored.import_batch).startsWith('CARGA-')).toBe(true);
  });

  it('duas linhas com a MESMA primarykey ficam ambas na base', async () => {
    const rows = await carregarVarias([LINHA, SEGUNDA]);

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.primarykey)).size).toBe(2);
    expect(rows.map((row) => row.source_primarykey)).toEqual([
      '008810 CICOPAL',
      '008810 CICOPAL'
    ]);
    expect(rows.map((row) => row.source_row).sort()).toEqual([1, 2]);
    expect(rows.map((row) => row.descricaodoativo).sort()).toEqual([
      'CADEIRA   GIRATÓRIA (AZUL)',
      'MESA DE REUNIÃO'
    ]);
    // A identidade não é o texto da célula: é canónica/interna.
    rows.forEach((row) => expect(row.primarykey).not.toBe('008810 CICOPAL'));
  });

  it('reimportar o arquivo com chave repetida mantém 2 registos e as mesmas chaves', async () => {
    const primeira = (await carregarVarias([LINHA, SEGUNDA])).map((row) => row.primarykey).sort();
    const segunda = (await carregarVarias([LINHA, SEGUNDA])).map((row) => row.primarykey).sort();

    expect(segunda).toEqual(primeira);
    expect(await db.local_assets.count()).toBe(2);
  });

  it('linha sem primarykey/etiqueta entra com chave derivada e não colide com a vizinha', async () => {
    const semIdentidade = { ...LINHA, primarykey: '', etiqueta: '', tag: '' };
    const outra = { ...semIdentidade, descricaodoativo: 'OUTRO ATIVO', serial: 'SN-XYZ' };

    const rows = await carregarVarias([semIdentidade, outra]);

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.primarykey)).size).toBe(2);
    expect(rows.map((row) => row.source_primarykey)).toEqual([null, null]);
  });
});
