// ============================================================================
// databaseModeStore — modo de base DESTE aparelho
// ----------------------------------------------------------------------------
// `databaseMode` pertence ao escopo de dispositivo (utils/configScope), mas NÃO
// é guardado no `fieldPreferences`: o modo tem ciclo de vida próprio e vive em
// `app_database_mode`. Este módulo é o único lugar que lê/escreve essa chave
// para fins de migração, com validação — assim não há casts soltos nem duas
// cópias da preferência.
// ============================================================================

import { DatabaseMode, InventoryState } from '../types';

export const DATABASE_MODE_KEY = 'app_database_mode';

const VALID_MODES: ReadonlySet<string> = new Set(Object.values(DatabaseMode));

const isDatabaseMode = (value: unknown): value is DatabaseMode =>
  typeof value === 'string' && VALID_MODES.has(value);

/** Modo gravado neste aparelho, ou `null` quando nunca foi definido. */
export function readStoredDatabaseMode(): DatabaseMode | null {
  try {
    const raw = localStorage.getItem(DATABASE_MODE_KEY);
    return isDatabaseMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredDatabaseMode(mode: DatabaseMode): void {
  try {
    localStorage.setItem(DATABASE_MODE_KEY, mode);
  } catch {
    /* storage indisponível: modo fica o da sessão */
  }
}

/**
 * Migração do modo a partir de um snapshot antigo (o campo deixou de viajar).
 * Só age quando o aparelho ainda não tem modo gravado; devolve o modo adoptado
 * ou `null` quando não havia nada a migrar.
 */
export function migrateDatabaseModeFromSnapshot(
  snapshot: Partial<InventoryState> | null | undefined
): DatabaseMode | null {
  if (!snapshot) return null;
  if (readStoredDatabaseMode() !== null) return null;
  if (!isDatabaseMode(snapshot.databaseMode)) return null;

  writeStoredDatabaseMode(snapshot.databaseMode);
  return snapshot.databaseMode;
}
