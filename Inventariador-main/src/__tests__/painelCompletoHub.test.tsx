// @vitest-environment jsdom
// src/__tests__/painelCompletoHub.test.tsx
// A tool grid da Unidade Operacional ficou só com AJUSTES · PAINEL: os painéis
// «Gestão e Manutenção» e «Auditoria e Concordância» passam a abrir por dentro
// do PAINEL COMPLETO. Este teste fixa as duas metades do contrato — a grelha
// não volta a oferecer DADOS/AUDITORIA e o hub continua a abrir os dois painéis.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import UnitSelector from '../components/UnitSelector';
import MainMenu from '../components/MainMenu';
import {
  AppScreen,
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

const renderGrelha = (perfil: 'ADMIN' | 'AUDITOR') => {
  const onNavigate = vi.fn();
  render(
    <UnitSelector
      units={[{ filial: '010101 CICOPAL GO', hasData: true }]}
      onSelect={vi.fn()}
      onBack={vi.fn()}
      onNavigate={onNavigate}
      isAdmin={perfil === 'ADMIN'}
      isAuditor={perfil === 'AUDITOR'}
      databaseMode={DatabaseMode.SUPABASE}
    />
  );
  return onNavigate;
};

describe('UNIDADE OPERACIONAL — a grelha só oferece Ajustes e Painel', () => {
  it('admin vê AJUSTES · PAINEL e não vê DADOS nem AUDITORIA', () => {
    const onNavigate = renderGrelha('ADMIN');

    // O `title` identifica o botão da grelha: o cartão da unidade também tem um
    // selo «Dados», por isso o texto solto não serve de prova.
    expect(screen.getByTitle('Ajustes de Campo')).toBeTruthy();
    expect(screen.getByTitle('Painel Completo')).toBeTruthy();
    expect(screen.queryByTitle('Gestão de Dados')).toBeNull();
    expect(screen.queryByTitle('Trilha de Auditoria')).toBeNull();

    fireEvent.click(screen.getByTitle('Painel Completo'));
    expect(onNavigate).toHaveBeenCalledWith(AppScreen.MAIN_MENU, { openPanel: 'ADMIN' });
  });

  it('auditor chega ao Painel Completo pela mesma grelha, sem botão AUDITORIA', () => {
    renderGrelha('AUDITOR');

    expect(screen.getByTitle('Ajustes de Campo')).toBeTruthy();
    expect(screen.getByTitle('Painel Completo')).toBeTruthy();
    expect(screen.queryByTitle('Gestão de Dados')).toBeNull();
    expect(screen.queryByTitle('Trilha de Auditoria')).toBeNull();
  });
});

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
