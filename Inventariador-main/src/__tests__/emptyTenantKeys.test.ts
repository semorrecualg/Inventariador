// @vitest-environment jsdom
// ============================================================================
// emptyTenantKeys.test.ts — fecha a classe das chaves `['', primarykey]`.
//
// Três caminhos gravavam a linha com o `tenantid` que vinha do ficheiro:
// a carga da planilha (linha-a-linha), o restauro manual de backup no painel do
// gestor e o `localDb.assets.add` (via `toDexieAsset`). Com `tenantid` vazio a
// chave composta ficava `['', primarykey]` — invisível para a contagem e fora do
// alcance da migração de case. Todos passam a adoptar o contrato da sessão.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../services/sqliteService';
import type { DexieAsset } from '../services/sqliteService';
import { localDb } from '../services/localDbService';
import { DatabaseLoaderService, restoreBackupSnapshot } from '../services/DatabaseLoaderService';
import type { Asset } from '../types';

const TENANT = 'CICOPAL';

const CABECALHO = [
  'tenantid', 'filial', 'status', 'etiqueta', 'qt', 'descricaodoativo', 'serial',
  'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco', 'registro',
  'subreg', 'databaixa', 'contacontabil', 'primarykey', 'centrodecusto',
  'vlraquisic', 'sn1_recno', 'sn3_recno'
];

/** CSV com as 21 colunas do contrato, na ordem exigida. */
const planilha = (linhas: Array<Partial<Record<typeof CABECALHO[number], string>>>): Blob => {
  const corpo = linhas.map(celulas => CABECALHO.map(col => celulas[col] ?? '').join(';'));
  const csv = [CABECALHO.join(';'), ...corpo].join('\n');
  return new Blob([csv], { type: 'text/csv' });
};
const ESPELHOS = ['local_assets', 'ativos', 'assets'] as const;

const chaveVazia = async (): Promise<boolean> => {
  for (const table of ESPELHOS) {
    if (await db[table].get(['', 'SEM-TENANT'])) return true;
  }
  return false;
};

const emTodosOsEspelhos = async (): Promise<number> => {
  let total = 0;
  for (const table of ESPELHOS) {
    if (await db[table].get([TENANT, 'SEM-TENANT'])) total += 1;
  }
  return total;
};

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('app_current_user', JSON.stringify({ tenantid: TENANT }));
  for (const table of ESPELHOS) await db[table].clear();
});

