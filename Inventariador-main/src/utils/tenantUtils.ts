// ============================================================================
// tenantUtils — Termo canônico único: `tenantid` (minúsculo)
// ----------------------------------------------------------------------------
// Leitura retroativa SEM PERDA: dados persistidos por versões antigas podem
// carregar as chaves legadas `tenantId`, `_tenantid` ou `tenant_id`. Todo ponto
// de entrada de dados (restore de sessão, login, perfil Supabase, importação
// de backup, usuários locais) deve normalizar para `tenantid` via estes
// helpers. Depois da normalização, o restante do código lê apenas `tenantid`.
// ============================================================================

type AnyRecord = Record<string, unknown>;

// Chaves legadas aceitas como fallback (ordem de prioridade).
// `tenants` (array plural) também é lido: dados persistidos por versões
// antigas podem carregá-lo; o resolveTenantId usa o primeiro elemento.
const LEGACY_TENANT_KEYS = ['tenantId', '_tenantid', 'tenant_id', 'TenantId', 'tenants'] as const;

/** Lê a primeira chave legada presente no objeto (excluindo o canônico). */
function readLegacyTenant(value: AnyRecord): unknown {
  for (const key of LEGACY_TENANT_KEYS) {
    const v = value[key];
    if (v != null && v !== '') return v;
  }
  return '';
}

/**
 * Extrai o `tenantid` canônico de qualquer objeto (User, perfil, asset,
 * registro persistido), lendo o campo canônico primeiro e as chaves legadas
 * como fallback. Aceita valor escalar ou array (usa o primeiro elemento).
 */
export function resolveTenantId(value: object | null | undefined): string {
  if (!value) return '';
  const rec = value as AnyRecord;
  const raw: unknown = rec.tenantid ?? readLegacyTenant(rec);
  const v = Array.isArray(raw) ? (raw.length ? raw[0] : '') : raw;
  return v == null ? '' : String(v);
}

/**
 * Retorna uma cópia do objeto com a propriedade canônica `tenantid` garantida
 * (preenchida a partir do canônico ou das chaves legadas). Não muta o original.
 */
export function normalizeUser<T extends object>(user: T): T & { tenantid: string } {
  return { ...user, tenantid: resolveTenantId(user) } as T & { tenantid: string };
}

/**
 * Lê a chave de sessão do tenant com fallback retroativo para a chave antiga
 * `'tenantId'` — permite que sessões criadas por versões anteriores continuem
 * funcionando sem reautenticação.
 */
export function readSessionTenantId(): string {
  return sessionStorage.getItem('tenantid') || sessionStorage.getItem('tenantId') || '';
}

/** Mesma leitura retroativa para localStorage. */
export function readLocalTenantId(): string {
  return localStorage.getItem('tenantid') || localStorage.getItem('tenantId') || '';
}

/**
 * Limpa o contexto de trabalho (contrato/filial/unidade) do sessionStorage e
 * localStorage. Usado no LOGOUT: o próximo login NUNCA deve herdar o contrato
 * de uma sessão anterior (bug clássico: dono global logava como CLIENTETESTE
 * por causa do tenantid velho deixado no storage após purga/troca de sessão).
 */
export function clearTenantContext(): void {
  const keys = [
    'tenantid', 'tenantId', 'filial', 'unitid',
    'selectedUnit', 'app_selected_unit', 'app_last_tenant'
  ];
  keys.forEach((k) => {
    try {
      sessionStorage.removeItem(k);
      localStorage.removeItem(k);
    } catch { /* storage indisponível — ignora */ }
  });
}
