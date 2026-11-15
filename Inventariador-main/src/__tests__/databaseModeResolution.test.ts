// @vitest-environment jsdom
// ============================================================================
// databaseModeResolution.test.ts — uma regra só para o modo de base.
//
// Sobravam três defaults diferentes (`App.tsx` inventário, `App.tsx` estado e
// `uiStore`) e duas leituras cruas do localStorage (`ModuleSelector`,
// `logAuditEvent`). Agora todos passam por `getDatabaseMode()` /
// `getInitialDatabaseMode()` / `isOnlineDatabaseMode()`.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fake-anon-key');
});

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  getInitialDatabaseMode,
  isOnlineDatabaseMode,
  getDatabaseMode
} from '../services/supabaseService';
import { DatabaseMode } from '../types';

describe('getInitialDatabaseMode — default único do app', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sem modo gravado e com credenciais → SUPABASE_PLUS (memória)', () => {
    expect(getInitialDatabaseMode()).toBe(DatabaseMode.SUPABASE_PLUS);
  });

  it('INTERNAL gravado de propósito é respeitado', () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    expect(getInitialDatabaseMode()).toBe(DatabaseMode.INTERNAL);
  });

  it('SUPABASE gravado torna-se SUPABASE_PLUS em memória', () => {
    localStorage.setItem('app_database_mode', 'SUPABASE');
    expect(getInitialDatabaseMode()).toBe(DatabaseMode.SUPABASE_PLUS);
  });

  it('SUPABASE_PLUS gravado é preservado', () => {
    localStorage.setItem('app_database_mode', 'SUPABASE_PLUS');
    expect(getInitialDatabaseMode()).toBe(DatabaseMode.SUPABASE_PLUS);
  });

  it('acompanha getDatabaseMode quando o modo está gravado', () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    expect(getDatabaseMode()).toBe('INTERNAL');
    expect(getInitialDatabaseMode()).toBe(DatabaseMode.INTERNAL);
  });
});

describe('isOnlineDatabaseMode — SUPABASE_PLUS deixa de contar como offline', () => {
  it.each([
    ['INTERNAL', false],
    ['INTERNAL_PLUS', false],
    ['SUPABASE', true],
    ['SUPABASE_PLUS', true]
  ])('%s → %s', (mode, expected) => {
    expect(isOnlineDatabaseMode(mode)).toBe(expected);
  });

  it('sem argumento usa o modo atual (credenciais presentes → online)', () => {
    localStorage.removeItem('app_database_mode');
    expect(isOnlineDatabaseMode()).toBe(true);
  });

  it('sem argumento e com INTERNAL gravado → offline', () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    expect(isOnlineDatabaseMode()).toBe(false);
  });
});

describe('uiStore herda o mesmo default', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('sem modo gravado o estado inicial é SUPABASE_PLUS', async () => {
    const { useUiStore } = await import('../stores/uiStore');
    expect(useUiStore.getState().databaseMode).toBe(DatabaseMode.SUPABASE_PLUS);
  });

  it('INTERNAL gravado mantém o estado inicial em INTERNAL', async () => {
    localStorage.setItem('app_database_mode', 'INTERNAL');
    vi.resetModules();
    const { useUiStore } = await import('../stores/uiStore');
    expect(useUiStore.getState().databaseMode).toBe(DatabaseMode.INTERNAL);
  });
});
