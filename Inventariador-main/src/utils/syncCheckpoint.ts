/**
 * Checkpoint de sincronização (Etapa 5b do FLUXO_ACESSO_INICIAL).
 *
 * Persiste, POR [tenantid|filial], o `updated_at` máximo do último pull para
 * que o próximo sync baixe APENAS o delta (registros com updated_at > check-
 * point) em vez do contrato/filial inteiro de novo.
 *
 * Regras SRE preservadas:
 * - O checkpoint é SEMPRE chaveado por [tenantid|filial] — nunca global. Um
 *   contrato nunca é usado como checkpoint de outro (muro multi-tenant).
 * - O checkpoint só AVANÇA (monotônico): um delta que traga timestamps menores
 *   que o já registrado não retrocede a base (evita re-baixar o que já temos).
 * - A chave usa o MESMO formato de `pullDedupKey` (syncDedup.ts): o pull do
 *   contrato inteiro (`tenantid|`) cobre as filiais, filial não cobre contrato.
 * - "Sincronizar tudo" (força pull completo) limpa o checkpoint da chave.
 */

const STORAGE_KEY = 'gbr_sync_checkpoints';

export interface SyncCheckpoint {
  /** Chave composta [tenantid|filial] do último pull. */
  key: string;
  /** updated_at (ISO) máximo visto no último pull — base do próximo delta. */
  lastUpdatedAt: string;
  /** Timestamp ISO em que o checkpoint foi gravado. */
  savedAt: string;
}

/** Chave canônica — [tenantid|filial], maiúscula e sem espaços soltos. */
export function syncCheckpointKey(tenantid?: string | null, unitId?: string | null): string {
  return `${String(tenantid || '').toUpperCase().trim()}|${String(unitId || '').toUpperCase().trim()}`;
}

function readAll(): Record<string, SyncCheckpoint> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SyncCheckpoint>;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, SyncCheckpoint>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage indisponível (SSR/privado) — checkpoint é best-effort, nunca bloqueia.
  }
}

/** Lê o checkpoint de uma chave (null quando ausente/corrompido). */
export function readSyncCheckpoint(key: string): SyncCheckpoint | null {
  const rec = readAll()[key];
  if (!rec || typeof rec.lastUpdatedAt !== 'string' || !rec.lastUpdatedAt) return null;
  return rec;
}

/** Grava (ou substitui) o checkpoint de uma chave. */
export function saveSyncCheckpoint(key: string, lastUpdatedAt: string): void {
  const map = readAll();
  map[key] = { key, lastUpdatedAt, savedAt: new Date().toISOString() };
  writeAll(map);
}

/**
 * AVANÇA o checkpoint de forma monotônica: só substitui quando o novo valor é
 * MAIOR que o existente. Um delta que traga timestamps menores não retrocede.
 */
export function advanceSyncCheckpoint(key: string, lastUpdatedAt: string | undefined): void {
  if (!lastUpdatedAt) return;
  const existing = readSyncCheckpoint(key);
  if (existing && new Date(existing.lastUpdatedAt).getTime() >= new Date(lastUpdatedAt).getTime()) {
    return;
  }
  saveSyncCheckpoint(key, lastUpdatedAt);
}

/** Limpa o checkpoint de uma chave (ex.: "Sincronizar tudo" força pull completo). */
export function clearSyncCheckpoint(key: string): void {
  const map = readAll();
  delete map[key];
  writeAll(map);
}

/** Limpa todos os checkpoints (ex.: higienização física da base local). */
export function clearAllSyncCheckpoints(): void {
  writeAll({});
}

/**
 * Máximo `updated_at` (ISO) entre os ativos — base do próximo checkpoint.
 * Retorna undefined quando nenhum ativo tem updated_at válido.
 */
export function computeMaxUpdatedAt(assets: readonly unknown[]): string | undefined {
  let max = 0;
  for (const raw of assets) {
    const a = (raw || {}) as { updated_at?: unknown };
    const t = new Date(String(a.updated_at || '')).getTime();
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max > 0 ? new Date(max).toISOString() : undefined;
}

export interface DeltaMode {
  /** Filtro `updated_at > since` do pull (undefined = pull completo). */
  since?: string;
  /** true quando o pull é incremental (delta); false = pull completo. */
  incremental: boolean;
}

/**
 * Decide o modo do pull:
 * - forceFull → completo (ignora o checkpoint, sem filtro de tempo);
 * - checkpoint válido → incremental, com since = lastUpdatedAt do checkpoint;
 * - sem checkpoint válido → completo.
 */
export function resolveDeltaMode(
  checkpoint: SyncCheckpoint | null,
  forceFull: boolean
): DeltaMode {
  if (forceFull || !checkpoint || !checkpoint.lastUpdatedAt) {
    return { since: undefined, incremental: false };
  }
  return { since: checkpoint.lastUpdatedAt, incremental: true };
}
