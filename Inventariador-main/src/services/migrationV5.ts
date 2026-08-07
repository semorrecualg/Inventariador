/**
 * MIGRATIONV5.TS — Migração Dexie `version(5)` (Fase C4).
 *
 * Contrato: docs/PLANO_FASE_C_HIGIENIZACAO.md §6 (spec §6.1, testes §6.2) e
 * docs/SCHEMA_BASELINE.md (v4 → v5 — MESMAS assinaturas, sem mudança estrutural).
 *
 * Objetivo: normalizar DADOS existentes no banco local de forma **idempotente**:
 *  (1) reescrever chaves UPPER → canônico minúsculo (canônico vence; o UPPER é
 *      removido — resolve a dependência crítica §5.2: leituras diretas canônicas
 *      passam a funcionar para dados legados);
 *  (2) normalizar VALORES por classe (K/T/N/D/F) — MESMO primitivo do loader M1
 *      (`normalizeFieldValue`), garantindo regra única por campo;
 *  (3) reconcile **aditivo** de `addresses` a partir dos ativos normalizados
 *      (espelha `getLocationsWithStats` — assets canônica, fallback local_assets).
 *
 * Garantias (contrato risco zero):
 * - PK imutável: `primarykey`/`id` nunca são alterados; `PRIMARYKEY` não é
 *   reescrito (evita recriação de registros — decisão §3.4 nota 2).
 * - Idempotente: `modify` só persiste quando o valor muda; 2ª execução → 0 alterações.
 * - Nunca corrompe: N/D não-parseáveis são preservados (null = skip).
 * - Chaves de runtime (TAG_INVENTARIO, DE_PARA, ESTADO_CONSERVACAO,
 *   GRUPO_EMPRESARIAL, AUDITOR_*) NÃO são reescritas — mesma allowlist da M2 (§5.3).
 * - `addresses`: só adiciona linhas faltantes; nunca apaga linhas existentes.
 * - Flag de segurança `NORMALIZE_ON_UPGRADE === false` pula a etapa de dados
 *   (rollback instantâneo — decisão §9.2).
 */
import { NORMALIZE_ON_UPGRADE, normalizeFieldValue, normalizeNumeric, normalizeDateISO, normalizeFlag, pickCanonical } from '../utils/normalize';
import { CANONICAL_KEY_MAP } from '../constants/schema';
import type { Transaction, Table } from 'dexie';
import { logger } from '../utils/logger';

// --- Allowlist de reescrita de chaves (política da M2, §5.2/§5.3) -------------
// Variantes UPPER que são COLUNAS canônicas do contrato (CANONICAL_KEY_MAP ∩
// DexieAsset). Chaves de runtime NÃO são reescritas (semântica difere da coluna).
const PRESERVED_RUNTIME_KEYS = new Set([
  'TAG_INVENTARIO', 'DE_PARA', 'ESTADO_CONSERVACAO', 'GRUPO_EMPRESARIAL',
  'AUDITOR_STATUS_CONFERENCIA', 'AUDITOR', '_ORIGEMTRANSACAO', '_CAMPAIGNID'
]);

/** UPPER → canônico, exceto runtime preservadas e PRIMARYKEY (chave primária). */
const REWRITE_KEY_MAP: Record<string, string> = {};
for (const [upper, canonical] of Object.entries(CANONICAL_KEY_MAP)) {
  if (!PRESERVED_RUNTIME_KEYS.has(upper) && upper !== 'PRIMARYKEY') {
    REWRITE_KEY_MAP[upper] = canonical;
  }
}

// --- Rotas de valor por classe (espelham normalize.ts + coerções C3) ----------
const TEXT_FIELDS = [
  'endereco', 'serial', 'registro', 'subreg', 'contacontabil', 'centrodecusto',
  'cnpj', 'notafiscal', 'filial', 'descricaodoativo', 'nomefornecedor', 'status',
  'etiqueta', 'tag'
] as const;

