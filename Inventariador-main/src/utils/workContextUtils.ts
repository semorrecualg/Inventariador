// ============================================================================
// workContextUtils — Contextos de Trabalho (Contrato + Filial) pós-login
// ----------------------------------------------------------------------------
// Um usuário pode estar autorizado em mais de um contrato (tenantid) e suas
// filiais. Após o login, o app calcula a lista de "contextos de trabalho"
// (pares tenantid + filial) e — quando há mais de um — força o usuário a
// escolher com qual contrato/filial vai operar, carregando APENAS os dados
// daquele contrato (isolamento SRE).
//
// Fontes de autorização (em ordem):
//   1. `user.units` / `user.filial` — filiais autorizadas; cada uma vira um
//      contexto no tenant do usuário.
//   2. Unidades compostas no formato "TENANTID::FILIAL" (ou "|" / ";") —
//      permitem declarar filiais de OUTROS contratos no mesmo perfil.
//   3. `tenantid` multi-valor por vírgula — "CICOPAL,CLIENTETESTE".
//   4. `extraUsers` (registros locais) com o MESMO e-mail e outro tenant —
//      cobre o caso offline-first de múltiplos registros por login. Quando o
//      contrato tem filiais REAIS na base local, elas definem o escopo do
//      seletor: filiais obsoletas do registro (ex.: 'MATRIZ' de sessão antiga)
//      são descartadas, preservando a autorização explícita (filial na base).
//   5. `availableFiliais` (filiais reais encontradas na base local por tenant,
//      ex.: CICOPAL com 6 filiais) — quando o perfil NÃO declara units/filial,
//      as filiais da base do contrato viram os contextos do seletor.
// ============================================================================

import type { User } from '../types';
import { AppModule } from '../types';

export interface WorkContext {
  tenantid: string;
  filial: string;
}

const UNIT_SEPARATORS = ['::', '|', ';'] as const;

/** Normaliza o tenantid para o formato canônico (uppercase, sem espaços). */
export function normalizeWorkTenant(value: string): string {
  return String(value || '').trim().toUpperCase();
}

/** Normaliza a filial para comparação/exibição (uppercase, sem espaços). */
export function normalizeWorkFilial(value: string): string {
  return String(value || '').trim().toUpperCase();
}

/** Chave canônica de um contexto (dedup). */
export function workContextKey(ctx: WorkContext): string {
  return `${normalizeWorkTenant(ctx.tenantid)}::${normalizeWorkFilial(ctx.filial)}`;
}

/** Valores de sentinela que nunca representam um contrato/filial real. */
function isInvalidTenant(t: string): boolean {
  const v = normalizeWorkTenant(t);
  return !v || v === 'NULL' || v === 'UNDEFINED' || v === 'GBR_SUPER_ADMIN_CORINGA';
}

function isInvalidFilial(f: string): boolean {
  const v = normalizeWorkFilial(f);
  return !v || v === 'NULL' || v === 'UNDEFINED' || v === 'TODAS' || v === 'DEFAULT' || v === '0';
}

/** Extrai a lista de tenants de um tenantid possivelmente multi-valor. */
export function splitTenantList(tenantid: string): string[] {
  return String(tenantid || '')
    .split(',')
    .map(normalizeWorkTenant)
    .filter((t) => !isInvalidTenant(t));
}

/**
 * Monta a lista de contextos de trabalho autorizados para o usuário.
 * Retorna vazio quando não há nenhum contrato resolvível (ex.: admin global).
 */
