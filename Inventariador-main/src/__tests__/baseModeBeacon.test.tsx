// @vitest-environment jsdom
// ============================================================================
// baseModeBeacon.test.tsx — «em que base estou?» visível em todas as telas.
//
// O selo nasceu do sintoma de campo: a troca para Base Oficial anunciava
// «MODO NUVEM» e as telas seguintes diziam BASE LOCAL (blindagem física a
// forçar o modo no arranque). O selo mostra o modo REAL e a luz da
// sincronização na mesma regra para o app inteiro.
// ============================================================================
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';

import BaseModeBeacon, { resolveSyncLight } from '../components/BaseModeBeacon';

describe('resolveSyncLight — regra única da segunda luz', () => {
  const base = { isOnlineMode: true, isOnline: true, isSyncing: false, pending: 0 };

  it('Base Local desliga a nuvem em vez de a pintar de falha', () => {
    expect(resolveSyncLight({ ...base, isOnlineMode: false, pending: 12 })).toBe('local');
  });

  it('sem rede ganha à fila pendente', () => {
    expect(resolveSyncLight({ ...base, isOnline: false, pending: 3 })).toBe('sem-rede');
  });

  it('a sincronizar ganha à fila pendente', () => {
    expect(resolveSyncLight({ ...base, isSyncing: true, pending: 3 })).toBe('sincronizando');
  });

  it('fila travada ou erro de envio = parado', () => {
    expect(resolveSyncLight({ ...base, pending: 3, isSyncLocked: true })).toBe('parado');
    expect(resolveSyncLight({ ...base, syncError: 'sem resposta' })).toBe('parado');
  });

  it('fila por subir com rede = pendente; sem fila = sincronizado', () => {
    expect(resolveSyncLight({ ...base, pending: 2 })).toBe('pendente');
    expect(resolveSyncLight(base)).toBe('sincronizado');
  });
});

describe('BaseModeBeacon — selo global', () => {
  afterEach(() => cleanup());

  it('diz BASE LOCAL em vermelho e mantém a nuvem desligada', () => {
    render(<BaseModeBeacon isOnlineMode={false} pendingData={5} />);

    expect(screen.getByText('Base Local')).toBeTruthy();
    expect(screen.getByTestId('beacon-mode-dot').className).toContain('bg-red-500');
    expect(screen.getByText('Nuvem desligada')).toBeTruthy();
  });

  it('diz SUPABASE em verde e SINCRONIZADO quando não há fila', () => {
    render(<BaseModeBeacon isOnlineMode />);

    expect(screen.getByText('Supabase')).toBeTruthy();
    expect(screen.getByTestId('beacon-mode-dot').className).toContain('bg-emerald-500');
    expect(screen.getByText('Sincronizado')).toBeTruthy();
  });

  it('fila pendente é âmbar a piscar', () => {
    render(<BaseModeBeacon isOnlineMode pendingData={2} pendingPhotos={1} />);

    expect(screen.getByText('3 pendentes')).toBeTruthy();
    expect(screen.getByTestId('beacon-sync-dot').className).toContain('bg-amber-400');
    expect(screen.getByTestId('beacon-sync-dot').className).toContain('animate-pulse');
  });

  it('a sincronizar mostra SINCRONIZANDO em âmbar', () => {
    render(<BaseModeBeacon isOnlineMode isSyncing pendingData={4} />);

    expect(screen.getByText('Sincronizando…')).toBeTruthy();
    expect(screen.getByTestId('beacon-sync-dot').className).toContain('bg-amber-400');
  });

  it('sem rede fica vermelho', () => {
    render(<BaseModeBeacon isOnlineMode />);
    act(() => { window.dispatchEvent(new Event('offline')); });

    expect(screen.getByText('Sem rede')).toBeTruthy();
    expect(screen.getByTestId('beacon-sync-dot').className).toContain('bg-red-500');
  });
});
