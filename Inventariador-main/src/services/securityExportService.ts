// src/services/securityExportService.ts
// FASE 0 — EXPORT DE SEGURANÇA (docs/MIGRACAO_HIBRIDA.md, itens 3 e 4).
//
// Snapshot completo e congelado de TODAS as tabelas Dexie do InventoryLocalStore,
// com contagem + checksum SHA-256 POR TABELA. É a garantia "zero perda de dados"
// exigida antes de qualquer fase de migração estrutural (ex.: consolidação
// local_assets/ativos/assets) e o artefato do teste backup → restore ponta-a-ponta.
//
// O núcleo (build/restore/serialize) é agnóstico de plataforma e testável em Node
// (Vitest); os wrappers de persistência (.dat físico Capacitor / download Web)
// seguem o mesmo padrão best-effort dos serviços existentes.
import Dexie from 'dexie';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { generateChecksum } from './utils';
import { logger } from '../utils/logger';
import { db } from './sqliteService';

export const SECURITY_EXPORT_FORMAT = 'GBR_KARDEK_SECURITY_EXPORT' as const;
export const SECURITY_EXPORT_VERSION = '1.0' as const;

export interface SecurityExportTable {
  /** Número de registros na tabela no momento do snapshot. */
  count: number;
  /** SHA-256 do JSON canônico (chaves ordenadas + registros ordenados por PK). */
  checksum: string;
  /** Registros completos da tabela em ordem canônica (por chave primária). */
  records: unknown[];
}

export interface SecurityExportManifest {
  format: typeof SECURITY_EXPORT_FORMAT;
  version: typeof SECURITY_EXPORT_VERSION;
  /** `db.verno` do banco de origem — o restore recusa snapshots mais novos. */
  schemaVersion: number;
  /** Timestamp ISO do snapshot. */
  exportedAt: string;
  source: 'DEXIE_INDEXEDDB';
  /** Mapa nome-da-tabela → snapshot (uma entrada por tabela do banco). */
  tables: Record<string, SecurityExportTable>;
}

