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
//      cobre o caso offline-first de múltiplos registros por login.
//   5. `availableFiliais` (filiais reais encontradas na base local por tenant,
//      ex.: CICOPAL com 6 filiais) — quando o perfil NÃO declara units/filial,
//      as filiais da base do contrato viram os contextos do seletor.
// ============================================================================

import type { User } from '../types';

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
      ].map((x) => String(x || '').trim()).filter(Boolean);
      if (us.length) us.forEach((f) => add(t, f));
      else add(t, '');
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
