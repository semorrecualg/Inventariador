// @vitest-environment jsdom
// src/__tests__/activeSearch.test.tsx
// Busca ativa: agrupamento e filtro por localidade têm de usar o MESMO endereço
// efetivo do inventário (`assetAddressKey`) e do ENDEREÇO FÍSICO. Antes só
// `endereco` contava e o rótulo de fallback era «SEM LOCALIZAÇÃO», por isso os
// ativos sem endereço — listados no ENDEREÇO FÍSICO como «SEM LOCAL» — não eram
// encontrados aqui.
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ActiveSearch from '../components/ActiveSearch';
import type { Asset } from '../types';

/** Recorte de ativo: o componente só lê estes campos. */
const asset = (over: Record<string, unknown>): Asset =>
  ({ _conferido: 0, ...over } as unknown as Asset);

describe('busca ativa — localização efetiva', () => {
  afterEach(cleanup);

  it('usa `_localMaster`/colunas legadas e agrupa os sem endereço como «SEM LOCAL»', () => {
    const assets = [
      // Local auditado vence `endereco` vazio (antes caía em «SEM LOCALIZAÇÃO»).
      asset({ id: 'A', etiqueta: 'ET-A', _localMaster: 'ALMOXARIFADO CENTRAL', endereco: '' }),
      asset({ id: 'B', etiqueta: 'ET-B', endereco: '151100 PRODUCAO - PV1 MILHO' }),
      // Nenhuma coluna de endereço: é o «SEM LOCAL» do ENDEREÇO FÍSICO.
      asset({ id: 'C', etiqueta: 'ET-C' }),
      asset({ id: 'D', etiqueta: 'ET-D', endereco: 'JA CONFERIDO', _conferido: 1 }),
      // Sem a flag, mas com a coluna de auditoria: a regra única também o dá
      // por conferido, por isso não é item faltante.
      asset({ id: 'E', etiqueta: 'ET-E', endereco: 'SÓ AUDITORIA', _conferido: 0, AUDITOR_STATUS_CONFERENCIA: 'SIM' })
    ];

    render(<ActiveSearch assets={assets} onBack={vi.fn()} onSelectAsset={vi.fn()} />);

    // Só os não conferidos, cada um na sua localidade efetiva.
    expect(screen.getByText('ET-A')).toBeTruthy();
    expect(screen.getByText('ET-B')).toBeTruthy();
    expect(screen.getByText('ET-C')).toBeTruthy();
    expect(screen.queryByText('ET-D')).toBeNull();
    expect(screen.queryByText('ET-E')).toBeNull();
    expect(screen.queryByText('SEM LOCALIZAÇÃO')).toBeNull();

    // «SEM LOCAL» filtra apenas o ativo sem nenhuma coluna de endereço.
    fireEvent.click(screen.getByRole('button', { name: /^sem local/i }));
    expect(screen.getByText('ET-C')).toBeTruthy();
    expect(screen.queryByText('ET-A')).toBeNull();
    expect(screen.queryByText('ET-B')).toBeNull();

    // O `_localMaster` é usado como localidade (antes o filtro não encontrava nada).
    fireEvent.click(screen.getByRole('button', { name: /^almoxarifado central/i }));
    expect(screen.getByText('ET-A')).toBeTruthy();
    expect(screen.queryByText('ET-C')).toBeNull();
  });
});