/** Ordena registros pela chave primária (canônica) para checksum determinístico. */
function sortByPrimaryKey(records: unknown[], keyPath: string | string[] | undefined): unknown[] {
  if (keyPath === undefined || records.length < 2) return records;
  const keyOf = (rec: Record<string, unknown>) => {
    if (Array.isArray(keyPath)) {
      return keyPath.map(k => String(rec[k] ?? '')).join('\u0000');
    }
    return String(rec[keyPath] ?? '');
  };
  return [...records].sort((a, b) => {
    const ka = keyOf(a as Record<string, unknown>);
    const kb = keyOf(b as Record<string, unknown>);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * Monta o snapshot completo de segurança do banco Dexie informado (padrão: o
 * `InventoryLocalStore` da aplicação). Somente leitura — não altera nenhum dado.
 * Gera contagem + checksum por tabela, cobrindo o critério de aceite da Fase 0.
 */
export async function buildSecurityExport(
  dbInstance: Dexie = db
): Promise<SecurityExportManifest> {
  const manifest: SecurityExportManifest = {
    format: SECURITY_EXPORT_FORMAT,
    version: SECURITY_EXPORT_VERSION,
    schemaVersion: dbInstance.verno,
    exportedAt: new Date().toISOString(),
    source: 'DEXIE_INDEXEDDB',
    tables: {}
  };

  for (const table of dbInstance.tables) {
    const records = await table.toArray();
    const canonical = sortByPrimaryKey(records, table.schema.primKey.keyPath);
    manifest.tables[table.name] = {
      count: canonical.length,
      checksum: await generateChecksum(canonical),
      records: canonical
    };
    logger.info(`[SecurityExport] Tabela '${table.name}': ${canonical.length} registros (checksum ${canonical.length > 0 ? 'calculado' : 'vazio'}).`);
  }

  return manifest;
}

export interface SecurityRestoreResult {
  /** tabela → registros restaurados. */
  restored: Record<string, number>;
  /** tabelas do manifesto ausentes no banco-alvo (schema mais antigo). */
  skipped: string[];
}

/**
 * Restaura um snapshot de segurança de ponta a ponta: para cada tabela do
 * manifesto, limpa a tabela-alvo e reinsere os registros atomicamente (transação
 * por tabela, mesmo padrão do `verifyAndRestorePhysicalBackup`).
 *
 * - Tabelas do manifesto que não existem no banco-alvo são puladas e reportadas
 *   em `skipped` (nunca falham o restore inteiro por schema mais antigo).
 * - Tabelas do banco-alvo que NÃO estão no manifesto não são tocadas (restauração
 *   parcial nunca destrói dados fora do escopo do snapshot).
 * - Recusa manifestos com `schemaVersion` MAIOR que o banco-alvo (downgrade de
 *   dados — violaria o princípio de zero perda).
 */
export async function restoreSecurityExport(
  manifest: SecurityExportManifest,
  dbInstance: Dexie = db
): Promise<SecurityRestoreResult> {
  if (!manifest || manifest.format !== SECURITY_EXPORT_FORMAT) {
    throw new Error('Formato de export de segurança inválido.');
  }
  if (manifest.schemaVersion > dbInstance.verno) {
    throw new Error(
      `Export de segurança v${manifest.schemaVersion} não pode ser restaurado em banco v${dbInstance.verno} (downgrade).`
    );
  }

  const result: SecurityRestoreResult = { restored: {}, skipped: [] };
  const existingTables = new Set(dbInstance.tables.map(t => t.name));

  for (const [tableName, snapshot] of Object.entries(manifest.tables)) {
    if (!existingTables.has(tableName)) {
      result.skipped.push(tableName);
      logger.warn(`[SecurityExport] Tabela '${tableName}' ausente no banco-alvo — pulada.`);
      continue;
    }
    const table = dbInstance.table(tableName);
    await dbInstance.transaction('rw', table, async () => {
      await table.clear();
      if (snapshot.records.length > 0) {
        await table.bulkAdd(snapshot.records as never[]);
      }
    });
    result.restored[tableName] = snapshot.records.length;
    logger.info(`[SecurityExport] Tabela '${tableName}' restaurada: ${snapshot.records.length} registros.`);
  }

  return result;
}

/** Serializa o manifesto para JSON (artefato `.json` / `.dat`). */
export function serializeSecurityExport(manifest: SecurityExportManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Persiste o snapshot em arquivo físico `.dat` no dispositivo (Capacitor,
 * Directory.Documents/GBR_KARDEK_DATA). Best-effort: em Web/iFrame retorna false
 * silenciosamente (mesmo padrão de `backupDatabaseToPhysicalStorage`).
 */
export async function persistSecurityExportPhysical(
  manifest: SecurityExportManifest
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await Filesystem.writeFile({
      path: `GBR_KARDEK_DATA/security_export_v${manifest.schemaVersion}.dat`,
      data: serializeSecurityExport(manifest),
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
      recursive: true
    });
    logger.info(`[SecurityExport] Artefato físico .dat gravado (schema v${manifest.schemaVersion}).`);
    return true;
  } catch (error) {
    logger.error('[SecurityExport] Erro ao gravar artefato físico .dat:', error);
    return false;
  }
}

/**
 * Dispara o download do snapshot no navegador/Web (artefato fora do app, em
 * `.json` e `.dat`). Em sandbox/iFrame o download pode ser bloqueado — a falha
 * é esperada e não-fatal (mesmo padrão de `saveSnapshotToWorkspace`).
 */
export function downloadSecurityExport(manifest: SecurityExportManifest): void {
  if (typeof document === 'undefined') return;
  const json = serializeSecurityExport(manifest);
  const stamp = new Date(manifest.exportedAt).toISOString().replace(/[:.]/g, '-');
  for (const ext of ['json', 'dat']) {
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `GBR_SECURITY_EXPORT_v${manifest.schemaVersion}_${stamp}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.warn(`[SecurityExport] Download .${ext} bloqueado (esperado em sandbox):`, error);
    }
  }
}
