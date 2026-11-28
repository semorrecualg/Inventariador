import { describe, it, expect } from 'vitest';
import { localDaConferencia } from '../utils/assetAddress';

/**
 * «LOCAL ONDE FOI ENCONTRADO» NÃO PODE FICAR VAZIO
 * ============================================================================
 * A conferência pela ficha do ativo passou a gravar `_localMaster` por esta
 * regra; o inventário e o lote fazem-no no próprio patch. Precedência: local já
 * registado (não se reescreve) → endereço do inventário aberto → endereço do
 * ativo. Sem nada a afirmar, `null` — nunca um local inventado.
 */
describe('localDaConferencia', () => {
  it('não reescreve um local já registado', () => {
    expect(
      localDaConferencia({ _localMaster: 'CORREDOR B', endereco: 'ALMOX CENTRAL' }, 'ALMOX CENTRAL')
    ).toBeNull();
  });

  it('usa o endereço do inventário aberto quando o registo não tem local', () => {
    expect(localDaConferencia({ endereco: 'ALMOX CENTRAL' }, 'PV2 BATATA HEAD CONTROL')).toBe(
      'PV2 BATATA HEAD CONTROL'
    );
  });

  it('cai no endereço do próprio ativo quando não há inventário aberto', () => {
    expect(localDaConferencia({ endereco: 'ALMOX CENTRAL' }, '')).toBe('ALMOX CENTRAL');
    expect(localDaConferencia({ endereco: 'ALMOX CENTRAL' })).toBe('ALMOX CENTRAL');
  });

  it('devolve null sem local nenhum (não inventa endereço)', () => {
    expect(localDaConferencia({}, '   ')).toBeNull();
    expect(localDaConferencia({ _localMaster: '   ', endereco: '' }, null)).toBeNull();
  });
});
