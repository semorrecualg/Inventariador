import { matchUnitKeys } from './schema';

/**
 * Utilitários do muro multi-tenant para Unidades Operacionais.
 * Uma unidade é identificada pela chave composta [tenantid+filial] — dois
 * contratos podem ter a mesma filial (ex.: "010201 SNACKS PA" no CICOPAL e no
 * CLIENTETESTE) e devem ser tratados como unidades DISTINTAS.
 */

export const UNIT_SEPARATOR = '|';

/** Chave composta canônica `TENANT|FILIAL` (ambos em UPPER/trim). */
export function unitContextKey(tenantid: string, filial: string): string {
  return `${(tenantid || '').trim().toUpperCase()}${UNIT_SEPARATOR}${(filial || '').trim().toUpperCase()}`;
}

/** Inverte a chave composta em { tenantid, filial }. */
export function splitUnitContextKey(key: string): { tenantid: string; filial: string } {
  const idx = key.indexOf(UNIT_SEPARATOR);
  if (idx === -1) return { tenantid: '', filial: key };
  return { tenantid: key.slice(0, idx), filial: key.slice(idx + 1) };
}

/**
 * Casa duas unidades exigindo o MESMO tenant quando ambos os lados o definem.
 * Quando um dos lados não tem tenant (dado legado/sem contrato), cai na
 * tolerância por nome via matchUnitKeys (comportamento legado preservado).
 */
export function matchTenantUnit(
  tA: string, uA: string,
  tB: string, uB: string
): boolean {
  const nA = (tA || '').toUpperCase().trim();
  const nB = (tB || '').toUpperCase().trim();
  // O muro separa apenas quando os DOIS lados têm contrato definido:
  // tenants diferentes nunca casam. Dado legado sem contrato (tenant vazio)
  // cai na tolerância por nome (comportamento legado preservado).
  if (nA && nB) {
    if (nA !== nB) return false;
  }
  return matchUnitKeys(uA, uB);
}

/**
 * Resolve o filtro de unidade (filial) para os pulls do fluxo inicial
 * (Etapa 2 do FLUXO_ACESSO_INICIAL).
 *
 * Retorna a filial em UPPER/trim quando o perfil define UMA filial real
 * (ex.: auditor de campo com filial no perfil) → o fetch baixa SÓ essa filial.
 * Retorna undefined quando não há filial definida (admin/multi-filial) →
 * o fetch baixa o contrato inteiro. Sentinelas TODAS/NULL/UNDEFINED são
 * descartadas (significam "sem filtro").
 */
export function resolveUnitFilter(filial?: string | null): string | undefined {
  const f = String(filial || '').trim().toUpperCase();
  if (!f || f === 'TODAS' || f === 'NULL' || f === 'UNDEFINED') return undefined;
  return f;
}

/**
 * Retorna o conjunto de nomes de filial que aparecem em MAIS DE UM tenant
 * (homônimos entre contratos) — esses devem exibir o badge do contrato na UI.
 */
export function findHomonymUnits(units: Array<{ filial?: string; tenantid?: string }>): Set<string> {
  const byName = new Map<string, Set<string>>();
  units.forEach(u => {
    const name = (u.filial || '').toUpperCase().trim();
    if (!name) return;
    const t = (u.tenantid || '').toUpperCase().trim() || '(SEM CONTRATO)';
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name)!.add(t);
  });
  const out = new Set<string>();
  byName.forEach((tenants, name) => {
    if (tenants.size > 1) out.add(name);
  });
  return out;
}
