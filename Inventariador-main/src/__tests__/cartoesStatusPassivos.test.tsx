// @vitest-environment jsdom
// ============================================================================
// cartoesStatusPassivos.test.tsx — cartões de status são só leitura.
//
// O selo («PROTEGIDO»/«MONITORANDO») acompanha o modo de base sozinho. Os
// botões técnicos que exigiam decisões que o utilizador de primeiro acesso não
// tinha como avaliar («VALIDAR SOBERANIA», «Desbloquear blindagem») saíram.
// ============================================================================
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import MainMenu from '../components/MainMenu';
import {
  DatabaseMode,
  ScanFeedbackMode,
  ScannerMode,
  type User
} from '../types';

const getFileStatus = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: 'OK', path: 'Directory.Data/gbr_kardek.db' })
);

vi.mock('../services/localDbService', () => ({
  localDb: { unitConfigs: { toArray: vi.fn().mockResolvedValue([]) } },
  readVirtualSnapshot: vi.fn().mockResolvedValue(null)
}));

vi.mock('../services/sqliteService', () => ({
  db: {
    unit_configs: { toArray: vi.fn().mockResolvedValue([]) },
    local_assets: { each: vi.fn() }
  },
  sqliteService: { getFileStatus }
}));

const ADMIN = { id: '1', name: 'Admin', email: 'admin@gbr.com.br', role: 'MASTER' } as User;

const abrirGestao = () => {
  render(
    <MainMenu
      onNavigate={vi.fn()}
      onExport={vi.fn()}
      onBackup={vi.fn()}
      onDownloadCloudData={vi.fn()}
      onRestore={vi.fn()}
      onClearDatabase={vi.fn()}
      user={ADMIN}
      units={[]}
      inventoryInfo={{ count: 0, totalDatabase: 0, date: null }}
      autoConfirmOnScan={false}
      onUpdateAutoConfirm={vi.fn()}
      isFullscreen={false}
      onToggleFullscreen={vi.fn()}
      scanFeedbackMode={ScanFeedbackMode.BOTH}
      onUpdateScanFeedbackMode={vi.fn()}
      scannerMode={ScannerMode.BARCODE}
      onUpdateScannerMode={vi.fn()}
      initialOpenPanel="ADMIN"
      databaseMode={DatabaseMode.INTERNAL}
      onUpdateDatabaseMode={vi.fn()}
      selectedUnit="010101 CICOPAL GO"
      darkMode={false}
      onUpdateDarkMode={vi.fn()}
      batterySaver={false}
      onUpdateBatterySaver={vi.fn()}
      protheusIntegrationEnabled={false}
      onUpdateProtheusIntegration={vi.fn()}
      protheusApiUrl=""
      onUpdateProtheusApiUrl={vi.fn()}
      mandatoryPhotoOnDivergence={false}
      onUpdateMandatoryPhotoOnDivergence={vi.fn()}
      mandatoryPhotoOnNewItem={false}
      onUpdateMandatoryPhotoOnNewItem={vi.fn()}
      showModal={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText('Gestão e Manutenção'));
  return screen.findByText('Configuração e Ações do Utilizador');
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('cartões de status — somente leitura', () => {
  it('aparelho blindado mostra PROTEGIDO sem botões de ação', async () => {
    localStorage.setItem('is_system_locked', 'true');
    localStorage.setItem('gbr_integrity_key', 'GBR-AES256-SHA512::KARDEX_CONF_LOCKED_0_SEED');

    await abrirGestao();

    expect(screen.getByText('PROTEGIDO')).toBeTruthy();
    expect(screen.getByText(/Blindagem automática/i)).toBeTruthy();
    expect(screen.queryByText('VALIDAR SOBERANIA')).toBeNull();
    expect(screen.queryByText('Desbloquear blindagem')).toBeNull();
  });

  it('aparelho sem blindagem mostra MONITORANDO e nenhum controlo técnico', async () => {
    await abrirGestao();

    // O badge do cabeçalho e o monitor de runtime partilham a palavra.
    expect(screen.getAllByText('MONITORANDO').length).toBeGreaterThan(0);
    expect(screen.getByText(/Sem blindagem/i)).toBeTruthy();
    expect(screen.queryByText('VALIDAR SOBERANIA')).toBeNull();
    expect(screen.queryByText('Desbloquear blindagem')).toBeNull();
  });
});

