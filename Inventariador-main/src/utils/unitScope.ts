// ============================================================================
// unitScope — escopo de unidades do perfil (regra ÚNICA)
// ----------------------------------------------------------------------------
// O perfil de auditoria pode ser contratado para uma ou várias filiais. Essa
// lista é o escopo dele: o que ele vê e o que ele pode abrir.
//
// Regra de produto: nuvem e BASE LOCAL têm de se comportar IGUAL. Antes esta
// checagem existia apenas no modo nuvem (`fullCompaniesWithStatus`) e o modo
// local listava todas as filiais da base, entregando ao auditor unidades que
// não são dele. Este módulo centraliza a decisão para os dois modos.
//
// Somente leitura: não altera perfil, não cria vínculo.
// ============================================================================

import { normalizeKey } from './schema';

export interface UnitScopeUser {
  role?: string | null;
  isAdmin?: boolean;
  is_admin?: boolean;
  units?: string[] | null;
  unitid?: string | null;
  filial?: string | null;
  tenantid?: string | null;
  email?: string | null;
}

/** Perfis sujeitos ao escopo de unidades. Admin/Gestor operam o contrato inteiro. */
const AUDITOR_ROLES = new Set(['AUDITOR', 'AUXILIARY_AUDITOR']);

export function isAuditorScope(user: UnitScopeUser | null | undefined): boolean {
  return AUDITOR_ROLES.has(String(user?.role || '').toUpperCase().trim());
}

/**
 * Chaves normalizadas das unidades autorizadas ao perfil.
 * Lista vazia = perfil sem trava explícita (acesso ao contrato inteiro).
 * Espelha a regra histórica do modo nuvem: `user.units` e, na ausência dele,
 * o contrato do perfil (que nunca casa com nome de filial e por isso trava).
 */
export function getUnitScopeKeys(
  user: UnitScopeUser | null | undefined,
  tenantid?: string | null
): string[] {
  if (!isAuditorScope(user)) return [];
  const listed = Array.isArray(user?.units) ? user.units : [];
  const declared = listed.length > 0 ? listed : (tenantid ? [tenantid] : []);
  return Array.from(new Set(declared.map((u) => normalizeKey(u)).filter(Boolean)));
}

/**
 * A filial está dentro do escopo do perfil? Vale igual na nuvem e na base local.
 * - perfil não-auditor → sempre liberado;
 * - auditor sem unidade declarada → sem trava explícita, liberado;
 * - auditor com unidades → somente as unidades dele.
 */
export function isUnitInScope(
  user: UnitScopeUser | null | undefined,
  filial: string | null | undefined,
  tenantid?: string | null
): boolean {
  const keys = getUnitScopeKeys(user, tenantid);
  if (keys.length === 0) return true;
  return keys.includes(normalizeKey(filial));
}
