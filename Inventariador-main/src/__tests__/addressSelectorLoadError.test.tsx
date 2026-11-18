// @vitest-environment jsdom
// ENDEREÇO FÍSICO: uma leitura que falha não é uma base vazia. Antes, a
// excepção do SQLite caía no `catch` que só fazia `console.error` e a lista
// ficava vazia — o ecrã dizia «Nenhum Endereço Cadastrado» e o operador
// concluía que a filial não tinha endereços.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AddressSelector from '../components/AddressSelector';

const fake = vi.hoisted(() => ({ getLocationsWithStats: vi.fn() }));

vi.mock('../services/localDbService', () => ({
  localDb: { assets: { getLocationsWithStats: fake.getLocationsWithStats } }
}));

beforeEach(() => {
  fake.getLocationsWithStats.mockReset();
});

const selector = () => (
  <AddressSelector selectedUnit="010101_CICOPAL_GO" onSelect={vi.fn()} onBack={vi.fn()} />
);

describe('AddressSelector — falha de leitura ≠ base vazia', () => {
  it('mostra a falha de consulta (não «sem endereços») e permite repetir', async () => {
    fake.getLocationsWithStats.mockRejectedValueOnce(new Error('SQLITE_CORRUPT: banco local ilegível'));

    render(selector());

    expect(await screen.findByText(/falha ao ler a base local/i)).toBeTruthy();
    expect(screen.queryByText(/nenhum endereço cadastrado/i)).toBeNull();
    expect(screen.getByText(/SQLITE_CORRUPT/)).toBeTruthy();

    fake.getLocationsWithStats.mockResolvedValueOnce([
      { displayName: '151200 CONTABILIDADE - CDC 70104', total: 4, checked: 1, locKey: '151200 CONTABILIDADE - CDC 70104' }
    ]);
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(await screen.findByText('151200 CONTABILIDADE - CDC 70104')).toBeTruthy();
    expect(screen.queryByText(/falha ao ler a base local/i)).toBeNull();
  });

  it('mantém «Nenhum Endereço Cadastrado» quando a consulta funciona e não há registros', async () => {
    fake.getLocationsWithStats.mockResolvedValueOnce([]);

    render(selector());

    expect(await screen.findByText(/nenhum endereço cadastrado/i)).toBeTruthy();
    expect(screen.queryByText(/falha ao ler a base local/i)).toBeNull();
  });
});
