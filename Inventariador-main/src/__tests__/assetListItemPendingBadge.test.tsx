// @vitest-environment jsdom
// O selo do cartão dizia só «Pendente Nuvem»: uma conferência por enviar e uma
// base nunca espelhada apareciam iguais, e sem idade uma pendência de minutos
// parecia igual a uma esquecida desde a semana passada.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { AssetListItem } from '../components/AssetListItem';
import type { Asset } from '../types';

const ativo = (over: Partial<Asset> = {}): Asset => ({
  id: 1,
  tenantid: 'CICOPAL',
  filial: '010101_CICOPAL_GO',
  status: 'ATIVO',
  etiqueta: '008491',
  qt: 1,
  descricaodoativo: 'CADEIRA GIRATÓRIA',
  serial: '',
  dataaqusic: '',
  cnpj: '',
  nomefornecedor: '',
  notafiscal: '',
  endereco: '151200 CONTABILIDADE',
  registro: '',
  subreg: '',
  databaixa: '',
  contacontabil: '',
  primarykey: '008491',
  centrodecusto: '',
  vlraquisic: 0,
  sn1_recno: null,
  sn3_recno: null,
  _conferido: true,
  _is_synced: 0,
  ...over
} as Asset);

describe('AssetListItem — selo de pendência', () => {
  it('mostra o motivo e a idade da conferência por enviar', () => {
    const ha2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

    const { container } = render(<AssetListItem asset={ativo({ _dataLeitura: ha2h })} />);
    const selo = container.querySelector('#sync-badge-1');

    expect(selo?.textContent).toContain('Pendente Nuvem');
    expect(selo?.textContent).toContain('conferência por enviar');
    expect(selo?.textContent).toContain('há 2 h');
  });

  it('base nunca espelhada identifica-se como tal', () => {
    const { container } = render(
      <AssetListItem
        asset={ativo({
          _conferido: false,
          _lastUpdated: new Date(Date.now() - 3 * 86400 * 1000).toISOString()
        })}
      />
    );
    const selo = container.querySelector('#sync-badge-1');

    expect(selo?.textContent).toContain('Pendente Nuvem');
    expect(selo?.textContent).toContain('base por espelhar');
    expect(selo?.textContent).toContain('há 3 d');
  });

  it('sem data no registo não inventa idade', () => {
    const { container } = render(<AssetListItem asset={ativo({ _conferido: false })} />);
    const selo = container.querySelector('#sync-badge-1');

    expect(selo?.textContent).toContain('base por espelhar');
    expect(selo?.textContent).not.toContain('há ');
  });
});
