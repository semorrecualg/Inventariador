// ============================================================================
// MIGRAÇÃO ÚNICA — chaves antigas para o formato do ERP
// ----------------------------------------------------------------------------
// As bases existentes guardam `primarykey` derivado da etiqueta (`000420`) ou
// do conteúdo (`SEM-ETIQUETA-…`). A carga nova grava a identidade do ERP —
// `código da filial + registro + subreg` (`010101OBRA102840007`) — e, como
// `bulkPut` não limpa a base, reimportar criaria linhas NOVAS ao lado das
// antigas para o mesmo ativo.
//
// Esta migração reescreve as chaves existentes para o formato do ERP, uma vez
// por instalação (flag persistida), com o mesmo cuidado da reparação anterior:
// execução única, guarda contra concorrência, resultado em `audit_logs`.
//
// Consequências deliberadas:
//   - `_is_synced` volta a 0 nos registos migrados: a nuvem precisa de conhecer
//     a chave do ERP. As linhas antigas que já lá estejam com a chave anterior
//     ficam órfãs e têm de ser limpas no Supabase (não há como apagá-las daqui
//     sem rede nem autorização).
//   - Linhas sem `registro` nem `subreg` não têm identidade de ERP: ficam como
//     estão (são exactamente as que a carga também deriva do conteúdo).
//   - Duas linhas antigas que caiam na mesma chave de ERP são preservadas: a
//     primeira fica com a chave e as seguintes recebem `-2`, `-3`, … pela ordem
//     da chave antiga (determinístico, não depende da ordem de leitura).
// ============================================================================

import { db, DexieAsset } from './sqliteService';
import { contractAssetKey, sanitizeAssetKey } from '../utils/assetKey';
import { logger } from '../utils/logger';

export const ASSET_KEY_MIGRATION_FLAG = 'app_migrate_asset_keys_erp_v1';

export interface AssetKeyMigrationResult {
  /** Registos cuja chave passou a ser a do ERP. */
  migrated: number;
  /** Registos sem identidade de ERP (sem registro/subreg) ou já migrados. */
  skipped: number;
  /** Registos que colidiram na chave nova e receberam sufixo de ocorrência. */
  collisions: number;
  /** `true` quando a migração já tinha corrido nesta instalação. */
  alreadyDone: boolean;
}

const EMPTY: AssetKeyMigrationResult = { migrated: 0, skipped: 0, collisions: 0, alreadyDone: false };

/** Chave nova de uma linha, ou `''` quando não há identidade de ERP. */
const erpKeyOf = (row: Pick<DexieAsset, 'filial' | 'registro' | 'subreg'>): string =>
  contractAssetKey({ filial: row.filial, registro: row.registro, subreg: row.subreg });

/** Agrupa por contrato e ordena pela chave antiga: o sufixo não depende da leitura. */
const planTable = (
  rows: DexieAsset[]
): { updates: Array<{ old: DexieAsset; next: DexieAsset }>; skipped: number; collisions: number } => {
  const updates: Array<{ old: DexieAsset; next: DexieAsset }> = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  let collisions = 0;

  const ordered = [...rows].sort((a, b) =>
    String(a.tenantid).localeCompare(String(b.tenantid)) ||
    String(a.primarykey).localeCompare(String(b.primarykey))
  );

  for (const row of ordered) {
    const base = erpKeyOf(row);
    if (!base) {
      skipped += 1;
      continue;
    }

    const scope = `${sanitizeAssetKey(row.tenantid)}|${base}`;
    const occurrence = (seen.get(scope) ?? 0) + 1;
    seen.set(scope, occurrence);
    const nextKey = occurrence === 1 ? base : `${base}-${occurrence}`;
    if (occurrence > 1) collisions += 1;

    if (nextKey === row.primarykey) {
      skipped += 1;
      continue;
    }

    updates.push({
      old: row,
      next: { ...row, id: nextKey, primarykey: nextKey, _is_synced: 0 }
    });
  }

  return { updates, skipped, collisions };
};

async function runMigration(): Promise<AssetKeyMigrationResult> {
  if (typeof localStorage === 'undefined') return EMPTY;
  try {
    if (localStorage.getItem(ASSET_KEY_MIGRATION_FLAG) === 'done') {
      return { ...EMPTY, alreadyDone: true };
    }
  } catch {
    return EMPTY;
  }

  const totals: AssetKeyMigrationResult = { ...EMPTY };

  await db.transaction('rw', [db.local_assets, db.ativos, db.assets], async () => {
    for (const table of [db.local_assets, db.ativos, db.assets] as const) {
      const rows = (await table.toArray()) as DexieAsset[];
      const plan = planTable(rows);
      totals.skipped = Math.max(totals.skipped, plan.skipped);
      totals.collisions = Math.max(totals.collisions, plan.collisions);
      if (plan.updates.length === 0) continue;

      // A chave é composta `[tenantid+primarykey]`: renomear exige apagar a
      // linha antiga e gravar a nova, na mesma transacção.
      await table.bulkDelete(plan.updates.map(({ old }) => [old.tenantid, old.primarykey] as [string, string]));
      await table.bulkPut(plan.updates.map(({ next }) => next));
      totals.migrated = Math.max(totals.migrated, plan.updates.length);
    }
  });

  logger.warn(`>>> [Asset Key] Migração para o formato do ERP: ${totals.migrated} registo(s) reescrito(s), ${totals.collisions} com sufixo de ocorrência, ${totals.skipped} sem identidade de ERP.`);

  try {
    await db.audit_logs.put({
      id: `LOG_${Date.now()}_KEYMIG`,
      usuario: 'sistema',
      acao: 'ASSET_KEY_MIGRATION',
      tabela: 'local_assets',
      registro_id: 'ERP',
      details: `Migração única das chaves para o formato do ERP (filial+registro+subreg): ${totals.migrated} reescrito(s), ${totals.collisions} sufixado(s), ${totals.skipped} sem identidade.`,
      delta: null,
      updated_at: new Date().toISOString()
    });
  } catch (auditErr) {
    logger.warn('>>> [Asset Key] Falha ao registar a migração em audit_logs:', auditErr);
  }

  try {
    localStorage.setItem(ASSET_KEY_MIGRATION_FLAG, 'done');
  } catch {
    /* storage indisponível: volta a tentar no próximo arranque */
  }
  return totals;
}

let migrationInFlight: Promise<AssetKeyMigrationResult> | null = null;

/**
 * Reescreve uma única vez as chaves antigas para o formato do ERP.
 * Arranque e ciclo de sincronização chamam a mesma função; o `inFlight` evita
 * que corram em paralelo e a flag impede repetição entre arranques.
 */
export async function migrateAssetKeysToErpOnce(): Promise<AssetKeyMigrationResult> {
  if (migrationInFlight) return migrationInFlight;
  migrationInFlight = runMigration().finally(() => {
    migrationInFlight = null;
  });
  return migrationInFlight;
}
