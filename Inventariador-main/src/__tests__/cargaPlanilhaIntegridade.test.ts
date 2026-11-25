// @vitest-environment jsdom
// ============================================================================
// cargaPlanilhaIntegridade.test.ts — os três portões da carga da planilha:
//
//   1. `tenantid` vazio em QUALQUER linha bloqueia a carga e a mensagem diz a
//      linha do arquivo (1 = cabeçalho). Antes só se bloqueava quando a coluna
//      estava vazia em todas as linhas.
//   2. As vias de carga resolvem a filial pela MESMA regra (coluna → unidade do
//      operador). Antes `injetarDadosEmLotes` lia só `filial` e a identidade
//      derivada saía diferente da de `processExcelFile` para a mesma linha.
//   3. Uma reimportação que muda a identidade interna deixa o registo antigo na
//      base; ele é DETETADO (mesma `source_primarykey`, identidade que a carga
//      atual não usa), reportado na auditoria e nunca apagado em silêncio.
// ============================================================================
import 'fake-indexeddb/auto';
import * as XLSX from 'xlsx';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';
import { processAndInjectSpreadsheetData } from '../screens/DatabaseManagerScreen';

const CABECALHO = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 'serial',
  'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 'registro',
  'subreg', 'databaixa', 'contacontabil', 'primarykey', 'centrodecusto',
  'vlraquisic', 'sn1_recno', 'sn3_recno'
];

type Celula = string | number;

/** Uma linha do contrato, com os campos por omissão do teste. */
const linha = (overrides: Record<string, Celula> = {}): Celula[] => {
  const base: Record<string, Celula> = {
    tenantid: 'CICOPAL',
    filial: 'UNIT1',
    status: 'Em uso',
    etiqueta: '',
    qt: 1,
    descricaodoativo: 'ATIVO',
    serial: '',
    dataaqusic: '',
    cnpj: '',
    nomefornecedor: '',
    notafiscal: '',
    endereco: '',
    registro: '',
    subreg: '',
    databaixa: '',
    contacontabil: '',
    primarykey: '',
    centrodecusto: '',
    vlraquisic: '',
    sn1_recno: 0,
    sn3_recno: 0
  };
  const merged = { ...base, ...overrides };
  return CABECALHO.map((header) => merged[header]);
};

