// ============================================================================
// etiquetaGroup.test.ts — conferência item a item com plaqueta repetida.
//
// A leitura por plaqueta já agrupava; o clique do item só agrupava quando
// existia a coluna `TAG_DUPLICIDADE = 'ETIQUETA+1REGISTRO'` (ausente na
// maioria das bases) e ainda exigia a mesma filial. Resultado: o auditor
// conferia um a um e os irmãos da plaqueta ficavam pendentes.
// ============================================================================
import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import {
  findPlaquetaGroup,
  isBaixado,
  isConferido,
  plaquetaKey,
  splitIdsByUnit
} from '../utils/etiquetaGroup';

const asset = (over: Record<string, unknown> = {}): Asset =>
  ({
    id: 'A1',
    etiqueta: '008491',
    filial: '010101 CICOPAL GO',
    status: 'EM USO',
    descricaodoativo: 'ITEM',
    ...over
  }) as unknown as Asset;

describe('plaquetaKey / isConferido / isBaixado', () => {
  it('normaliza a plaqueta e descarta placeholders', () => {
    expect(plaquetaKey(asset({ etiqueta: ' 008491 ' }))).toBe('008491');
    expect(plaquetaKey(asset({ etiqueta: 'etiquetar' }))).toBe('');
    expect(plaquetaKey(asset({ etiqueta: '' }))).toBe('');
  });

  it('reconhece conferido pelos dois caminhos', () => {
    expect(isConferido(asset({ _conferido: 1 }))).toBe(true);
    expect(isConferido(asset({ AUDITOR_STATUS_CONFERENCIA: 'SIM' }))).toBe(true);
    expect(isConferido(asset())).toBe(false);
  });

  it('reconhece baixado', () => {
    expect(isBaixado(asset({ status: 'BAIXA PATRIMONIAL' }))).toBe(true);
    expect(isBaixado(asset({ databaixa: '01/2020' }))).toBe(true);
    expect(isBaixado(asset())).toBe(false);
  });
});

describe('findPlaquetaGroup — lote a partir do clique no item', () => {
  const irmaoOutraFilial = asset({
    id: 'A2',
    filial: '010105 CICOPAL PA',
    descricaodoativo: 'SUB-ITEM EM OUTRA UNIDADE'
  });

  it('agrupa os irmãos da plaqueta mesmo em outra filial', () => {
    const group = findPlaquetaGroup(asset(), [asset(), irmaoOutraFilial]);
    expect(group.map(a => a.id)).toEqual(['A1', 'A2']);
  });

  it('não depende da coluna TAG_DUPLICIDADE da planilha', () => {
    // Sem `TAG_DUPLICIDADE` nenhum: era exatamente aqui que o clique falhava.
    const group = findPlaquetaGroup(asset(), [asset(), irmaoOutraFilial]);
    expect(group).toHaveLength(2);
    expect(asset().TAG_DUPLICIDADE).toBeUndefined();
  });

  it('ignora irmãos já conferidos e baixados', () => {
    const group = findPlaquetaGroup(asset(), [
      asset(),
      asset({ id: 'A2', _conferido: 1 }),
      asset({ id: 'A3', status: 'BAIXA' }),
      asset({ id: 'A4', filial: '010105 CICOPAL PA' })
    ]);
    expect(group.map(a => a.id)).toEqual(['A1', 'A4']);
  });

  it('plaqueta sem irmão pendente não forma lote', () => {
    expect(findPlaquetaGroup(asset(), [asset()])).toEqual([]);
    expect(findPlaquetaGroup(asset({ etiqueta: 'ETIQUETAR' }), [asset({ etiqueta: 'ETIQUETAR' })])).toEqual([]);
  });

  it('inclui o ativo clicado mesmo que ele não esteja na lista informada', () => {
    const group = findPlaquetaGroup(asset({ id: 'FORA' }), [asset(), irmaoOutraFilial]);
    expect(group.map(a => a.id)).toEqual(['FORA', 'A1', 'A2']);
  });

  it('não duplica o ativo clicado quando ele já está na lista', () => {
    const clicado = asset();
    const group = findPlaquetaGroup(clicado, [clicado, irmaoOutraFilial]);
    expect(group.filter(a => a.id === 'A1')).toHaveLength(1);
  });
});

describe('splitIdsByUnit — conferência e adoção de outra unidade', () => {
  it('separa os ids da unidade atual dos de outra unidade', () => {
    const group = [
      asset({ id: 'A1' }),
      asset({ id: 'A2', filial: '010105 CICOPAL PA' }),
      asset({ id: 'A3', filial: '010101 CICOPAL GO' })
    ];
    expect(splitIdsByUnit(group, '010101 CICOPAL GO')).toEqual({
      mesmaUnidade: ['A1', 'A3'],
      outraUnidade: ['A2']
    });
  });

  it('registro sem filial é tratado como da unidade atual', () => {
    expect(splitIdsByUnit([asset({ id: 'A1', filial: '' })], '010101')).toEqual({
      mesmaUnidade: ['A1'],
      outraUnidade: []
    });
  });
});
