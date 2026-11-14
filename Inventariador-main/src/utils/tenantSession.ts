/**
 * Tenant do contrato activo — leitura pura de sessão/armazenamento.
 *
 * Vive em `utils` (sem importar serviços) para que o `sqliteService`, o
 * `localDbService` e a UI possam partilhar a MESMA regra sem ciclo de imports.
 */
export const getCurrentTenantid = (): string => {
  try {
    const userStr = sessionStorage.getItem('app_current_user') || localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.tenantid || '';
    }
  } catch { /* ignore */ }
  return '';
};

/**
 * Tenant canónico para uma chave composta `[tenantid+primarykey]`.
 *
 * Com `tenantid` vazio a chave vira `['', primarykey]`, que nunca coincide com
 * a linha gravada: `get`/`update`/`delete` falham em silêncio. Nestes casos usa
 * o tenant da sessão (o contrato activo).
 */
export const resolveTenantKey = (tenantid?: unknown): string => {
  const own = String(tenantid ?? '').trim().toUpperCase();
  return own || getCurrentTenantid().trim().toUpperCase();
};
