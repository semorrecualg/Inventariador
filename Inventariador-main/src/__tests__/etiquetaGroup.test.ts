// ============================================================================
// etiquetaGroup.test.ts — conferência em lote SOMENTE pela etiqueta consultada.
//
// Lote é o conjunto de pendentes com a MESMA plaqueta (etiqueta) do item
// clicado/lido. O registro repetido (`FISIC2020`) não agrupa: ele junta
// sub-itens de plaquetas diferentes e o modal abria com itens que o auditor não
// consultou. A regra vale igual para o clique no item e para a leitura digitada.
// ============================================================================
import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import {
  addressKey,
  batchLabel,
  findBatchGroup,
  findBatchGroupBySearch,
  isBaixado,
  isConferido,
  plaquetaKey,
  registroKey,
  sameBatch,
  splitByAddress,
  unitKey
} from '../utils/etiquetaGroup';

const asset = (over: Record<string, unknown> = {}): Asset =>
  ({
    id: 'A1',
    etiqueta: '008491',
    registro: 'NFE2013010',
    filial: '010101 CICOPAL GO',
    endereco: 'RUA A',
    status: 'EM USO',
    descricaodoativo: 'ITEM',
    ...over
  }) as unknown as Asset;

const unidade = '010101 CICOPAL GO';

describe('chaves do lote', () => {
  it('normaliza plaqueta e registro e descarta placeholders', () => {
    expect(plaquetaKey(asset({ etiqueta: ' 008491 ' }))).toBe('008491');
    expect(plaquetaKey(asset({ etiqueta: 'etiquetar' }))).toBe('');
    expect(registroKey(asset({ registro: 'nfe2013010' }))).toBe('NFE2013010');
    expect(registroKey(asset({ registro: 'S/N' }))).toBe('');
    expect(registroKey(asset({ registro: '0' }))).toBe('');
    expect(registroKey(asset({ registro: '12' }))).toBe('');
  });

  it('reconhece conferido e baixado', () => {
    expect(isConferido(asset({ _conferido: 1 }))).toBe(true);
    expect(isConferido(asset({ AUDITOR_STATUS_CONFERENCIA: 'SIM' }))).toBe(true);
    expect(isConferido(asset())).toBe(false);
    expect(isBaixado(asset({ status: 'BAIXA PATRIMONIAL' }))).toBe(true);
    expect(isBaixado(asset({ databaixa: '01/2020' }))).toBe(true);
    expect(isBaixado(asset())).toBe(false);
  });

  it('unidade e endereço normalizados (_localMaster vence endereco)', () => {
    expect(unitKey(asset())).toBe('010101 CICOPAL GO');
    expect(addressKey(asset({ _localMaster: 'RUA B' }))).toBe('RUA B');
    expect(addressKey(asset())).toBe('RUA A');
  });

  it('sameBatch exige a mesma plaqueta — registro igual não basta', () => {
    expect(sameBatch(asset(), asset({ id: 'A2', etiqueta: '008491', registro: 'OUTRO' }))).toBe(true);
    expect(sameBatch(asset(), asset({ id: 'A2', etiqueta: '999', registro: 'NFE2013010' }))).toBe(false);
    expect(sameBatch(asset(), asset({ id: 'A2', etiqueta: '999', registro: 'OUTRO' }))).toBe(false);
  });
});

describe('findBatchGroup — clique e leitura passam a usar a mesma regra', () => {
  it('agrupa pela plaqueta, em endereços diferentes da mesma unidade', () => {
    const group = findBatchGroup(asset(), [
      asset(),
      asset({ id: 'A2', endereco: 'RUA B' }),
      asset({ id: 'A3', etiqueta: '999', registro: 'OUTRO' })
    ], unidade);
    expect(group.map(a => a.id)).toEqual(['A1', 'A2']);
  });

  it('NÃO agrupa pelo registro repetido com plaquetas diferentes', () => {
    // Caso real do ecrã: `PLAQUETA A 005830 · REGISTRO FISIC2020` abria 26 linhas
    // de etiqueta `FISIC2020`. Só a etiqueta consultada pode formar lote.
    const clicado = asset({ id: 'A1', etiqueta: 'A 005830', registro: 'FISIC2020' });
    const irmaosDeRegistro = [
      asset({ id: 'A2', etiqueta: 'FISIC2020', registro: 'FISIC2020' }),
      asset({ id: 'A3', etiqueta: 'FISIC2020', registro: 'FISIC2020', endereco: 'RUA Z' })
    ];
    expect(findBatchGroup(clicado, [clicado, ...irmaosDeRegistro], unidade)).toEqual([]);

    // E os irmãos da etiqueta `FISIC2020` formam lote entre si, sem o `A 005830`.
    const grupo = findBatchGroup(irmaosDeRegistro[0], [clicado, ...irmaosDeRegistro], unidade);
    expect(grupo.map(a => a.id)).toEqual(['A2', 'A3']);
  });

  it('não depende da coluna TAG_DUPLICIDADE da planilha', () => {
    const group = findBatchGroup(asset(), [asset(), asset({ id: 'A2' })], unidade);
    expect(group).toHaveLength(2);
    expect(asset().TAG_DUPLICIDADE).toBeUndefined();
  });

  it('ignora irmãos conferidos, baixados e de outra unidade', () => {
    const group = findBatchGroup(asset(), [
      asset(),
      asset({ id: 'A2', _conferido: 1 }),
      asset({ id: 'A3', status: 'BAIXA' }),
      asset({ id: 'A4', filial: '010105 CICOPAL PA' })
    ], unidade);
    // Sobra só o clicado: lote exige 2+ pendentes, então não abre modal.
    expect(group).toEqual([]);
  });

  it('sem irmão pendente não forma lote', () => {
    expect(findBatchGroup(asset(), [asset()], unidade)).toEqual([]);
    expect(findBatchGroup(asset({ etiqueta: 'ETIQUETAR', registro: '' }), [asset({ etiqueta: 'ETIQUETAR' })], unidade)).toEqual([]);
  });

  it('inclui o ativo clicado mesmo fora da lista filtrada, sem duplicar', () => {
    const clicado = asset({ id: 'FORA' });
    const group = findBatchGroup(clicado, [asset({ id: 'A2' })], unidade);
    expect(group.map(a => a.id)).toEqual(['FORA', 'A2']);

    const repetido = findBatchGroup(asset(), [asset(), asset({ id: 'A2' })], unidade);
    expect(repetido.filter(a => a.id === 'A1')).toHaveLength(1);
  });
});

