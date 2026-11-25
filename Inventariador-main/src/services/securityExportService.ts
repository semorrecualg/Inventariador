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
import { saveFileOnTrail } from './directoryTrailService';
import { generateChecksum } from './utils';
import { logger } from '../utils/logger';
import { db } from './sqliteService';

export const SECURITY_EXPORT_FORMAT = 'GBR_KARDEK_SECURITY_EXPORT' as const;
// 1.1 — pacote inteiro com hash próprio (`packageChecksum`), verificado antes
// de qualquer restauro. A v1.0 só tinha checksum por tabela.
export const SECURITY_EXPORT_VERSION = '1.1' as const;

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
  /**
   * SHA-256 do pacote inteiro (formato, schema, data, tabelas e registros, em
   * ordem canónica). Um pacote que não confere é recusado no restauro — cobre a
   * corrupção no transporte e a edição de um ficheiro à mão.
   */
  packageChecksum: string;
}

/**
 * Corpo canónico do pacote, sem o próprio hash. As tabelas entram ordenadas por
 * nome para o hash não depender da ordem em que o Dexie as expõe.
 */
function packageBody(manifest: Omit<SecurityExportManifest, 'packageChecksum'>): Record<string, unknown> {
  const tables: Record<string, SecurityExportTable> = {};
  for (const name of Object.keys(manifest.tables ?? {}).sort()) {
    tables[name] = manifest.tables[name];
  }
  return {
    format: manifest.format,
    version: manifest.version,
    schemaVersion: manifest.schemaVersion,
    exportedAt: manifest.exportedAt,
    source: manifest.source,
    tables
  };
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
    tables: {},
    packageChecksum: ''
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

  manifest.packageChecksum = await generateChecksum(packageBody(manifest));
  logger.info(`[SecurityExport] Pacote selado: SHA-256 ${manifest.packageChecksum.slice(0, 16)}…`);
  return manifest;
}

export interface SecurityExportVerification {
  ok: boolean;
  /** Problemas encontrados, na ordem em que a verificação os deteta. */
  problems: string[];
}

/**
 * Verifica um pacote SEM tocar em nenhuma base: formato, contagem por tabela e
 * hash do pacote. É o portão do restauro — recusar aqui é o que impede um
 * ficheiro corrompido de substituir o trabalho de campo.
 *
 * O `packageChecksum` cobre os registos de todas as tabelas (corpo canónico),
 * por isso não se recalcula o SHA-256 por tabela: o checksum de cada tabela
 * viaja no manifesto como evidência da Fase 0, não como segundo portão.
 */
export async function verifySecurityExport(
  manifest: SecurityExportManifest
): Promise<SecurityExportVerification> {
  if (!manifest || manifest.format !== SECURITY_EXPORT_FORMAT) {
    return { ok: false, problems: ['formato inválido'] };
  }

  const problems: string[] = [];
  for (const [name, snapshot] of Object.entries(manifest.tables ?? {})) {
    if (!snapshot || !Array.isArray(snapshot.records)) {
      problems.push(`${name}: registros ausentes`);
      continue;
    }
    if (snapshot.count !== snapshot.records.length) {
      problems.push(`${name}: contagem ${snapshot.count} ≠ ${snapshot.records.length} registros`);
    }
  }

  if (!manifest.packageChecksum) {
    problems.push('hash do pacote ausente');
  } else if (!/^[0-9a-f]{64}$/.test(manifest.packageChecksum)) {
    // `generateChecksum` devolve `checksum_error` quando o `crypto.subtle`
    // falha: sem esta guarda esse valor compararia igual a si próprio e o
    // pacote passava sem selo nenhum.
    problems.push('hash do pacote inválido');
  } else {
    const expected = await generateChecksum(packageBody(manifest));
    if (expected !== manifest.packageChecksum) {
      problems.push('hash do pacote não confere');
    }
  }

  return { ok: problems.length === 0, problems };
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

  // Portão do restauro: verifica o pacote inteiro antes da primeira escrita.
  // Um ficheiro corrompido não chega a limpar nenhuma tabela.
  const verification = await verifySecurityExport(manifest);
  if (!verification.ok) {
    throw new Error(`Pacote de backup inválido: ${verification.problems.join('; ')}`);
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
 * Lê o texto de um pacote exportado por este serviço (`.json`/`.dat`). Não toca
 * em nenhuma base: um ficheiro truncado ou que não seja JSON é recusado aqui,
 * antes de `verifySecurityExport` julgar o conteúdo.
 */
export function parseSecurityExport(text: string): SecurityExportManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('ficheiro não é JSON válido');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('conteúdo do ficheiro não é um pacote de backup');
  }
  return parsed as SecurityExportManifest;
}

