// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DATABASE_MODE_KEY,
  migrateDatabaseModeFromSnapshot,
  readStoredDatabaseMode,
  writeStoredDatabaseMode
} from '../utils/databaseModeStore';
import { DatabaseMode } from '../types';

/**
 * `databaseMode` é escopo de dispositivo, mas NÃO vive no fieldPreferences:
 * a fonte única é `app_database_mode`. A migração só corre quando o aparelho
 * ainda não tem modo gravado; e nunca cria uma segunda cópia da preferência.
 */
describe('migração do modo de base a partir do snapshot', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('adopta o modo do snapshot quando o aparelho não tem nenhum gravado', () => {
    const adopted = migrateDatabaseModeFromSnapshot({ databaseMode: DatabaseMode.INTERNAL });

    expect(adopted).toBe(DatabaseMode.INTERNAL);
    expect(readStoredDatabaseMode()).toBe(DatabaseMode.INTERNAL);
    expect(localStorage.getItem(DATABASE_MODE_KEY)).toBe(DatabaseMode.INTERNAL);
  });

  it('não sobrepõe o modo já definido neste aparelho', () => {
    writeStoredDatabaseMode(DatabaseMode.SUPABASE);

    const adopted = migrateDatabaseModeFromSnapshot({ databaseMode: DatabaseMode.INTERNAL });

    expect(adopted).toBeNull();
    expect(readStoredDatabaseMode()).toBe(DatabaseMode.SUPABASE);
  });

  it('ignora valores inválidos vindos do snapshot', () => {
    const adopted = migrateDatabaseModeFromSnapshot({
      databaseMode: 'DISQUETE' as unknown as DatabaseMode
    });

    expect(adopted).toBeNull();
    expect(readStoredDatabaseMode()).toBeNull();
    expect(localStorage.getItem(DATABASE_MODE_KEY)).toBeNull();
  });

  it('sem snapshot ou sem modo no snapshot, não faz nada', () => {
    expect(migrateDatabaseModeFromSnapshot(null)).toBeNull();
    expect(migrateDatabaseModeFromSnapshot(undefined)).toBeNull();
    expect(migrateDatabaseModeFromSnapshot({})).toBeNull();
    expect(localStorage.getItem(DATABASE_MODE_KEY)).toBeNull();
  });

  it('não grava a preferência noutra chave (sem duplicar no fieldPreferences)', () => {
    migrateDatabaseModeFromSnapshot({ databaseMode: DatabaseMode.INTERNAL_PLUS });

    const appKeys = Object.keys(localStorage).filter((key) => key.startsWith('app_'));
    expect(appKeys).toEqual([DATABASE_MODE_KEY]);
  });

  it('valor corrompido no storage conta como "sem modo" e permite migrar', () => {
    localStorage.setItem(DATABASE_MODE_KEY, 'LIXO');

    expect(readStoredDatabaseMode()).toBeNull();
    expect(migrateDatabaseModeFromSnapshot({ databaseMode: DatabaseMode.SUPABASE })).toBe(
      DatabaseMode.SUPABASE
    );
    expect(readStoredDatabaseMode()).toBe(DatabaseMode.SUPABASE);
  });
});