describe('findBatchGroupBySearch — busca por trecho da etiqueta', () => {
  it('acha a etiqueta por conter o trecho digitado e junta irmãos de outros endereços', () => {
    const grupo = findBatchGroupBySearch('005830', [
      asset({ id: 'A1', etiqueta: 'A 005830', endereco: 'RUA A' }),
      asset({ id: 'A2', etiqueta: 'A 005830', endereco: 'RUA B' }),
      asset({ id: 'A3', etiqueta: 'A 005831', endereco: 'RUA C' })
    ], unidade);
    // Traz os dois do endereço do inventário e o de outro endereço; o 005831 fica de fora.
    expect(grupo.map(a => a.id)).toEqual(['A1', 'A2']);
  });

  it('ignora separadores do código digitado', () => {
    const grupo = findBatchGroupBySearch('a0058', [
      asset({ id: 'A1', etiqueta: 'A 005830' }),
      asset({ id: 'A2', etiqueta: 'A-005830' })
    ], unidade);
    expect(grupo.map(a => a.id)).toEqual(['A1', 'A2']);
  });

  it('não abre lote quando o trecho casa com etiquetas diferentes', () => {
    expect(findBatchGroupBySearch('005', [
      asset({ id: 'A1', etiqueta: 'A 005830' }),
      asset({ id: 'A2', etiqueta: 'B 005900' })
    ], unidade)).toEqual([]);
  });

  it('busca por registro não monta lote de plaquetas diferentes', () => {
    expect(findBatchGroupBySearch('FISIC2020', [
      asset({ id: 'A1', etiqueta: 'A 005830', registro: 'FISIC2020' }),
      asset({ id: 'A2', etiqueta: 'FISIC2020', registro: 'FISIC2020' })
    ], unidade)).toEqual([]);
  });

  it('ignora conferidos, baixados e de outra unidade', () => {
    expect(findBatchGroupBySearch('005830', [
      asset({ id: 'A1', etiqueta: 'A 005830' }),
      asset({ id: 'A2', etiqueta: 'A 005830', _conferido: 1 }),
      asset({ id: 'A3', etiqueta: 'A 005830', status: 'BAIXA' }),
      asset({ id: 'A4', etiqueta: 'A 005830', filial: '010105 CICOPAL PA' })
    ], unidade)).toEqual([]);
  });
});

describe('splitByAddress e rótulo do lote', () => {
  it('separa quem já está no endereço do inventário de quem vem de outro', () => {
    expect(splitByAddress([
      asset({ id: 'A1', endereco: 'RUA A' }),
      asset({ id: 'A2', endereco: 'RUA B' })
    ], 'RUA A')).toEqual({ noEndereco: ['A1'], outroEndereco: ['A2'] });
  });

  it('sem endereço selecionado tudo conta como no endereço', () => {
    expect(splitByAddress([asset({ id: 'A1' })], null)).toEqual({ noEndereco: ['A1'], outroEndereco: [] });
  });

  it('rótulo mostra só a etiqueta do lote', () => {
    expect(batchLabel([asset()])).toEqual({
      titulo: 'Plaqueta repetida',
      subtitulo: 'Plaqueta 008491'
    });
    // Etiqueta placeholder não forma lote: o rótulo não promete plaqueta nenhuma.
    expect(batchLabel([asset({ etiqueta: 'ETIQUETAR' })])).toEqual({
      titulo: 'Lote',
      subtitulo: ''
    });
  });
});
