/**
 * Deduplicação de pull do inventário (Etapa 1 do FLUXO_ACESSO_INICIAL).
 *
 * O Boot Loader baixa o inventário completo do contrato antes de dispensar o
 * splash; em seguida o auto-login (processSession/onLogin) dispara syncFromCloud
 * que repete o MESMO pull paginado. Este módulo registra que o pull já foi
 * realizado nesta sessão para um [tenantid+unidade] e permite pular o segundo.
 *
 * Regras SRE preservadas:
 * - A dedup é por sessão (sessionStorage) e expira (maxAgeMs) — nunca bloqueia
 *   uma atualização real da nuvem por mais de alguns minutos.
 * - O pulo SÓ acontece se a base local já tem dados (hasLocalData) — se a base
 *   foi higienizada/limpa, o pull volta a ocorrer.
 * - Um pull do contrato inteiro cobre as filiais dele (Etapa 4: reentrada
 *   offline instantânea com a última filial escolhida); filial não cobre
 *   contrato nem outras filiais.
 */
const STORAGE_KEY = 'gbr_sync_pull_done';

export interface PullDedupRecord {
  /** Chave composta [tenantid|unidade] do último pull completo. */
  key: string;
  /** Timestamp (ms) do pull. */
  ts: number;
}

/** Chave canônica de dedup — [tenantid|unidade], maiúscula e sem espaços soltos. */
export function pullDedupKey(tenantid?: string | null, unitId?: string | null): string {
  return `${String(tenantid || '').toUpperCase().trim()}|${String(unitId || '').toUpperCase().trim()}`;
}

/** Lê o registro de pull concluído (ou null se ausente/corrompido). */
export function readPullDedup(): PullDedupRecord | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PullDedupRecord;
    if (!parsed || typeof parsed.key !== 'string' || typeof parsed.ts !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Registra que o pull completo de [tenantid+unidade] foi realizado. */
export function markPullCompleted(tenantid?: string | null, unitId?: string | null): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      key: pullDedupKey(tenantid, unitId),
      ts: Date.now()
    } satisfies PullDedupRecord));
  } catch {
    // Storage indisponível (SSR/privado) — dedup é best-effort, nunca bloqueia.
  }
}

/** Limpa o registro (ex.: ao higienizar a base local). */
export function clearPullDedup(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

/**
 * Indica se o pull já foi concluído nesta sessão para o mesmo [tenantid+unidade],
 * dentro da janela maxAgeMs.
 *
 * Regra de cobertura (Etapa 4 do FLUXO_ACESSO_INICIAL): um pull do CONTRATO
 * inteiro (unidade vazia — chave `tenantid|`) cobre qualquer filial daquele
 * contrato, pois os dados da filial já vieram no pull. O inverso NÃO vale:
 * pull de uma filial não cobre o contrato nem outras filiais (muro multi-tenant
 * e muro por unidade preservados).
 */
export function wasPullCompleted(tenantid?: string | null, unitId?: string | null, maxAgeMs = 10 * 60 * 1000): boolean {
  const rec = readPullDedup();
  if (!rec) return false;
  const wanted = pullDedupKey(tenantid, unitId);
  const contractKey = pullDedupKey(tenantid, null);
  if (rec.key !== wanted && rec.key !== contractKey) return false;
  return Date.now() - rec.ts <= maxAgeMs;
}

/**
 * Decisão de pular o pull: só quando o pull já foi feito E a base local tem
 * dados. Se a base foi limpa (higienização), o pull volta a ocorrer mesmo com
 * o registro presente.
 */
export function shouldSkipPull(alreadyPulled: boolean, hasLocalData: boolean): boolean {
  return alreadyPulled && hasLocalData;
}

/**
 * A base local TEM dados para o sync — em memória (inventory) OU persistidos
 * de sessão anterior (`isDatabaseLoaded` no localStorage, que a higienização
 * física remove).
 *
 * Sem este fallback, o auto-aplicar (Etapa 4 do FLUXO_ACESSO_INICIAL) que
 * dispara ANTES de o boot terminar o loadInventory vê `hasLocalData=false` e
 * refaz um pull COMPLETO em vez do delta (Etapa 5b) — o bug de timing do boot.
 */
export function hasLocalBaseData(inMemoryCount: number): boolean {
  if (inMemoryCount > 0) return true;
  try {
    return localStorage.getItem('isDatabaseLoaded') === 'true';
  } catch {
    return false;
  }
}
