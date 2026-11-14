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
 * Remove chaves de CONFIGURAÇÃO sem contrato que duplicam uma unidade já
 * identificada com contrato pelos ativos.
 *
 * `unit_configs` pode ter linhas legadas/gravadas sem `tenantid`. Elas criavam
 * uma SEGUNDA unidade da mesma filial ("SEM CONTRATO") na Unidade Operacional,
 * e o mesmo ativo era somado nos dois cartões (12.636 viravam 25.272).
 * A configuração sem contrato só vira unidade própria quando NENHUM ativo
 * daquela filial define o contrato.
 */
export function filterPhantomConfigKeys(assetKeys: string[], configKeys: string[]): string[] {
  const filiaisComContrato = new Set(
    assetKeys
      .map(k => splitUnitContextKey(k))
      .filter(u => u.tenantid !== '')
      .map(u => u.filial)
  );
  return configKeys.filter(k => {
    const u = splitUnitContextKey(k);
    return u.tenantid !== '' || !filiaisComContrato.has(u.filial);
  });
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
 * 3. Caso contrário → undefined. NÃO significa "baixar o contrato inteiro":
 *    o chamador (boot) usa `resolveBootPullPlan` e exige a escolha da filial.
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
 * Escopo da lista de filiais em memória: utilizador + contrato.
 *
 * A lista carrega o escopo em que nasceu e só é usada quando o escopo atual é
 * igual — é isto que impede as filiais de um contrato de aparecerem depois de
 * sair e entrar outra conta no mesmo aparelho.
 */
export function unitListScope(email?: string | null, tenantid?: string | null): string {
  return `${String(email || '').trim().toLowerCase()}|${String(tenantid || '').trim().toUpperCase()}`;
}

/** Ação a tomar sobre a lista de filiais guardada em memória. */
export type UnitListAction =
  | { type: 'clear' }
  | { type: 'idle' }
  | { type: 'fetch'; tenant: string };

export interface UnitListInput {
  /** Escopo em que a lista guardada nasceu (`null` = nada guardado). */
  storedScope: string | null;
  /** Escopo atual — `unitListScope(email, tenantid)`. */
  scope: string;
  tenantid?: string | null;
  /** Base interna (sqlite): a lista vem dos dados locais, não da nuvem. */
  isLocalDatabase: boolean;
  online: boolean;
  /** Já há base local (SQL ou ativos): a lista da nuvem não faz falta. */
  hasLocalBase: boolean;
}

/**
 * Decide o que fazer com a lista de filiais da nuvem a cada mudança de estado.
 * Vive fora do `App` para poder ser testada: a troca de utilizador e de
 * contrato no mesmo aparelho não pode deixar filiais do contrato anterior.
 */
export function decideUnitListAction(input: UnitListInput): UnitListAction {
  // 1. Lista de outra conta/contrato (ou de antes do logout): descartar.
  if (input.storedScope !== null && input.storedScope !== input.scope) {
    return { type: 'clear' };
  }

  const tenant = String(input.tenantid || '').trim().toUpperCase();
  // 2. Muro SRE: sem contrato resolvido não se lista nada.
  if (!tenant) return { type: 'idle' };
  // 3. Sem rede, em base interna ou com base local já carregada: não buscar.
  if (!input.online || input.isLocalDatabase || input.hasLocalBase) return { type: 'idle' };
  // 4. A lista deste escopo já está em memória.
  if (input.storedScope !== null) return { type: 'idle' };

  return { type: 'fetch', tenant };
}

/** Sentinelas que nunca são filial. */
const UNIT_SENTINELS = new Set(['', 'TODAS', 'NULL', 'UNDEFINED', '0', 'DEFAULT', 'SEM FILIAL']);

/**
 * Normaliza a lista de filiais (vem da nuvem quando o aparelho ainda não tem
 * base local): trim + UPPER, descarta sentinelas, remove duplicados e ordena.
 */
export function normalizeUnitNames(
  rows: ReadonlyArray<string | { filial?: string | null } | null | undefined>
): string[] {
  const nomes = new Set<string>();
  for (const row of rows) {
    const bruto = typeof row === 'string' ? row : row?.filial;
    const nome = String(bruto ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (UNIT_SENTINELS.has(nome)) continue;
    nomes.add(nome);
  }
  return Array.from(nomes).sort((a, b) => a.localeCompare(b));
}

/**
 * Plano da CARGA INICIAL (Boot Loader): decide se há uma filial para baixar.
 *
 * O boot nunca baixa o contrato inteiro — 12.636 ativos num único pull, com
 * todos marcados como sincronizados. Sem filial no perfil e sem última escolha
 * válida, o plano manda **parar e pedir a filial** (`requiresUnitSelection`),
 * e o chamador abre a tela de seleção antes de qualquer download.
 */
export interface BootPullPlan {
  /** Filial a baixar; ausente = não fazer pull nenhum. */
  unit?: string;
  /** true = exigir a escolha da filial antes da carga. */
  requiresUnitSelection: boolean;
}

export function resolveBootPullPlan(
  filial?: string | null,
  lastCtx?: { tenantid?: string; filial?: string } | null,
  tenantid?: string | null
): BootPullPlan {
  const unit = resolveBootUnitFilter(filial, lastCtx, tenantid);
  return unit ? { unit, requiresUnitSelection: false } : { requiresUnitSelection: true };
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