/** Resultado da gravação do pacote no telefone. */
export interface SecurityExportSavedFile {
  saved: boolean;
  /** Caminho legível para o operador (pasta/nome). */
  path?: string;
  /** URI devolvido pelo Capacitor (`file://…`). */
  uri?: string;
}

/**
 * Persiste o snapshot em arquivo físico `.dat` no dispositivo (Capacitor).
 *
 * No APK o download por `<a download>` do WebView não escreve nada, e o
 * operador ficava sem saber onde o pacote foi parar. A gravação passa pela
 * TRILHA DE DIRETÓRIO (`saveFileOnTrail`): a pasta que o operador escolheu ao
 * carregar a planilha é o primeiro destino; sem ela — ou sem permissão — a
 * trilha cai para Documentos e para o armazenamento do app. O nome é datado,
 * para um export novo não apagar o pacote antigo que o restauro precisa, e o
 * caminho devolvido é o que a UI mostra ao operador.
 */
export async function persistSecurityExportPhysical(
  manifest: SecurityExportManifest
): Promise<SecurityExportSavedFile> {
  if (!Capacitor.isNativePlatform()) return { saved: false };

  const stamp = new Date(manifest.exportedAt).toISOString().replace(/[:.]/g, '-');
  const fileName = `GBR_SECURITY_EXPORT_v${manifest.schemaVersion}_${stamp}.dat`;
  const resultado = await saveFileOnTrail(fileName, serializeSecurityExport(manifest));

  if (!resultado.saved) {
    logger.error('[SecurityExport] Não foi possível gravar o pacote no telefone:', resultado.tentativas.join(' · '));
    return { saved: false };
  }

  logger.info(`[SecurityExport] Pacote gravado em ${resultado.path} (${resultado.uri}).`);
  return { saved: true, path: resultado.path, uri: resultado.uri };
}

/**
 * Dispara o download do snapshot no navegador/Web (artefato fora do app, em
 * `.json` e `.dat`). Só corre fora do nativo: no WebView do APK o `<a download>`
 * é ignorado e não grava ficheiro nenhum (aí o caminho é
 * `persistSecurityExportPhysical`). Em sandbox/iFrame o download pode ser
 * bloqueado — a falha é esperada e não-fatal.
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

export interface SecurityPackageExport {
  ok: boolean;
  /** Problemas que recusaram o pacote (vazio quando `ok`). */
  problems: string[];
  /** Pacote montado — o mesmo que foi (ou seria) descarregado. */
  manifest: SecurityExportManifest;
  /** Total de registos em todas as tabelas do pacote. */
  total: number;
  /** Ficheiro gravado no telefone (só no nativo; a Web descarrega). */
  savedFile?: SecurityExportSavedFile;
}

/**
 * Monta, verifica e descarrega o pacote de backup verificado. Ponto único do
 * export: o Gestor de Base e a Gestão e Manutenção não repetem nem a montagem
 * nem o portão, e nenhum deles descarrega um pacote recusado.
 */
export async function exportVerifiedSecurityPackage(
  dbInstance: Dexie = db
): Promise<SecurityPackageExport> {
  const manifest = await buildSecurityExport(dbInstance);
  const verification = await verifySecurityExport(manifest);
  const total = Object.values(manifest.tables).reduce((sum, table) => sum + table.count, 0);
  if (!verification.ok) {
    return { ok: false, problems: verification.problems, manifest, total };
  }
  if (Capacitor.isNativePlatform()) {
    const savedFile = await persistSecurityExportPhysical(manifest);
    return { ok: true, problems: [], manifest, total, savedFile };
  }
  downloadSecurityExport(manifest);
  return { ok: true, problems: [], manifest, total };
}
