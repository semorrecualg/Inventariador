import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import { rascunhoDaInclusaoManual } from '../utils/rascunhoInclusaoManual';

// Inclusão manual de um item que não está no cadastro: o texto digitado tem de
// ficar no registo, em vez de ser barrado como «etiqueta duplicada» e perdido.

const ativo = (over: Partial<Asset> = {}): Asset => ({
  id: 'A1',
  tenantid: 'CICOPAL',
  filial: '010101',
  status: 'ATIVO',
  etiqueta: '007856',
  qt: 1,
  descricaodoativo: '',
  serial: '',
  dataaqusic: '27/11/2026',
  cnpj: '',
  nomefornecedor: '',
  notafiscal: '',
  endereco: 'SALAS',
  registro: '',
  subreg: '',
  databaixa: '',
  contacontabil: '',
  primarykey: 'A1',
  centrodecusto: '',
  vlraquisic: 0,
  sn1_recno: null,
  sn3_recno: null,
  ...over,
});

const alvo = { etiqueta: '007856', unidade: '010101', endereco: 'SALAS' };

describe('rascunhoDaInclusaoManual — o texto digitado completa o registo em branco', () => {
  it('devolve o registo da mesma etiqueta que está sem descrição e sem série', () => {
    const emBranco = ativo({ id: 'RASCUNHO' });
    const encontrado = rascunhoDaInclusaoManual([ativo({ id: 'OUTRO', etiqueta: '009999' }), emBranco], alvo);
    expect(encontrado?.id).toBe('RASCUNHO');
  });

  it('compara o endereço por _localMaster, tal como o inventário', () => {
    const emBranco = ativo({ id: 'RASCUNHO', endereco: '', _localMaster: 'salas' });
    expect(rascunhoDaInclusaoManual([emBranco], alvo)?.id).toBe('RASCUNHO');
  });

  it('não toca num registo que já tem descrição', () => {
    const descrito = ativo({ id: 'DESCRITO', descricaodoativo: 'CADEIRA GIRATÓRIA' });
    expect(rascunhoDaInclusaoManual([descrito], alvo)).toBeUndefined();
  });

  it('não toca num registo que já tem série', () => {
    const comSerie = ativo({ id: 'SERIE', serial: 'SN-123456' });
    expect(rascunhoDaInclusaoManual([comSerie], alvo)).toBeUndefined();
  });

  it('não atravessa unidade nem endereço', () => {
    const outraUnidade = ativo({ id: 'UNIDADE', filial: '020202' });
    const outroEndereco = ativo({ id: 'ENDERECO', endereco: 'CORREDOR B' });
    expect(rascunhoDaInclusaoManual([outraUnidade, outroEndereco], alvo)).toBeUndefined();
  });

  it('ignora o próprio registo em edição e os apagados', () => {
    const emEdicao = ativo({ id: 'A1' });
    const apagado = ativo({ id: 'APAGADO', _is_deleted: true });
    expect(rascunhoDaInclusaoManual([emEdicao], { ...alvo, exceptoId: 'A1' })).toBeUndefined();
    expect(rascunhoDaInclusaoManual([apagado], alvo)).toBeUndefined();
  });

  it('sem etiqueta ou sem unidade não completa nada', () => {
    expect(rascunhoDaInclusaoManual([ativo()], { ...alvo, etiqueta: '  ' })).toBeUndefined();
    expect(rascunhoDaInclusaoManual([ativo()], { ...alvo, unidade: '' })).toBeUndefined();
  });
});
