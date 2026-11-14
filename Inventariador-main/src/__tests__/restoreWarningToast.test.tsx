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

  it('reinicia o temporizador quando o mesmo aviso é disparado outra vez', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(
      <RestoreWarningToast message="BASE REPOSTA" restartToken={1} onDismiss={onDismiss} />
    );

    // 7s do primeiro ciclo: ainda visível.
    act(() => { vi.advanceTimersByTime(7000); });
    expect(onDismiss).not.toHaveBeenCalled();

    // Mesmo texto, novo disparo: o ciclo tem de recomeçar do zero.
    rerender(<RestoreWarningToast message="BASE REPOSTA" restartToken={2} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(7000); });
    expect(onDismiss).not.toHaveBeenCalled();

    // 8s desde o segundo disparo: fecha uma única vez.
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('fecha pelo botão sem esperar o temporizador', () => {
    const onDismiss = vi.fn();
    render(<RestoreWarningToast message="aviso" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByLabelText('Fechar aviso'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
