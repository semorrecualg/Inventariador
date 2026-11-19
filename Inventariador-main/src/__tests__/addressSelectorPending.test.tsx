// @vitest-environment jsdom
// src/__tests__/addressSelectorPending.test.tsx
// O cartão de localidade mostrava «x de N conferidos», mas a pergunta que o
// auditor leva para o campo é «quantos faltam». O texto passa a responder por
// esses pendentes, e não pelo que já está feito.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import AddressSelector from '../components/AddressSelector';

const getLocationsWithStats = vi.hoisted(() => vi.fn());

vi.mock('../services/localDbService', () => ({
  localDb: { assets: { getLocationsWithStats } }
}));

afterEach(cleanup);

describe('ENDEREÇO FÍSICO — o cartão responde «quantos faltam»', () => {
  it('mostra os pendentes de cada localidade e marca as que estão completas', async () => {
    getLocationsWithStats.mockResolvedValue([
      { displayName: 'SEM LOCAL', total: 10, checked: 7, locKey: 'SEMLOCAL' },
      { displayName: '151100 PRODUCAO - PV1 MILHO', total: 5, checked: 5, locKey: '151100PRODUCAOPV1MILHO' }
    ]);

    render(<AddressSelector selectedUnit="010101 CICOPAL GO" onSelect={vi.fn()} onBack={vi.fn()} />);

    expect(await screen.findByText('Faltam 3 de 10')).toBeTruthy();
    expect(screen.queryByText('7 de 10 conferidos')).toBeNull();
    expect(screen.getByText('Tudo conferido (5)')).toBeTruthy();
  });
});
