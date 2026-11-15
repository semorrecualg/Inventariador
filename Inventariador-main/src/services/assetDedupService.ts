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

export interface DedupExample {
  /** Identidade normalizada: tenantid|filial|etiqueta. */
  key: string;
  keeper: string;
  removed: string[];
}

export interface DedupReport {
  /** Id da entrada em `audit_logs` (vazio no diagnóstico, que não escreve nada). */
  auditId: string;
  /**
   * Até 5 grupos com as chaves envolvidas. É o que mostra QUAL caminho gravou a
   * cópia (maiúsculas vs minúsculas, com/sem espaços, `ALT-` aleatório, etc.).
   */
  examples: DedupExample[];
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

  return { auditId: '', examples, before, after: before - removed, removed, groupsWithCopies, withoutIdentity, patched, tables, perFilial };
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

  const auditId = await logDedupAudit(report);
  report.auditId = auditId;

  // A Unidade Operacional guarda o total em estado: sem este aviso o ecrã
  // continua a somar as linhas que acabaram de sair da base.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gbr_local_assets_changed', { detail: { removed: report.removed } }));
  }

  logger.info(
    `[DEDUP] Cópias removidas: ${report.removed} (antes ${report.before} · depois ${report.after}) em ${report.groupsWithCopies} grupo(s).`
  );

  return report;
}

const currentUserEmail = (): string => {
  try {
    const raw = typeof window !== 'undefined' ? sessionStorage.getItem('app_current_user') : null;
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { email?: string };
    return String(parsed?.email || '').trim();
  } catch {
    return '';
  }
};

/**
 * Grava o resultado da limpeza em `audit_logs` (antes/depois, removidos e o
 * detalhe por filial). `delta` leva os números em JSON para poderem ser lidos
 * sem interpretar texto.
 */
async function logDedupAudit(report: DedupReport): Promise<string> {
  const auditId = `DEDUP_${Date.now()}_${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
  const porFilial = report.perFilial.map((f) => `${f.filial} ${f.before}→${f.after} (-${f.removed})`).join(' · ');
  await db.audit_logs.put({
    id: auditId,
    usuario: currentUserEmail() || 'SISTEMA',
    acao: 'DEDUP_ASSETS',
    tabela: 'assets',
    registro_id: 'DEDUP_ASSETS',
    details: `Limpeza de cópias por tenantid + filial + etiqueta: ${report.before} → ${report.after} (removidas ${report.removed}) em ${report.groupsWithCopies} grupo(s); sem etiqueta (intocados): ${report.withoutIdentity}. Por filial: ${porFilial}`,
    delta: JSON.stringify({
      before: report.before,
      after: report.after,
      removed: report.removed,
      groupsWithCopies: report.groupsWithCopies,
      withoutIdentity: report.withoutIdentity,
      patched: report.patched,
      perFilial: report.perFilial,
      examples: report.examples,
      tables: report.tables
    }),
    updated_at: new Date().toISOString()
  });
  return auditId;
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
  report.examples.forEach((example) => {
    lines.push(`[DEDUP] ex. fica "${example.keeper}" · saem ${example.removed.map((k) => `"${k}"`).join(', ')}`);
  });
  return lines;
}