export function buildWorkContexts(
  user: User | null | undefined,
  extraUsers?: User[],
  availableFiliais?: Record<string, string[]>
): WorkContext[] {
  if (!user) return [];
  const out = new Map<string, WorkContext>();

  const add = (tenantid: string, filial: string) => {
    const t = normalizeWorkTenant(tenantid);
    if (isInvalidTenant(t)) return;
    const f = normalizeWorkFilial(filial);
    // Filial vazia é permitida (contexto "só contrato"); sentinelas não.
    if (f && isInvalidFilial(f)) return;
    out.set(workContextKey({ tenantid: t, filial: f }), { tenantid: t, filial: f });
  };

  const userTenants = splitTenantList(user.tenantid);

  // 1. Unidades do perfil (units/filial/legados) — compostas ou puras
  const units = [
    ...(Array.isArray(user.units) ? user.units : []),
    ...(user.filial ? [user.filial] : []),
    ...(user.unitid ? [user.unitid] : []),
    ...(user._unitid ? [user._unitid] : []),
  ];

  for (const raw of units) {
    const s = String(raw || '').trim();
    if (!s) continue;

    const sep = UNIT_SEPARATORS.find((sp) => s.includes(sp));
    if (sep) {
      const [t, f] = s.split(sep).map((x) => x.trim());
      if (t && f) {
        add(t, f);
        continue;
      }
    }

    // Filial pura → associa a cada tenant declarado (ou ao tenant único)
    const ts = userTenants.length ? userTenants : [normalizeWorkTenant(user.tenantid)];
    for (const t of ts) {
      if (t && normalizeWorkFilial(s) !== t) add(t, s);
    }
  }

  // 2. Registros locais com o mesmo e-mail (multi-contrato offline-first)
  if (Array.isArray(extraUsers)) {
    const email = String(user.email || '').toLowerCase().trim();
    for (const u of extraUsers) {
      if (!u || !u.email) continue;
      if (String(u.email).toLowerCase().trim() !== email) continue;
      const t = normalizeWorkTenant(u.tenantid);
      if (isInvalidTenant(t)) continue;
      const us = [
        ...(Array.isArray(u.units) ? u.units : []),
        ...(u.filial ? [u.filial] : []),
        ...(u.unitid ? [u.unitid] : []),
        ...(u._unitid ? [u._unitid] : []),
      ].map(normalizeWorkFilial).filter((f) => f && !isInvalidFilial(f));

      // Sanitização SRE: quando o contrato tem filiais REAIS na base local
      // (availableFiliais), elas definem o escopo do seletor — um registro
      // local com filial obsoleta (ex.: 'MATRIZ' de sessão antiga/demo) não
      // pode sequestrar a lista. A autorização explícita (filial declarada
      // que EXISTE na base) continua valendo; só o lixo é descartado.
      const realFiliais = ((availableFiliais && availableFiliais[t]) || [])
        .map(normalizeWorkFilial)
        .filter((f) => f && f !== t && !isInvalidFilial(f));

      if (realFiliais.length) {
        const real = new Set(realFiliais);
        const kept = us.filter((f) => real.has(f));
        (kept.length ? kept : realFiliais).forEach((f) => add(t, f));
      } else {
        if (us.length) us.forEach((f) => add(t, f));
        else add(t, '');
      }
    }
  }

  // 3. Fallback: sem filial declarada no perfil
  if (out.size === 0) {
    const ts = userTenants.length ? userTenants : [normalizeWorkTenant(user.tenantid)];
    for (const t of ts) {
      if (isInvalidTenant(t)) continue;
      // 3a. Filiais reais da base local do contrato (ex.: CICOPAL com 6 filiais)
      const fromBase = (availableFiliais && availableFiliais[t]) || [];
      const real = fromBase.map(normalizeWorkFilial).filter((f) => f && f !== t && !isInvalidFilial(f));
      if (real.length) {
        real.forEach((f) => add(t, f));
      } else {
        // 3b. Sem filial conhecida → contexto somente de contrato
        add(t, '');
      }
    }
  }

  return Array.from(out.values());
}

// ============================================================================
// "Lembrar escolha" (Etapa 4 do FLUXO_ACESSO_INICIAL): persiste a última
// combinação contrato + filial + módulo escolhida pelo usuário para que a
// reentrada (mesmo offline) pule o seletor de contexto e vá direto ao módulo
// da filial — com o botão "Trocar filial/contrato" disponível no hub.
// ============================================================================

const LAST_CONTEXT_KEY = 'app_last_work_context';

export interface LastWorkContext {
  tenantid: string;
  filial: string;
  module: AppModule;
  savedAt: string;
}

/** Persiste a última escolha de contexto + módulo (localStorage). */
export function persistLastWorkContext(ctx: WorkContext, module: AppModule): void {
  try {
    localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify({
      tenantid: normalizeWorkTenant(ctx.tenantid),
      filial: normalizeWorkFilial(ctx.filial),
      module,
      savedAt: new Date().toISOString()
    } satisfies LastWorkContext));
  } catch (err) {
    console.warn('[workContext] Falha ao persistir última escolha:', err);
  }
}

