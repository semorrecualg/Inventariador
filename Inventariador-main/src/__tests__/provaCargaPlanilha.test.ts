// @vitest-environment jsdom
// ============================================================================
// provaCargaPlanilha.test.ts — PROVA DA CARGA (Fase 3): planilha N · base N.
//
// É a prova pedida: lê uma planilha real, executa exatamente o caminho do Gestor
// de Base (`extrairDadosDaPlanilha` + `injetarDadosEmLotes`) e compara, linha por
// linha, o que o arquivo trazia com o que ficou na base.
//
// Corre sempre no CI: o passo "Testes unitários" do `.github/workflows/ci.yml`
// liga `PROVA_CARGA_SINTETICA=1`, e a planilha sintética abaixo tem a forma do
// arquivo do cliente (duas filiais, chaves repetidas, linhas sem chave).
// Na máquina continua opt-in, para não penalizar cada `npm test`:
//
//   CARGA_PLANILHA=/caminho/CICOPAL.xlsx npm run prova:carga
//   PROVA_CARGA_SINTETICA=1 npm run prova:carga     # fumo, sem ficheiro real
//
// O que a prova imprime e falha se não bater:
//   • `planilha N · base N`, por filial e no total;
//   • quantas linhas da planilha têm `source_row` na base (todas);
//   • chaves de origem repetidas no arquivo: todas presentes, cada uma com as
//     suas N linhas (a Fase 2 não perde nenhuma).
// ============================================================================
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { describe, it, expect } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { DatabaseLoaderService } from '../services/DatabaseLoaderService';

const CAMINHO = process.env.CARGA_PLANILHA;
const SINTETICA = process.env.PROVA_CARGA_SINTETICA === '1';
const ATIVA = Boolean(CAMINHO) || SINTETICA;

// No CI a prova é obrigatória. Se `PROVA_CARGA_SINTETICA` desaparecer do
// workflow, o `skipIf` voltaria a saltar o teste e o CI ficaria verde sem
// provar nada — por isso aqui a falta da variável é falha, não silêncio.
if (process.env.CI === 'true' && !ATIVA) {
  throw new Error(
    'prova da carga: no CI tem de correr — defina PROVA_CARGA_SINTETICA=1 ou CARGA_PLANILHA'
  );
}

/** Contrato fixo da planilha (21 colunas, nesta ordem). */
const CABECALHO = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 'serial',
  'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 'registro',
  'subreg', 'databaixa', 'contacontabil', 'primarykey', 'centrodecusto',
  'vlraquisic', 'sn1_recno', 'sn3_recno'
];

const CONTRATO = 'CICOPAL';

/**
 * Planilha sintética com a forma do arquivo real: duas filiais, datas e valores
 * como texto, chaves de origem repetidas e linhas sem chave nenhuma. Serve para
 * provar o caminho técnico sem o ficheiro do cliente.
 */
function planilhaSintetica(): ArrayBuffer {
  const linhas: Array<Array<string | number>> = [CABECALHO];
  const filiais = ['010101 CICOPAL GO', '010102 CICOPAL PA'];
  let anterior = '';

  for (let i = 1; i <= 4000; i++) {
    const filial = filiais[i % filiais.length];
    // A cada 137 linhas repete a chave da linha anterior (o caso da perda).
    const chave = i % 137 === 0 ? anterior : `PK-${String(i).padStart(6, '0')}`;
    anterior = chave;
    // Sem chave e sem etiqueta: identidade derivada do conteúdo.
    const semIdentidade = i % 500 === 0;
    linhas.push([
      CONTRATO,
      filial,
      'Em uso',
      semIdentidade ? '' : `0088${String(i).padStart(2, '0')} CICOPAL GO`,
      i % 3 === 0 ? 2 : 1,
      `ATIVO SINTÉTICO ${i}   COM ESPAÇOS`,
      `SERIAL-${i}`,
      '31/12/2025',
      '00.000.000/0000-00',
      'Fornecedor  XPTO Ltda.',
      `NF ${i}`,
      '151840 PRODUCAO - PV1 REFRESCO - ENVASE 1 / 2 CDC 70110',
      `REG-${i}`,
      'A 1',
      '01/02/2024',
      '1.2.3.4',
      semIdentidade ? '' : chave,
      'CC 001',
      'R$ 1.234,56',
      700 + i,
      900 + i
    ]);
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(linhas), 'CICOPAL');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

const rotulo = CAMINHO || 'planilha sintética';

/** Bytes do arquivo como ArrayBuffer (Buffer do Node pode partilhar memória). */
function lerPlanilha(): ArrayBuffer {
  if (!CAMINHO) return planilhaSintetica();
  const buffer = readFileSync(CAMINHO);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

describe.skipIf(!ATIVA)('prova da carga — planilha N · base N (CI: sintética)', () => {
  it('reimporta o arquivo e confere cada linha na base', async () => {
    await db.local_assets.clear();
    await db.ativos.clear();
    await db.assets.clear();
    await db.audit_logs.clear();

    const file = new File([lerPlanilha()], CAMINHO ? 'CICOPAL.xlsx' : 'sintetica.xlsx');

    // Caminho real do Gestor de Base: valida o contrato e injeta em lotes.
    const dados = await DatabaseLoaderService.extrairDadosDaPlanilha(file);
    const gravadas = await DatabaseLoaderService.injetarDadosEmLotes(dados);
    const linhas = (await db.local_assets.toArray()) as unknown as DexieAsset[];

    const porFilial = new Map<string, { planilha: number; base: number }>();
    for (const linha of linhas) {
      const filial = String(linha.filial_raw || linha.filial || '(sem filial)').trim();
      const entry = porFilial.get(filial) || { planilha: 0, base: 0 };
      entry.base += 1;
      porFilial.set(filial, entry);
    }
    for (const linha of dados as Array<Record<string, unknown>>) {
      const filial = String(linha.filial ?? '(sem filial)').trim();
      const entry = porFilial.get(filial) || { planilha: 0, base: 0 };
      entry.planilha += 1;
      porFilial.set(filial, entry);
    }

    const sourceRows = new Set(linhas.map((linha) => Number(linha.source_row)));
    const chavesOrigem = new Map<string, number>();
    for (const linha of linhas) {
      const chave = String(linha.source_primarykey ?? '');
      if (!chave) continue;
      chavesOrigem.set(chave, (chavesOrigem.get(chave) ?? 0) + 1);
    }
    const repetidas = Array.from(chavesOrigem.values()).filter((n) => n > 1).length;

    const relatorio: string[] = [
      `[PROVA] arquivo: ${rotulo}`,
      `[PROVA] planilha ${dados.length} · base ${linhas.length} · gravadas ${gravadas}`,
      ...Array.from(porFilial.entries()).map(
        ([filial, n]) => `[PROVA] ${filial}: planilha ${n.planilha} · base ${n.base}`
      ),
      `[PROVA] source_row distintas na base: ${sourceRows.size} de ${linhas.length}`,
      `[PROVA] chaves de origem repetidas no arquivo (preservadas): ${repetidas}`
    ];
    relatorio.forEach((linha) => console.log(linha));

    expect(linhas.length).toBe(dados.length);
    expect(gravadas).toBe(dados.length);
    porFilial.forEach((n) => expect(n.base).toBe(n.planilha));
    expect(sourceRows.size).toBe(linhas.length);
    // Nenhum registo da planilha ficou sem proveniência.
    expect(linhas.every((linha) => Number(linha.source_row) > 0)).toBe(true);
    expect(linhas.every((linha) => Boolean(linha.import_batch))).toBe(true);
  }, 300_000);
});