const NUMERIC_FIELDS = ['qt', 'vlraquisic', 'sn1_recno', 'sn3_recno'] as const;
const DATE_FIELDS = ['dataaqusic', 'databaixa'] as const;
const FLAG_FIELDS = [
  '_is_synced', '_is_deleted', '_conferido', '_plaquetado', '_aprovado',
  '_isNew', '_is_unitized', '_is_divergent_baixa'
] as const;

export const ASSET_TABLES = ['assets', 'local_assets', 'ativos'] as const;

export interface NormalizeResult {
  changed: boolean;
  record: Record<string, unknown>;
  changedFields: string[];
}

/**
 * Primitivo puro da migração (testável sem Dexie): reescreve chaves UPPER →
 * canônico e normaliza valores por classe. Retorna `changed=false` quando nada
 * muda (idempotência: aplicar 2× → 0 alterações).
 */
export function normalizeAssetRecordV5(rec: Record<string, unknown>): NormalizeResult {
  // Registro sem PK: não mexe (Dexie gerencia chave auto; modificar o objeto
  // retornado poderia mover o registro). Risco zero.
  if (rec.primarykey === undefined && rec.id === undefined && rec.PRIMARYKEY === undefined) {
    return { changed: false, record: rec, changedFields: [] };
  }

  const record: Record<string, unknown> = { ...rec };
  const changedFields: string[] = [];
  const mark = (field: string) => {
    if (!changedFields.includes(field)) changedFields.push(field);
  };

  // (1) Reescrita de chaves — canônico vence; UPPER removido.
  for (const [upper, canonical] of Object.entries(REWRITE_KEY_MAP)) {
    if (!(upper in record)) continue;
    if (record[canonical] === undefined) {
      record[canonical] = record[upper];
    }
    delete record[upper];
    mark(canonical);
  }

  // (2) Valores por classe — grava apenas quando muda.
  for (const field of TEXT_FIELDS) {
    const cur = pickCanonical(record, field);
    const next = normalizeFieldValue(field, cur);
    // Contrato DexieAsset: status/etiqueta/descricaodoativo/filial são string
    // não-nula. Se a regra resultar null (vazio/ausente), preserva o atual.
    if (next === null) continue;
    if (String(next) !== String(cur ?? '')) {
      record[field] = next;
      mark(field);
    }
  }

  for (const field of NUMERIC_FIELDS) {
    const cur = pickCanonical(record, field);
    const next = normalizeNumeric(cur);
    if (next === null) continue; // inválido/ausente: preserva (nunca corrompe)
    // Coage string → número sempre que a representação não for numérica nativa
    // (contrato DexieAsset: number). number → number = no-op (idempotente).
    if (typeof cur !== 'number' || Number(cur) !== next) {
      record[field] = next;
      mark(field);
    }
  }

  for (const field of DATE_FIELDS) {
    const cur = pickCanonical(record, field);
    const next = normalizeDateISO(cur);
    if (next === null) continue;
    if (next !== String(cur ?? '')) {
      record[field] = next;
      mark(field);
    }
  }

  for (const field of FLAG_FIELDS) {
    const cur = pickCanonical(record, field);
    const next = normalizeFlag(cur) ? 1 : 0;
    // Unifica a representação para 0|1 numérico (contrato DexieAsset), incluindo
    // chave ausente → 0 (mesma semântica de toDexieAsset). number → number = no-op.
    if (typeof cur !== 'number' || Number(cur) !== next) {
      record[field] = next;
      mark(field);
    }
  }

  return { changed: changedFields.length > 0, record, changedFields };
}

// --- Checksum determinístico ---------------------------------------------------
// Campos em ordem FIXA (independente da ordem das chaves do objeto) para que o
// checksum seja comparável antes/depois e estável entre execuções.
const CHECKSUM_FIELDS = [
  'tenantid', 'filial', 'status', 'etiqueta', 'tag', 'qt', 'descricaodoativo',
  'serial', 'dataaqusic', 'cnpj', 'nomefornecedor', 'notafiscal', 'endereco',
  'registro', 'subreg', 'databaixa', 'contacontabil', 'primarykey',
  'centrodecusto', 'vlraquisic', 'sn1_recno', 'sn3_recno'
];

