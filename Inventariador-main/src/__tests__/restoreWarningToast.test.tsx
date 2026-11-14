// @vitest-environment jsdom
// ============================================================================
// restoreWarningToast.test.tsx — o aviso de contrato reposto tem de aparecer
// como toast vermelho no canto inferior (auto-dismiss), não como modal global.
// ============================================================================
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RestoreWarningToast } from '../components/RestoreWarningToast';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RestoreWarningToast', () => {
  it('renderiza o aviso como alerta vermelho no fundo do ecrã', () => {
    render(<RestoreWarningToast message="BASE REPOSTA SEM O CONTRATO ACTIVO (CICOPAL)" onDismiss={() => {}} />);

    const toast = screen.getByRole('alert');
    expect(toast.textContent).toContain('BASE REPOSTA SEM O CONTRATO ACTIVO (CICOPAL)');
    expect(toast.className).toContain('bg-red-600');
    expect(toast.className).toContain('fixed');
    expect(toast.className).toContain('bottom-24');
  });

  it('não ocupa o ecrã quando não há aviso', () => {
    render(<RestoreWarningToast message={null} onDismiss={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('fecha sozinho depois do tempo de auto-dismiss', () => {
    const onDismiss = vi.fn();
    render(<RestoreWarningToast message="aviso" onDismiss={onDismiss} />);

    act(() => { vi.advanceTimersByTime(7999); });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fecha pelo botão sem esperar o temporizador', () => {
    const onDismiss = vi.fn();
    render(<RestoreWarningToast message="aviso" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByLabelText('Fechar aviso'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