/** Lê a última escolha persistida (null quando nunca houve ou está corrompida). */
export function readLastWorkContext(): LastWorkContext | null {
  try {
    const raw = localStorage.getItem(LAST_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastWorkContext>;
    if (!parsed || !parsed.tenantid || !parsed.module) return null;
    return {
      tenantid: normalizeWorkTenant(parsed.tenantid),
      filial: normalizeWorkFilial(parsed.filial || ''),
      module: parsed.module,
      savedAt: parsed.savedAt || ''
    };
  } catch {
    return null;
  }
}

/** Limpa a última escolha (ex.: ao trocar de contrato pelo seletor). */
export function clearLastWorkContext(): void {
  try {
    localStorage.removeItem(LAST_CONTEXT_KEY);
  } catch {
    // noop
  }
}

/**
 * Valida a última escolha contra a autorização atual do usuário.
 *
 * Duas regras:
 * 1. Dono/admin SEM unidades declaradas (filial TODAS/vazia): a autorização é
 *    o CONTRATO INTEIRO — a última escolha vale para qualquer filial do próprio
 *    tenantid, independentemente de a base local já ter carregado (Etapa 4:
 *    reentrada instantânea mesmo no primeiro run do roteamento pós-login).
 * 2. Demais usuários (auditores, admins com units): a última escolha precisa
 *    continuar na lista de contextos autorizados (a autorização pode ter
 *    mudado entre sessões).
 *
 * Em ambos os casos, o módulo precisa ser permitido para o papel.
 */
export function isValidLastContext(
  stored: LastWorkContext | null,
  contexts: WorkContext[],
  user?: { role?: string; tenantid?: string; units?: string[]; filial?: string } | null
): boolean {
  if (!stored) return false;
  const roleUpper = String(user?.role || '').toUpperCase();
  if (roleUpper === 'AUDITOR' || roleUpper === 'AUXILIARY_AUDITOR') {
    if (stored.module === AppModule.ASSET_CONTROL) return false;
  }

  // Regra 1 — dono/admin sem unidades declaradas (autorização = contrato todo)
  const hasDeclaredUnits = Array.isArray(user?.units) && user!.units!.length > 0;
  const declaredFilial = normalizeWorkFilial(user?.filial || '');
  const wholeTenantAuth = !hasDeclaredUnits && (!declaredFilial || isInvalidFilial(declaredFilial));
  if (wholeTenantAuth && user?.tenantid && normalizeWorkTenant(user.tenantid) === normalizeWorkTenant(stored.tenantid)) {
    return true;
  }

  // Regra 2 — precisa estar na lista de contextos autorizados
  if (!contexts || contexts.length === 0) return false;
  return contexts.some(c =>
    normalizeWorkTenant(c.tenantid) === normalizeWorkTenant(stored.tenantid) &&
    normalizeWorkFilial(c.filial) === normalizeWorkFilial(stored.filial)
  );
}

/** Persiste o contexto escolhido nas chaves canônicas de sessão/local. */
export function persistWorkContext(ctx: WorkContext): void {
  const t = normalizeWorkTenant(ctx.tenantid);
  const f = normalizeWorkFilial(ctx.filial);
  try {
    sessionStorage.setItem('tenantid', t);
    sessionStorage.setItem('filial', f);
    sessionStorage.setItem('selectedUnit', f);
    sessionStorage.setItem('app_selected_unit', f);
    sessionStorage.setItem('gbr_active_tenant', t);
    localStorage.setItem('tenantid', t);
    localStorage.setItem('filial', f);
    localStorage.setItem('app_selected_unit', f);
    localStorage.setItem('app_current_unit', f);
  } catch (err) {
    // Storage indisponível (sandbox) — não deve derrubar o fluxo
    console.warn('[workContext] Falha ao persistir contexto de trabalho:', err);
  }
}

/** Agrupa os contextos por contrato para renderização em cards. */
export function groupContextsByTenant(contexts: WorkContext[]): Array<{ tenantid: string; filiais: string[] }> {
  const map = new Map<string, string[]>();
  for (const c of contexts) {
    const t = normalizeWorkTenant(c.tenantid);
    if (!t) continue;
    const f = normalizeWorkFilial(c.filial);
    if (!map.has(t)) map.set(t, []);
    const list = map.get(t)!;
    if (f && !list.includes(f)) list.push(f);
  }
  return Array.from(map.entries()).map(([tenantid, filiais]) => ({ tenantid, filiais }));
}
