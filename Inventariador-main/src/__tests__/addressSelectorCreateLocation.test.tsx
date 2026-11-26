// @vitest-environment jsdom
// src/__tests__/addressSelectorCreateLocation.test.tsx
// «Nova Localidade» no ENDEREÇO FÍSICO: o local criado tem de voltar na lista
// (recarregada da base local) para poder ser escolhido, e uma falha de gravação
// tem de ficar visível — o modal não pode fechar como se tivesse criado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import AddressSelector from '../components/AddressSelector';

const getLocationsWithStats = vi.hoisted(() => vi.fn());

vi.mock('../services/localDbService', () => ({
  localDb: { assets: { getLocationsWithStats } }
}));

const CORREDOR = { displayName: 'CORREDOR A', total: 2, checked: 1, locKey: 'CORREDORA' };
const SALA = { displayName: 'SALA 101', total: 0, checked: 0, locKey: 'SALA101' };

beforeEach(() => {
  getLocationsWithStats.mockReset();
});

afterEach(cleanup);

const renderSelector = (onAddNewLocation = vi.fn().mockResolvedValue(undefined)) =>
  render(
    <AddressSelector
      selectedUnit="010101 CICOPAL GO"
      onSelect={vi.fn()}
      onBack={vi.fn()}
      onAddNewLocation={onAddNewLocation}
    />
  );

const abrirModal = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /nova localidade/i }));
  return screen.findByPlaceholderText(/sala 101/i);
};

describe('ENDEREÇO FÍSICO — «Nova Localidade»', () => {
  it('grava o local e mostra-o na lista recarregada', async () => {
    getLocationsWithStats
      .mockResolvedValueOnce([CORREDOR])
      .mockResolvedValueOnce([CORREDOR, SALA]);
    const onAddNewLocation = vi.fn().mockResolvedValue(undefined);

    renderSelector(onAddNewLocation);

    expect(await screen.findByText('CORREDOR A')).toBeTruthy();

    const input = await abrirModal();
    fireEvent.change(input, { target: { value: 'sala 101' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar criação/i }));

    await waitFor(() => expect(onAddNewLocation).toHaveBeenCalledWith('SALA 101'));
    expect(await screen.findByText('SALA 101')).toBeTruthy();
    expect(getLocationsWithStats).toHaveBeenCalledTimes(2);
  });

  it('uma falha de gravação fica visível e o modal permanece aberto', async () => {
    getLocationsWithStats.mockResolvedValue([CORREDOR]);
    const onAddNewLocation = vi.fn().mockRejectedValue(new Error('SQLITE_CORRUPT: índice ilegível'));

    renderSelector(onAddNewLocation);

    const input = await abrirModal();
    fireEvent.change(input, { target: { value: 'SALA 101' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar criação/i }));

    const erro = await screen.findByRole('alert');
    expect(erro.textContent).toContain('SQLITE_CORRUPT');
    // O botão continua lá: o local NÃO foi criado.
    expect(screen.getByRole('button', { name: /confirmar criação/i })).toBeTruthy();
    expect(getLocationsWithStats).toHaveBeenCalledTimes(1);
  });
});
