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

/** Texto do cartão inteiro (o selo é o único sítio com «Pendente Nuvem»). */
const cartao = (over: Partial<Asset> = {}): string =>
  render(<AssetListItem asset={ativo(over)} />).container.textContent ?? '';

describe('AssetListItem — selo de pendência', () => {
  it('mostra o motivo e a idade da conferência por enviar', () => {
    const ha2h = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const texto = cartao({ _dataLeitura: ha2h });

    expect(texto).toContain('Pendente Nuvem');
    expect(texto).toContain('conferência por enviar');
    expect(texto).toContain('há 2 h');
  });

  it('base nunca espelhada identifica-se como tal', () => {
    const texto = cartao({
      _conferido: false,
      _lastUpdated: new Date(Date.now() - 3 * 86400 * 1000).toISOString()
    });

    expect(texto).toContain('Pendente Nuvem');
    expect(texto).toContain('base por espelhar');
    expect(texto).toContain('há 3 d');
  });

  it('conferido só pela coluna de auditoria já conta como conferido', () => {
    const texto = cartao({ _conferido: false, AUDITOR_STATUS_CONFERENCIA: 'SIM', _is_synced: 1 });

    expect(texto).toContain('Sincronizado');
    expect(texto).not.toContain('Pendente Nuvem');
    expect(texto).not.toContain('Confirmar');
  });

  it('sem data no registo não inventa idade', () => {
    const texto = cartao({ _conferido: false });

    expect(texto).toContain('Pendente Nuvem');
    expect(texto).toContain('base por espelhar');
    expect(texto).not.toContain('há ');
  });

  // Recusado pela nuvem ≠ à espera na fila: o cartão tem de dizer qual é.
  it('mostra a falha de envio com o motivo, em vez do âmbar de por enviar', () => {
    const ha1h = new Date(Date.now() - 3600 * 1000).toISOString();
    const texto = cartao({ _syncFailAt: ha1h, _syncFailReason: 'RLS negou o upsert' });

    expect(texto).toContain('Falha de envio');
    expect(texto).toContain('RLS negou o upsert');
    expect(texto).toContain('há 1 h');
    expect(texto).not.toContain('conferência por enviar');
    expect(texto).not.toContain('Pendente Nuvem');
  });

  it('não mostra falha num registo que já está igual à nuvem', () => {
    const ha1h = new Date(Date.now() - 3600 * 1000).toISOString();
    const texto = cartao({ _is_synced: 1, _syncFailAt: ha1h, _syncFailReason: 'RLS negou o upsert' });

    expect(texto).toContain('Sincronizado');
    expect(texto).not.toContain('Falha de envio');
  });
});
