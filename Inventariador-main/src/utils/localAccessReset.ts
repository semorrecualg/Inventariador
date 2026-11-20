// ============================================================================
// localAccessReset.ts — «Redefinir Acesso Local» e saídas do Login.
//
// Antes esta limpeza vivia só dentro do `Login.tsx` e não apagava a cópia da
// sessão em `localStorage`: quem saísse por ali voltava a entrar sozinho no
// arranque seguinte. Agora há um único ponto — com os mesmos dados de auditoria
// preservados — e os testes fixam o contrato.
// ============================================================================
import { clearPersistedSession } from './sessionPersistence';

/** Chaves que sobrevivem à redefinição: modo da base e ativos já carregados. */
export const LOCAL_ACCESS_KEEP_KEYS = [
  'app_database_mode',
  'inventory_assets_v24_internal_secure',
  'inventory_assets_v24_supabase_secure'
] as const;

/**
 * Limpa o acesso local: apaga as chaves de sessão/perfil do `localStorage`
 * (preservando base e ativos), esvazia o `sessionStorage` e apaga a cópia com
 * prazo da sessão. Idempotente e tolerante a storage indisponível.
 */
export function resetLocalAccessStorage(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (!LOCAL_ACCESS_KEEP_KEYS.some((keeper) => key.includes(keeper))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage indisponível */
  }

  try {
    sessionStorage.clear();
  } catch {
    /* storage indisponível */
  }

  clearPersistedSession();
}
