// @vitest-environment jsdom
// ============================================================================
// moduleSelectorMode.test.tsx — gate de módulos por modo.
//
// O ModuleSelector lia `localStorage.getItem('app_database_mode') || 'INTERNAL'`
// e comparava com `=== 'SUPABASE'`: num build com credenciais e sem a chave
// gravada, ou em SUPABASE_PLUS, a sessão contava como offline e os módulos
// ficavam bloqueados com a base local vazia. Agora usa
// `isOnlineDatabaseMode(getDatabaseMode())`.
// ============================================================================
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { UserRole } from '../types';

const { modeHolder } = vi.hoisted(() => ({ modeHolder: { current: 'SUPABASE_PLUS' as string } }));

vi.mock('../services/supabaseService', () => ({
  getDatabaseMode: () => modeHolder.current,
  isOnlineDatabaseMode: (mode?: string | null) =>
    !String(mode ?? modeHolder.current).startsWith('INTERNAL')
}));

vi.mock('../services/sqliteService', () => ({
  sqliteService: {
    countAtivosByTenant: vi.fn().mockResolvedValue(0),
    getAssetCount: vi.fn().mockResolvedValue(0)
  }
}));

vi.mock('../services/localDbService', () => ({
  readVirtualSnapshot: vi.fn().mockResolvedValue([])
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => false) }
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import ModuleSelector from '../components/ModuleSelector';

const renderSelector = () =>
  render(
    <ModuleSelector
      onSelect={vi.fn()}
      onLogout={vi.fn()}
      onOpenDatabaseManager={vi.fn()}
      username="Ana"
      userRole={UserRole.ADMIN}
      // Inventário "não vazio" pelo estado do App, mas nenhum ativo local no
      // contrato: é aqui que a sessão com nuvem tem de continuar liberada.
      isDatabaseEmpty={false}
      tenantid="CICOPAL"
    />
  );

describe('ModuleSelector — sessão com nuvem não é barrada por engano', () => {
  beforeEach(() => {
    modeHolder.current = 'SUPABASE_PLUS';
  });

  afterEach(() => cleanup());

  it('SUPABASE_PLUS mantém os módulos liberados', async () => {
    renderSelector();

    await waitFor(() => {
      const card = screen.getByText('INVENTARIADOR').closest('button') as HTMLButtonElement;
      expect(card.disabled).toBe(false);
    });
    expect(screen.queryByText('Primeira Carga de Dados')).toBeNull();
  });

  it('SUPABASE também libera (modo persistido simples)', async () => {
    modeHolder.current = 'SUPABASE';
    renderSelector();

    await waitFor(() => {
      const card = screen.getByText('INVENTARIADOR').closest('button') as HTMLButtonElement;
      expect(card.disabled).toBe(false);
    });
  });

  it('INTERNAL bloqueia quando o contrato não tem ativos locais', async () => {
    modeHolder.current = 'INTERNAL';
    renderSelector();

    await waitFor(() => {
      expect(screen.queryByText('INVENTARIADOR')).toBeNull();
    });
    expect(screen.getByText('Primeira Carga de Dados')).toBeTruthy();
  });

  it('INTERNAL_PLUS também é base local', async () => {
    modeHolder.current = 'INTERNAL_PLUS';
    renderSelector();

    await waitFor(() => {
      expect(screen.queryByText('INVENTARIADOR')).toBeNull();
    });
  });
});