describe('carga da planilha — política de identidade por linha', () => {
  it('bloqueia a carga quando uma linha não traz tenantid, listando a linha', async () => {
    const arquivo = planilha([
      { filial: 'MATRIZ', primarykey: 'SEM-TENANT', etiqueta: 'SEM-TENANT', qt: '1' },
      { tenantid: TENANT, filial: 'MATRIZ', primarykey: 'COM-TENANT', etiqueta: 'COM-TENANT', qt: '1' }
    ]);

    await expect(DatabaseLoaderService.extrairDadosDaPlanilha(arquivo))
      .rejects.toThrow(/CARGA BLOQUEADA: 1 linha\(s\) sem tenantid — linha\(s\) 2/);
    // Nada foi gravado: a carga inteira é recusada.
    expect(await chaveVazia()).toBe(false);
    expect(await emTodosOsEspelhos()).toBe(0);
  });

  it('lista todas as linhas afectadas, na numeração do Excel', async () => {
    const arquivo = planilha([
      { tenantid: TENANT, filial: 'MATRIZ', primarykey: 'OK-1', etiqueta: 'OK-1', qt: '1' },
      { filial: 'MATRIZ', primarykey: 'VAZIA-1', etiqueta: 'VAZIA-1', qt: '1' },
      { tenantid: '   ', filial: 'MATRIZ', primarykey: 'VAZIA-2', etiqueta: 'VAZIA-2', qt: '1' },
      { tenantid: TENANT, filial: 'MATRIZ', primarykey: 'OK-2', etiqueta: 'OK-2', qt: '1' },
      { filial: 'MATRIZ', primarykey: 'VAZIA-3', etiqueta: 'VAZIA-3', qt: '1' }
    ]);

    await expect(DatabaseLoaderService.extrairDadosDaPlanilha(arquivo))
      .rejects.toThrow(/3 linha\(s\) sem tenantid — linha\(s\) 3, 4, 6/);
  });

  it('bloqueia linhas de outro contrato e nomeia o contrato encontrado', async () => {
    const arquivo = planilha([
      { tenantid: TENANT, filial: 'MATRIZ', primarykey: 'OK-1', etiqueta: 'OK-1', qt: '1' },
      { tenantid: 'OUTRO_CLIENTE', filial: 'MATRIZ', primarykey: 'ALHEIO', etiqueta: 'ALHEIO', qt: '1' },
      { tenantid: 'outro_cliente', filial: 'MATRIZ', primarykey: 'ALHEIO-2', etiqueta: 'ALHEIO-2', qt: '1' }
    ]);

    await expect(DatabaseLoaderService.extrairDadosDaPlanilha(arquivo))
      .rejects.toThrow(/2 linha\(s\) trazem contrato diferente do contrato activo \(CICOPAL\) — linha 3 \(OUTRO_CLIENTE\), linha 4 \(OUTRO_CLIENTE\)/);
    expect(await emTodosOsEspelhos()).toBe(0);
  });

  it('aceita planilha de um só contrato e canoniza o casing antes de gravar', async () => {
    const linhas = await DatabaseLoaderService.extrairDadosDaPlanilha(planilha([
      { tenantid: 'cicopal', filial: 'MATRIZ', primarykey: 'MINUSCULO', etiqueta: 'MINUSCULO', qt: '1' },
      { tenantid: TENANT, filial: 'MATRIZ', primarykey: 'MAIUSCULO', etiqueta: 'MAIUSCULO', qt: '1' }
    ]));
    await DatabaseLoaderService.injetarDadosEmLotes(linhas);

    for (const table of ESPELHOS) {
      expect(await db[table].get([TENANT, 'MINUSCULO'])).toBeDefined();
      expect(await db[table].get([TENANT, 'MAIUSCULO'])).toBeDefined();
      expect(await db[table].get(['cicopal', 'MINUSCULO'])).toBeUndefined();
    }
    expect(await chaveVazia()).toBe(false);
  });
});

describe('restauro manual de backup — linha sem tenantid', () => {
  it('canoniza antes de repor os três espelhos', async () => {
    const linhas: DexieAsset[] = [
      { id: 'SEM-TENANT', primarykey: 'SEM-TENANT', tenantid: '', filial: 'MATRIZ' } as DexieAsset,
      { id: 'MINUSCULO', primarykey: 'MINUSCULO', tenantid: 'cicopal', filial: 'MATRIZ' } as DexieAsset
    ];

    expect(await restoreBackupSnapshot(linhas)).toBe(2);

    expect(await emTodosOsEspelhos()).toBe(3);
    expect(await chaveVazia()).toBe(false);
    for (const table of ESPELHOS) {
      expect(await db[table].get([TENANT, 'MINUSCULO'])).toBeDefined();
      expect(await db[table].get(['cicopal', 'MINUSCULO'])).toBeUndefined();
    }
  });

  it('backup vazio não limpa a base nem conta como restauro', async () => {
    await db.local_assets.put({ id: 'X', primarykey: 'X', tenantid: TENANT } as DexieAsset);

    expect(await restoreBackupSnapshot([])).toBe(0);
    expect(await db.local_assets.get([TENANT, 'X'])).toBeDefined();
  });
});

describe('localDb.assets.add — toDexieAsset', () => {
  it('grava com o tenant da sessão quando o ativo não traz tenantid', async () => {
    await localDb.assets.add({
      id: 'SEM-TENANT',
      primarykey: 'SEM-TENANT',
      etiqueta: 'SEM-TENANT',
      filial: 'MATRIZ'
    } as unknown as Asset);

    expect(await emTodosOsEspelhos()).toBe(3);
    expect(await chaveVazia()).toBe(false);
  });

  it('normaliza o casing do tenantid recebido', async () => {
    await localDb.assets.add({
      id: 'MINUSCULO',
      primarykey: 'MINUSCULO',
      tenantid: 'cicopal',
      etiqueta: 'MINUSCULO',
      filial: 'MATRIZ'
    } as unknown as Asset);

    expect(await db.ativos.get([TENANT, 'MINUSCULO'])).toBeDefined();
    expect(await db.ativos.get(['cicopal', 'MINUSCULO'])).toBeUndefined();
  });
});
