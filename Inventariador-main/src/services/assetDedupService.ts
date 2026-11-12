import { db } from './sqliteService';
import { buildDedupPlan, type DedupRow } from '../utils/dedupAssets';
import { logger } from '../utils/logger';

/**
 * Limpeza de cópias repetidas de ativos (mesmo `tenantid + filial + etiqueta`).
 *
 * Contexto: o mesmo conjunto pode ser gravado várias vezes na base local com
 * `primarykey` diferente, então o `bulkPut` não substitui — a Unidade Operacional
 * passa a somar 4× os mesmos ativos (50 544 no lugar de 12 636).
 *
 * O plano é sempre calculado primeiro e exposto em relatório (antes/depois).
 * `previewAssetDuplicateCleanup` NÃO escreve nada; só
 * `applyAssetDuplicateCleanup` remove linhas — e apenas as que têm identidade
 * completa (tenantid + filial + etiqueta).
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

export interface DedupReport {
  before: number;
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

/** Resumo por filial: quantas linhas existem e quantas saem da limpeza. */
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
 * `[tenantid+primarykey]`. Apagar só pelo `primarykey` não remove nada — a
 * chave não coincide e o `bulkDelete` termina sem apagar (era o que acontecia
 * numa primeira versão desta limpeza).
 */
const primaryKeyOf = (row: DedupRow): [string, string] => [String(row.tenantid ?? ''), String(row.primarykey)];

/** Identificador textual da chave composta, para comparar dentro de um resumo. */
const keyIdOf = (row: DedupRow): string => primaryKeyOf(row).join('\u0000');

/**
 * Calcula o relatório sem tocar na base. `after` é o que ficaria após a limpeza.
 */
export async function previewAssetDuplicateCleanup(): Promise<DedupReport> {
  const tables: DedupTableReport[] = [];
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
      perFilial = summarizePerFilial(rows, removedKeys);
    }
  }

  return { before, after: before - removed, removed, groupsWithCopies, withoutIdentity, patched, tables, perFilial };
}

/**
 * Aplica a limpeza nos três espelhos (`local_assets`, `ativos`, `assets`) e
 * devolve o relatório antes/depois. A conferência (`_conferido`, `_auditor`,
 * `_dataLeitura`) da cópia conferida é preservada no registo que fica.
 */
export async function applyAssetDuplicateCleanup(): Promise<DedupReport> {
  const report = await previewAssetDuplicateCleanup();

  for (const tableName of ASSET_MIRROR_TABLES) {
    const table = tableOf(tableName);
    const rows = (await table.toArray()) as unknown as DedupRow[];
    const plan = buildDedupPlan(rows);
    const keysToDelete = plan.groups.flatMap((group) => group.removed.map(primaryKeyOf));
    const patches = plan.groups.filter((group) => Object.keys(group.patch).length > 0);
    if (keysToDelete.length === 0 && patches.length === 0) continue;

    await db.transaction('rw', table, async () => {
      if (keysToDelete.length > 0) await table.bulkDelete(keysToDelete);
      for (const group of patches) {
        await table.update(primaryKeyOf(group.keeper), group.patch);
      }
    });
  }

  logger.info(
    `[DEDUP] Cópias removidas: ${report.removed} (antes ${report.before} · depois ${report.after}) em ${report.groupsWithCopies} grupo(s).`
  );

  return report;
}

/** Linhas do relatório, para o log do Gestor de Base. */
export function formatDedupReport(report: DedupReport): string[] {
  const lines = [
    `[DEDUP] ANTES: ${report.before} linhas em local_assets · DEPOIS: ${report.after} · remover: ${report.removed}`,
    `[DEDUP] Grupos com cópias (tenantid+filial+etiqueta): ${report.groupsWithCopies} · sem etiqueta (intocados): ${report.withoutIdentity}`
  ];
  report.tables.forEach((table) => {
    lines.push(`[DEDUP] ${table.table}: ${table.before} → ${table.after} (-${table.removed})`);
  });
  report.perFilial.slice(0, 8).forEach((filial) => {
    lines.push(`[DEDUP] ${filial.filial}: ${filial.before} → ${filial.after} (-${filial.removed})`);
  });
  return lines;
}
