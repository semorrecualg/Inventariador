// ============================================================================
// etiquetaGroup.test.ts — conferência em lote por plaqueta OU registro.
//
// O lote pode ser identificado pela plaqueta repetida ou pelo registro repetido
// (sub-itens diferentes, ex.: `NFE2013010`). A conferência item a item só
// agrupava com a coluna `TAG_DUPLICIDADE` da planilha (ausente na maioria) e
// exigia a mesma filial. Agora os dois caminhos (leitura digitada e clique)
// usam a mesma regra, dentro da unidade e em qualquer endereço.
// ============================================================================
import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import {
  addressKey,
  batchLabel,
  findBatchGroup,
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

  it('sameBatch reconhece plaqueta OU registro', () => {
    expect(sameBatch(asset(), asset({ id: 'A2', etiqueta: '008491', registro: 'OUTRO' }))).toBe(true);
    expect(sameBatch(asset(), asset({ id: 'A2', etiqueta: '999', registro: 'NFE2013010' }))).toBe(true);
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

  it('agrupa pelo registro repetido com sub-itens diferentes', () => {
    const group = findBatchGroup(asset(), [
      asset({ id: 'A1', etiqueta: '008620' }),
      asset({ id: 'A2', etiqueta: '008621', endereco: 'RUA Z' }),
      asset({ id: 'A3', etiqueta: '008622', registro: 'OUTRO' })
    ], unidade);
    // A1 e A2 compartilham o registro; A3 não.
    expect(group.map(a => a.id)).toEqual(['A1', 'A2']);
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

  it('rótulo mostra plaqueta e registro do lote', () => {
    expect(batchLabel([asset()])).toEqual({
      titulo: 'Plaqueta repetida',
      subtitulo: 'Plaqueta 008491 · Registro NFE2013010'
    });
    expect(batchLabel([asset({ etiqueta: 'ETIQUETAR' })])).toEqual({
      titulo: 'Registro repetido',
      subtitulo: 'Registro NFE2013010'
    });
  });
});