function arquivo(linhas: Celula[][]): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([CABECALHO, ...linhas]), 'CICOPAL');
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([bytes], 'carga.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

const limparBase = async (): Promise<void> => {
  await db.local_assets.clear();
  await db.ativos.clear();
  await db.audit_logs.clear();
};

const ultimaReconciliacao = async (): Promise<Record<string, unknown> | null> => {
  const logs = (await db.audit_logs.toArray()).filter((log) => log.acao === 'IMPORT_RECONCILIATION');
  const ultimo = logs[logs.length - 1];
  return ultimo ? JSON.parse(String(ultimo.delta)) as Record<string, unknown> : null;
};

describe('carga da planilha — tenantid obrigatório em cada linha', () => {
  beforeEach(limparBase);

  it('bloqueia a extração e nomeia a linha física do arquivo (1 = cabeçalho)', async () => {
    const planilha = arquivo([
      linha({ primarykey: 'PK-1' }),
      linha({ tenantid: '', primarykey: 'PK-2' }),
      linha({ primarykey: 'PK-3' })
    ]);

    await expect(DatabaseLoaderService.extrairDadosDaPlanilha(planilha)).rejects.toThrow(
      /1 linha\(s\) sem 'tenantid'[\s\S]*Linhas: linha 3/
    );
    expect(await db.local_assets.count()).toBe(0);
  });

  it('bloqueia as duas vias de ficheiro antes de gravar', async () => {
    const planilha = arquivo([
      linha({ primarykey: 'PK-1' }),
      linha({ tenantid: '   ', primarykey: 'PK-2' })
    ]);

    await expect(
      new DatabaseLoaderService().processExcelFile(planilha, 'CICOPAL', 'UNIT1', () => {})
    ).rejects.toThrow(/Linhas: linha 3/);
    expect(await db.local_assets.count()).toBe(0);

    await expect(
      new DatabaseLoaderService().importExcelBulkData(planilha, 'CICOPAL', 'UNIT1', () => {})
    ).rejects.toThrow(/Linhas: linha 3/);
    expect(await db.local_assets.count()).toBe(0);
  });

  it('bloqueia a injeção direta com o número da linha de dados', async () => {
    await expect(
      DatabaseLoaderService.injetarDadosEmLotes([
        { tenantid: 'CICOPAL', filial: 'UNIT1', primarykey: 'PK-1', etiqueta: 'A' },
        { tenantid: '  ', filial: 'UNIT1', primarykey: 'PK-2', etiqueta: 'B' }
      ])
    ).rejects.toThrow(/1 linha\(s\) sem 'tenantid'[\s\S]*Linhas: linha 2/);
    expect(await db.local_assets.count()).toBe(0);
  });
});

describe('carga da planilha — filial única entre as vias', () => {
  beforeEach(limparBase);
  afterEach(() => {
    sessionStorage.removeItem('filial');
    sessionStorage.removeItem('selectedUnit');
  });

  it('a mesma linha sem filial entra com a unidade do operador em todas as vias', async () => {
    // Sem primarykey/etiqueta a identidade deriva do conteúdo E da filial:
    // é a prova de que a filial é a mesma nas duas vias.
    const planilha = arquivo([
      linha({ filial: '', primarykey: '', etiqueta: '', descricaodoativo: 'CADEIRA GIRATÓRIA', serial: 'SN-1' })
    ]);

    await new DatabaseLoaderService().processExcelFile(planilha, 'CICOPAL', 'UNIT1', () => {});
    const [viaProcesso] = (await db.local_assets.toArray()) as unknown as DexieAsset[];
    expect(viaProcesso.filial_raw).toBe('UNIT1');
    expect(viaProcesso.filial).toBe('UNIT1');

    await limparBase();
    const dados = await DatabaseLoaderService.extrairDadosDaPlanilha(planilha);
    await DatabaseLoaderService.injetarDadosEmLotes(dados, undefined, 'UNIT1');
    const [viaInjecao] = (await db.local_assets.toArray()) as unknown as DexieAsset[];
    expect(viaInjecao.filial_raw).toBe('UNIT1');
    expect(viaInjecao.primarykey).toBe(viaProcesso.primarykey);

    await limparBase();
    sessionStorage.setItem('filial', 'UNIT1');
    await processAndInjectSpreadsheetData(planilha, () => {});
    const [viaGestor] = (await db.local_assets.toArray()) as unknown as DexieAsset[];
    expect(viaGestor.filial_raw).toBe('UNIT1');
    expect(viaGestor.primarykey).toBe(viaProcesso.primarykey);
  });
});

describe('carga da planilha — órfãs de uma reimportação', () => {
  beforeEach(limparBase);

  it('deteta a identidade antiga da mesma chave de origem sem apagar nada', async () => {
    const ativo = {
      tenantid: 'CICOPAL',
      filial: 'UNIT1',
      status: 'Em uso',
      etiqueta: 'X',
      qt: 1,
      descricaodoativo: 'ATIVO 1',
      serial: 'SN-1',
      primarykey: 'X'
    };

    // 1.ª carga: chave de origem única ⇒ identidade = X.
    await DatabaseLoaderService.injetarDadosEmLotes([ativo]);
    expect(await db.local_assets.count()).toBe(1);

    // 2.ª carga: a planilha passou a ter a chave X repetida ⇒ as duas linhas
    // recebem identidades derivadas e a identidade X fica órfã na base.
    await DatabaseLoaderService.injetarDadosEmLotes([
      ativo,
      { ...ativo, descricaodoativo: 'ATIVO 2', serial: 'SN-2' }
    ]);
    expect(await db.local_assets.count()).toBe(3);

    const segunda = await ultimaReconciliacao();
    expect(segunda).toMatchObject({ ok: true, planilha: 2, gravadas: 2, orphans: 1, orphanKeys: ['X'] });

    // 3.ª carga: planilha corrigida (chave X única) — as duas identidades
    // derivadas da carga anterior ficam órfãs, e continuam a não ser apagadas.
    await DatabaseLoaderService.injetarDadosEmLotes([ativo]);
    const terceira = await ultimaReconciliacao();
    expect(terceira).toMatchObject({ ok: true, planilha: 1, gravadas: 1, orphans: 2 });
    expect(await db.local_assets.count()).toBe(3);

    const chaves = (await db.local_assets.toArray()).map((row) => row.primarykey);
    expect(chaves).toContain('X');
  });
});
