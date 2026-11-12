import { db } from './sqliteService';
import type { DexieAsset } from './sqliteService';
import {
  describeRecnoCollision,
  findRecnoCollisions,
  recnoKeyOf,
  sameRecnoData,
  summarizeRecnoRow,
  type RecnoCandidate,
  type RecnoCollision,
  type RecnoRowSummary
} from '../utils/recnoGuard';
import { logger } from '../utils/logger';

/**
 * GUARDIÃO SUAVE DE DUPLICIDADE POR RECNO (serviço)
 * ============================================================================
 * Compara `tenantid + filial + sn1_recno` na carga da planilha e na conferência
 * de campo. Quando o mesmo recno aparece com etiqueta, descrição ou valor
 * diferentes, o caso vai para `audit_logs` (`ASSET_DUP_SUSPECT`) e para o
 * relatório do Gestor de Base. NUNCA bloqueia a gravação e NUNCA apaga nada —
 * o operador decide. Ver `utils/recnoGuard.ts` para a razão de não ser chave
 * única (15 grupos reais com ativos diferentes).
 */

export const RECNO_AUDIT_ACTION = 'ASSET_DUP_SUSPECT';

export type RecnoGuardSource = 'CARGA_PLANILHA' | 'CONFERENCIA' | 'GESTOR_BASE';

interface RecnoIndexEntry {
  primarykey: string;
  etiqueta: string;
  descricao: string;
  valor: number;
  candidate: RecnoCandidate;
}

const INDEX_TTL_MS = 30_000;

let cache: Map<string, RecnoIndexEntry[]> | null = null;
let cacheBuiltAt = 0;

/** Esquece o índice em memória (após carga, limpeza de cópias ou restauro). */
export const invalidateRecnoGuardIndex = (): void => {
  cache = null;
  cacheBuiltAt = 0;
};

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  // Qualquer rotina que mexa na base avisa por este evento (carga, limpeza, pull).
  window.addEventListener('gbr_local_assets_changed', invalidateRecnoGuardIndex);
}

const buildIndex = async (): Promise<Map<string, RecnoIndexEntry[]>> => {
  const rows = (await db.local_assets.toArray()) as unknown as RecnoCandidate[];
  const map = new Map<string, RecnoIndexEntry[]>();
  for (const row of rows) {
    const key = recnoKeyOf(row);
    if (!key) continue;
    const summary = summarizeRecnoRow(row);
    const entry: RecnoIndexEntry = { ...summary, candidate: row };
    const bucket = map.get(key);
    if (bucket) bucket.push(entry);
    else map.set(key, [entry]);
  }
  cache = map;
  cacheBuiltAt = Date.now();
  return map;
};

const getIndex = async (): Promise<Map<string, RecnoIndexEntry[]>> => {
  if (cache && Date.now() - cacheBuiltAt < INDEX_TTL_MS) return cache;
  return buildIndex();
};

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
 * Conflitos de um ativo contra o que já está na base (mesmo recno, dados
 * diferentes). `[]` quando não há recno utilizável ou nada diverge.
 */
export async function findRecnoConflictsForAsset(asset: RecnoCandidate): Promise<RecnoCandidate[]> {
  const key = recnoKeyOf(asset);
  if (!key) return [];
  const index = await getIndex();
  const bucket = index.get(key) || [];
  const ownKey = String(asset.primarykey ?? '').trim();
  return bucket
    .filter((entry) => entry.primarykey !== ownKey && !sameRecnoData(asset, entry.candidate))
    .map((entry) => entry.candidate);
}

/** Todos os casos existentes na base local (relatório, sem escrever nada). */
export async function previewRecnoCollisions(): Promise<RecnoCollision[]> {
  const rows = (await db.local_assets.toArray()) as unknown as DexieAsset[];
  return findRecnoCollisions(rows as unknown as RecnoCandidate[]);
}

const alreadyLogged = async (collision: RecnoCollision): Promise<boolean> => {
  const entries = await db.audit_logs
    .filter((log) => log.acao === RECNO_AUDIT_ACTION && log.registro_id === collision.key)
    .toArray();
  return entries.some((log) => {
    try {
      return JSON.parse(String(log.delta || '{}')).signature === collision.signature;
    } catch {
      return false;
    }
  });
};

const logCollision = async (collision: RecnoCollision, source: RecnoGuardSource): Promise<boolean> => {
  if (await alreadyLogged(collision)) return false;
  await db.audit_logs.put({
    id: `DUP_${Date.now()}_${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    usuario: currentUserEmail() || 'SISTEMA',
    acao: RECNO_AUDIT_ACTION,
    tabela: 'assets',
    registro_id: collision.key,
    details: `Possível duplicidade por recno (${source}): ${describeRecnoCollision(collision)}. Nada foi bloqueado nem apagado.`,
    delta: JSON.stringify({
      signature: collision.signature,
      source,
      tenantid: collision.tenantid,
      filial: collision.filial,
      recno: collision.recno,
      rows: collision.rows
    }),
    updated_at: new Date().toISOString()
  });
  logger.warn(`>>> [RECNO] Possível duplicidade registrada: ${describeRecnoCollision(collision)}`);
  return true;
};

export interface RecnoReport {
  collisions: RecnoCollision[];
  /** Entradas novas gravadas em `audit_logs` (as já registadas não repetem). */
  logged: number;
}

/** Percorre a base, devolve os casos e audita os que ainda não estavam registados. */
export async function reportRecnoCollisions(source: RecnoGuardSource): Promise<RecnoReport> {
  invalidateRecnoGuardIndex();
  const collisions = await previewRecnoCollisions();
  let logged = 0;
  for (const collision of collisions) {
    if (await logCollision(collision, source)) logged += 1;
  }
  invalidateRecnoGuardIndex();
  return { collisions, logged };
}

/**
 * Verificação de UM ativo (conferência de campo): compara com a base e, se o
 * recno repetir com dados diferentes, devolve os conflitos e audita.
 */
export async function reportRecnoConflictForAsset(
  asset: RecnoCandidate,
  source: RecnoGuardSource = 'CONFERENCIA'
): Promise<RecnoReport> {
  const conflicts = await findRecnoConflictsForAsset(asset);
  if (conflicts.length === 0) return { collisions: [], logged: 0 };

  const group = [asset, ...conflicts];
  const collision: RecnoCollision = {
    key: recnoKeyOf(asset),
    tenantid: String(asset.tenantid ?? '').trim().toUpperCase(),
    filial: String(asset.filial_raw || asset.filial || '').trim(),
    recno: Number(asset.sn1_recno),
    rows: group.map((row): RecnoRowSummary => summarizeRecnoRow(row)),
    signature: group
      .map(summarizeRecnoRow)
      .map((row) => `${row.etiqueta}~${row.valor.toFixed(2)}~${row.descricao}`)
      .sort()
      .join('||')
  };

  const logged = (await logCollision(collision, source)) ? 1 : 0;
  return { collisions: [collision], logged };
}

/** Linhas de relatório para o log do Gestor de Base. */
export function formatRecnoReport(report: RecnoReport): string[] {
  if (report.collisions.length === 0) {
    return ['[RECNO] Nenhuma duplicidade por tenantid + filial + sn1_recno na base local.'];
  }
  const lines = [
    `[RECNO] ${report.collisions.length} caso(s) de possível duplicidade · ${report.logged} novo(s) em audit_logs`
  ];
  report.collisions.slice(0, 20).forEach((collision) => lines.push(describeRecnoCollision(collision)));
  return lines;
}