export function assetChecksum(rec: Record<string, unknown>): number {
  const parts: string[] = [];
  for (const f of CHECKSUM_FIELDS) {
    const v = pickCanonical(rec, f);
    parts.push(`${f}=${v === null || v === undefined ? '' : String(v)}`);
  }
  const s = parts.join('\u0001');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

// --- Dry-run (nunca grava) -----------------------------------------------------
export interface V5TableReport {
  name: string;
  count: number;
  changed: number;
  fieldsChanged: number;
  checksumBefore: number;
  checksumAfter: number;
}

export interface V5DryRunReport {
  /** `NORMALIZE_ON_UPGRADE` — se false, a etapa de dados seria pulada. */
  applied: boolean;
  skipped: boolean;
  /** 2ª passada em memória produz 0 alterações. */
  idempotent: boolean;
  checksumBefore: number;
  checksumAfter: number;
  tables: V5TableReport[];
}

/** Fonte de leitura para o dry-run (estrutural — aceita `db` ou um Dexie de teste). */
export interface V5Source {
  assets: Table<Record<string, unknown>, string>;
  local_assets: Table<Record<string, unknown>, string>;
  ativos: Table<Record<string, unknown>, string>;
}

/**
 * Relatório de dry-run: aplica `normalizeAssetRecordV5` em memória sobre um
 * snapshot do banco real (somente leitura) e reporta contagens, checksum
 * antes/depois e idempotência — SEM gravar nada.
 */
export async function runMigrationV5DryRun(source: V5Source): Promise<V5DryRunReport> {
  const tables = await Promise.all(
    ASSET_TABLES.map(async (name): Promise<V5TableReport> => {
      const rows = await source[name].toArray();
      let changed = 0;
      let fieldsChanged = 0;
      let checksumBefore = 0;
      let checksumAfter = 0;
      for (const row of rows) {
        const rec = row as unknown as Record<string, unknown>;
        checksumBefore += assetChecksum(rec);
        const result = normalizeAssetRecordV5(rec);
        checksumAfter += assetChecksum(result.record);
        if (result.changed) {
          changed += 1;
          fieldsChanged += result.changedFields.length;
        }
      }
      return {
        name,
        count: rows.length,
        changed,
        fieldsChanged,
        checksumBefore,
        checksumAfter
      };
    })
  );

  // Idempotência: a 2ª passada em memória não pode produzir alterações.
  let idempotent = true;
  for (const name of ASSET_TABLES) {
    const rows = await source[name].toArray();
    for (const row of rows) {
      const first = normalizeAssetRecordV5(row as unknown as Record<string, unknown>);
      const second = normalizeAssetRecordV5(first.record);
      if (second.changed) {
        idempotent = false;
        break;
      }
    }
    if (!idempotent) break;
  }

  return {
    applied: NORMALIZE_ON_UPGRADE,
    skipped: !NORMALIZE_ON_UPGRADE,
    idempotent,
    checksumBefore: tables.reduce((a, t) => a + t.checksumBefore, 0),
    checksumAfter: tables.reduce((a, t) => a + t.checksumAfter, 0),
    tables
  };
}

// --- Upgrade runner (transação Dexie) ------------------------------------------
/**
 * Executa a etapa de DADOS da migração `version(5)` dentro da transação de
 * upgrade do Dexie. `opts.enabled` (default: `NORMALIZE_ON_UPGRADE`) permite
 * pular a etapa de dados (rollback instantâneo — decisão §9.2).
 */
export async function runV5Upgrade(tx: Transaction, opts?: { enabled?: boolean }): Promise<void> {
  const enabled = opts?.enabled ?? NORMALIZE_ON_UPGRADE;
  if (!enabled) {
    logger.warn('[MigrationV5] NORMALIZE_ON_UPGRADE=false — etapa de dados pulada (rollback instantâneo).');
    return;
  }

  // (1) Normaliza chaves + valores (K/T/N/D/F) nas 3 tabelas de ativos.
  // Semântica do `modify` Dexie v4: o callback recebe um CLONE (ctx.value);
  // retornar `false` pula o registro; caso contrário o clone (mutado in-place)
  // é persistido. Retornar `false` quando nada mudou → zero escritas na 2ª
  // execução (idempotência de verdade, não só de conteúdo).
  for (const name of ASSET_TABLES) {
    const tbl = tx.table(name) as unknown as Table<Record<string, unknown>, string>;
    await tbl.toCollection().modify((row) => {
      const result = normalizeAssetRecordV5(row as unknown as Record<string, unknown>);
      if (!result.changed) return false;
      const rec = row as unknown as Record<string, unknown>;
      // Remove as chaves UPPER reescritas (não presentes no estado alvo) e
      // aplica o estado canônico normalizado sobre o clone.
      for (const k of Object.keys(rec)) {
        if (!(k in result.record)) delete rec[k];
      }
      Object.assign(rec, result.record);
    });
    logger.info(`[MigrationV5] Tabela '${name}' normalizada (idempotente — modify retorna false quando nada muda).`);
  }

  // (2) Reconcile aditivo de `addresses` a partir dos ativos normalizados.
  await reconcileAddresses(tx);
}

/**
 * Reconcile ADITIVO de `addresses`: deriva `{tenantid, filial, codigo_endereco,
 * setor, bloco, _is_synced}` dos ativos (assets canônica; fallback local_assets
 * — espelha getLocationsWithStats) e adiciona apenas as combinações ausentes.
 * Nunca apaga linhas existentes (zero perda; ids auto-incremento preservados).
 */
async function reconcileAddresses(tx: Transaction): Promise<void> {
  const addrTbl = tx.table('addresses') as unknown as Table<Record<string, unknown>, number>;
  const assetsTbl = tx.table('assets') as unknown as Table<Record<string, unknown>, string>;
  const localAssetsTbl = tx.table('local_assets') as unknown as Table<Record<string, unknown>, string>;

  const existing = await addrTbl.toArray();
  const existingKeys = new Set<string>();
  for (const row of existing) {
    const tenant = String(row.tenantid ?? '').trim().toUpperCase();
    const filial = String(row.filial ?? '').trim().toUpperCase();
    const codigo = String(row.codigo_endereco ?? '').trim().toUpperCase();
    if (tenant && filial && codigo) existingKeys.add(`${tenant}\u0001${filial}\u0001${codigo}`);
  }

  let workAssets = await assetsTbl.toArray();
  if (workAssets.length === 0) {
    workAssets = await localAssetsTbl.toArray();
  }

  const desired = new Map<string, Record<string, unknown>>();
  for (const a of workAssets) {
    const addr = String(a.endereco ?? '').trim();
    if (!addr) continue;
    const tenant = String(a.tenantid ?? '').trim().toUpperCase();
    const filial = String(a.filial ?? '').trim().toUpperCase();
    if (!tenant || !filial) continue;
    const key = `${tenant}\u0001${filial}\u0001${addr.toUpperCase()}`;
    if (!desired.has(key)) {
      desired.set(key, {
        tenantid: tenant,
        filial,
        codigo_endereco: addr,
        setor: '',
        bloco: '',
        _is_synced: 1
      });
    }
  }

  const toAdd = Array.from(desired.entries())
    .filter(([key]) => !existingKeys.has(key))
    .map(([, row]) => row);

  if (toAdd.length > 0) {
    await addrTbl.bulkAdd(toAdd);
  }
  logger.info(`[MigrationV5] addresses: ${existing.length} existentes, ${desired.size} desejadas, ${toAdd.length} adicionadas (aditivo).`);
}
