// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PreferencesPanel, { PreferencesPanelProps } from '../components/PreferencesPanel';
import { ScanFeedbackMode, ScannerMode } from '../types';

const buildProps = (overrides: Partial<PreferencesPanelProps> = {}): PreferencesPanelProps => ({
  onClose: vi.fn(),
  autoConfirmOnScan: true,
  onUpdateAutoConfirm: vi.fn(),
  scanFeedbackMode: ScanFeedbackMode.BOTH,
  onUpdateScanFeedbackMode: vi.fn(),
  scannerMode: ScannerMode.BARCODE,
  onUpdateScannerMode: vi.fn(),
  darkMode: false,
  onUpdateDarkMode: vi.fn(),
  batterySaver: false,
  onUpdateBatterySaver: vi.fn(),
  ...overrides
});

describe('PreferencesPanel', () => {
  it('reúne leitura e energia num único painel', () => {
    render(<PreferencesPanel {...buildProps({ contextLabel: 'Unidade 010101' })} />);

    expect(screen.getByText('Ajustes de Campo')).toBeTruthy();
    expect(screen.getByText('Unidade 010101')).toBeTruthy();
    expect(screen.getByText('Leitura')).toBeTruthy();
    expect(screen.getByText('Energia e visibilidade')).toBeTruthy();
  });

  it('aplica o modo de feedback escolhido', () => {
    const onUpdateScanFeedbackMode = vi.fn();
    render(<PreferencesPanel {...buildProps({ onUpdateScanFeedbackMode })} />);

    fireEvent.click(screen.getByRole('button', { name: /vibrar/i }));

    expect(onUpdateScanFeedbackMode).toHaveBeenCalledWith(ScanFeedbackMode.VIBRATE);
  });

  it('desliga a auto-conferência pelo interruptor', () => {
    const onUpdateAutoConfirm = vi.fn();
    render(<PreferencesPanel {...buildProps({ onUpdateAutoConfirm })} />);

    fireEvent.click(screen.getByRole('switch', { name: /auto-conferência/i }));

    expect(onUpdateAutoConfirm).toHaveBeenCalledWith(false);
  });

  it('explica a ficha de confirmação quando a auto-conferência está desligada', () => {
    render(<PreferencesPanel {...buildProps({ autoConfirmOnScan: false })} />);

    expect(
      screen.getByText(/abre a ficha de confirmação para revisar local e património/i)
    ).toBeTruthy();
  });

  it('restaura os padrões de leitura', () => {
    const onUpdateAutoConfirm = vi.fn();
    const onUpdateScanFeedbackMode = vi.fn();
    const onUpdateScannerMode = vi.fn();

    render(
      <PreferencesPanel
        {...buildProps({
          autoConfirmOnScan: false,
          scanFeedbackMode: ScanFeedbackMode.NONE,
          scannerMode: ScannerMode.QRCODE,
          onUpdateAutoConfirm,
          onUpdateScanFeedbackMode,
          onUpdateScannerMode
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /restaurar padrões de leitura/i }));

    expect(onUpdateAutoConfirm).toHaveBeenCalledWith(true);
    expect(onUpdateScanFeedbackMode).toHaveBeenCalledWith(ScanFeedbackMode.BOTH);
    expect(onUpdateScannerMode).toHaveBeenCalledWith(ScannerMode.BARCODE);
  });

  it('fecha pelo botão de voltar', () => {
    const onClose = vi.fn();
    render(<PreferencesPanel {...buildProps({ onClose })} />);

    fireEvent.click(screen.getByRole('button', { name: /fechar ajustes de campo/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
