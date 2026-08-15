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
 * Etapa 5a (FLUXO_ACESSO_INICIAL) — resolve o filtro de unidade da CARGA
 * INICIAL (Boot Loader / auto-login) quando o perfil não fixa uma filial real.
 *
 * Prioridade:
 * 1. Filial real do perfil (auditor de campo) → resolveUnitFilter (Etapa 2).
 * 2. Perfil TODAS/sem filial (dono/admin): usa a filial da ÚLTIMA ESCOLHA
 *    (app_last_work_context, Etapa 4) quando ela pertence ao MESMO contrato
 *    do usuário — a carga inicial baixa SÓ a filial escolhida (ex.: 010201
 *    SNACKS PA = 2.066 em vez dos 12.636 do contrato inteiro).
 * 3. Caso contrário → undefined (contrato inteiro, comportamento atual).
 *
 * Muro SRE preservado: filial de outro contrato jamais é usada; sentinelas
 * (vazia/TODAS/NULL/UNDEFINED) caem no passo 3.
 */
export function resolveBootUnitFilter(
  filial?: string | null,
  lastCtx?: { tenantid?: string; filial?: string } | null,
  tenantid?: string | null
): string | undefined {
  const profile = resolveUnitFilter(filial);
  if (profile) return profile;

  if (!lastCtx) return undefined;
  const lastTenant = String(lastCtx.tenantid || '').trim().toUpperCase();
  const lastFilial = String(lastCtx.filial || '').trim().toUpperCase();
  if (!lastTenant || !lastFilial) return undefined;

  const userTenant = String(tenantid || '').trim().toUpperCase();
  if (userTenant && lastTenant !== userTenant) return undefined;

  return resolveUnitFilter(lastFilial);
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
