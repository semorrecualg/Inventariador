import { db } from './sqliteService';
import { buildDedupPlan, type DedupRow } from '../utils/dedupAssets';

/**
 * DIAGNÓSTICO de cópias repetidas de ativos (`tenantid + filial + etiqueta`).
 *
 * Histórico: esta rotina também APLICAVA uma limpeza — apagava linhas da base
 * local para reduzir 50 544 registos a 12 636. Isso viola a regra do produto
 * ("não podemos excluir por nenhum motivo nenhum registro"): a causa das cópias
 * é a carga, e a resposta passou a ser bloquear a carga quando planilha e base
 * não batem (ver `utils/importReconciliation`), nunca apagar registos.
 *
 * O que fica: apenas leitura. `previewAssetDuplicateCleanup` mede o que está
 * repetido, mostra as chaves divergentes e NÃO escreve nada — nem na base, nem
 * em `audit_logs`.
 */

export const ASSET_MIRROR_TABLES = ['local_assets', 'ativos', 'assets'] as const;
export type AssetMirrorTable = (typeof ASSET_MIRROR_TABLES)[number];

export interface DedupTableReport {
  table: AssetMirrorTable;
  before: number;
  after: number;
  removed: number;
  copies: number;
}

export interface DedupFilialReport {
  filial: string;
  before: number;
  after: number;
  removed: number;
}

export interface DedupExample {
  /** Identidade normalizada: tenantid|filial|etiqueta. */
  key: string;
  keeper: string;
  removed: string[];
}

export interface DedupReport {
  /**
   * Até 5 grupos com as chaves envolvidas. É o que mostra QUAL caminho gravou a
   * cópia (maiúsculas vs minúsculas, com/sem espaços, `ALT-` aleatório, etc.).
   */
  examples: DedupExample[];
  before: number;
  /** Quantas linhas restariam SOMANDO identidades — não é uma alteração feita. */
  after: number;
  removed: number;
  groupsWithCopies: number;
  withoutIdentity: number;
  patched: number;
  tables: DedupTableReport[];
  perFilial: DedupFilialReport[];
}

const filialLabelOf = (row: DedupRow): string =>
  String(row.filial_raw || row.filial || '').trim() || '(sem filial)';

/** Resumo por filial: quantas linhas existem e quantas são cópias. */
const summarizePerFilial = (rows: DedupRow[], removedKeys: Set<string>): DedupFilialReport[] => {
  const map = new Map<string, DedupFilialReport>();
  for (const row of rows) {
    const filial = filialLabelOf(row);
    const entry = map.get(filial) || { filial, before: 0, after: 0, removed: 0 };
    entry.before += 1;
    if (removedKeys.has(keyIdOf(row))) {
      entry.removed += 1;
      entry.after -= 1;
    }
    map.set(filial, entry);
  }
  return Array.from(map.values())
    .map((entry) => ({ ...entry, after: entry.before - entry.removed }))
    .sort((a, b) => b.before - a.before);
};

const tableOf = (table: AssetMirrorTable) => db.table(table);

/**
 * Chave primária REAL dos espelhos desde o schema v7: composta
 * `[tenantid+primarykey]`.
 */
const primaryKeyOf = (row: DedupRow): [string, string] => [String(row.tenantid ?? ''), String(row.primarykey)];

/** Identificador textual da chave composta, para comparar dentro de um resumo. */
const keyIdOf = (row: DedupRow): string => primaryKeyOf(row).join('\u0000');

/**
 * Mede as cópias sem tocar na base. `after` é uma PROJEÇÃO (o que restaria se
 * as identidades fossem somadas), nunca um resultado de limpeza.
 */
export async function previewAssetDuplicateCleanup(): Promise<DedupReport> {
  const tables: DedupTableReport[] = [];
  let examples: DedupExample[] = [];
  let perFilial: DedupFilialReport[] = [];
  let before = 0;
  let removed = 0;
  let groupsWithCopies = 0;
  let withoutIdentity = 0;
  let patched = 0;

  for (const tableName of ASSET_MIRROR_TABLES) {
    const rows = (await tableOf(tableName).toArray()) as unknown as DedupRow[];
    const plan = buildDedupPlan(rows);
    const removedKeys = new Set<string>();
    plan.groups.forEach((group) => group.removed.forEach((row) => removedKeys.add(keyIdOf(row))));

    tables.push({
      table: tableName,
      before: plan.total,
      after: plan.total - plan.duplicates,
      removed: plan.duplicates,
      copies: plan.groups.length
    });

    if (tableName === 'local_assets') {
      before = plan.total;
      removed = plan.duplicates;
      groupsWithCopies = plan.groups.length;
      withoutIdentity = plan.withoutIdentity;
      patched = plan.groups.filter((group) => Object.keys(group.patch).length > 0).length;
      examples = plan.groups.slice(0, 5).map((group) => ({
        key: group.key,
        keeper: String(group.keeper.primarykey),
        removed: group.removed.map((row) => String(row.primarykey))
      }));
      perFilial = summarizePerFilial(rows, removedKeys);
    }
  }

  return { examples, before, after: before - removed, removed, groupsWithCopies, withoutIdentity, patched, tables, perFilial };
}

/** Linhas do relatório, para o log do Gestor de Base. */
export function formatDedupReport(report: DedupReport): string[] {
  // `after` é uma projeção de LINHAS: soma cada linha sem etiqueta como se fosse
  // uma identidade própria. Essas linhas não têm identidade (`assetIdentityKey`
  // devolve vazio), portanto o rótulo separa as duas contas em vez de chamar
  // "identidades" a todas — 11 437 identidades + 395 sem etiqueta = 11 832 linhas.
  const identities = report.after - report.withoutIdentity;
  const lines = [
    `[DEDUP] ANTES: ${report.before} linhas em local_assets · ${report.after} linha(s) após somar identidades · cópias: ${report.removed}`,
    `[DEDUP] Identidades distintas (tenantid+filial+etiqueta): ${identities} · linhas sem etiqueta (fora do agrupamento, contadas uma a uma): ${report.withoutIdentity}`,
    `[DEDUP] Grupos com cópias (tenantid+filial+etiqueta): ${report.groupsWithCopies}`,
    '[DEDUP] Diagnóstico apenas: nenhum registo é apagado. Cópias resolvem-se na origem (planilha) e a carga bloqueia quando os números não batem.'
  ];
  report.tables.forEach((table) => {
    lines.push(`[DEDUP] ${table.table}: ${table.before} linhas · ${table.after} linha(s) após somar identidades · ${table.removed} cópia(s)`);
  });
  report.perFilial.slice(0, 8).forEach((filial) => {
    lines.push(`[DEDUP] ${filial.filial}: ${filial.before} linhas · ${filial.after} linha(s) após somar identidades · ${filial.removed} cópia(s)`);
  });
  report.examples.forEach((example) => {
    lines.push(`[DEDUP] ex. identidade "${example.key}" · grafias ${[example.keeper, ...example.removed].map((k) => `"${k}"`).join(', ')}`);
  });
  return lines;
}
