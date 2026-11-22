// @vitest-environment jsdom
// src/__tests__/painelCompletoHub.test.tsx
// O PAINEL COMPLETO do hub abre «Gestão e Manutenção» e «Auditoria e
// Concordância». Com o fim da tela /unit, o hub é o único ponto de entrada das
// liberações administrativas.
import { describe, it, expect, vi, afterEach } from 'vitest';
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

afterEach(cleanup);

const ADMIN = { id: '1', name: 'Admin', email: 'admin@gbr.com.br', role: 'MASTER' } as User;
const AUDITOR = { id: '2', name: 'Auditor', email: 'auditor@gbr.com.br', role: 'AUDITOR' } as User;

const renderPainelCompleto = (user: User) => {
  render(
    <MainMenu
      onNavigate={vi.fn()}
      onExport={vi.fn()}
      onBackup={vi.fn()}
      onDownloadCloudData={vi.fn()}
      onRestore={vi.fn()}
      onClearDatabase={vi.fn()}
      user={user}
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
      databaseMode={DatabaseMode.SUPABASE}
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
};

describe('PAINEL COMPLETO — o hub abre Gestão e Manutenção e Auditoria', () => {
  it('abre Gestão e Manutenção e o «Voltar» devolve ao hub', async () => {
    renderPainelCompleto(ADMIN);

    expect(screen.getByText('Painel Completo')).toBeTruthy();
    fireEvent.click(screen.getByText('Gestão e Manutenção'));

    // Cabeçalho próprio do painel de dados: só existe na camada aberta.
    expect(await screen.findByText('Operações de Banco de Dados')).toBeTruthy();

    // O último «Voltar» do DOM é o da camada de Dados (as camadas empilham).
    const voltar = screen.getAllByLabelText('Voltar');
    fireEvent.click(voltar[voltar.length - 1]);

    expect(screen.queryByText('Operações de Banco de Dados')).toBeNull();
    expect(screen.getByText('Gestão e Manutenção')).toBeTruthy();
  });

  it('abre Auditoria e Concordância a partir do hub', async () => {
    renderPainelCompleto(ADMIN);

    // O corpo do menu também tem um título «Auditoria»: o alvo é o botão do hub.
    fireEvent.click(screen.getByRole('button', { name: /^Auditoria/ }));
    expect(await screen.findByText('Trilha B · Relatórios e Rastreabilidade')).toBeTruthy();

    // A trilha de auditoria continua alcançável dentro do painel.
    expect(screen.getByText('Trilha de Auditoria')).toBeTruthy();
  });

  it('o auditor vê o hub sem os itens administrativos', () => {
    renderPainelCompleto(AUDITOR);

    expect(screen.getByRole('button', { name: /^Auditoria/ })).toBeTruthy();
    expect(screen.queryByText('Gestão e Manutenção')).toBeNull();
    expect(screen.queryByText('Configurar Campos')).toBeNull();
    expect(screen.queryByText('Acessos')).toBeNull();
  });
});
