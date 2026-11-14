// ============================================================================
// syncBadge.test.ts — o selo do cartão só fala do trabalho do auditor
//
// `_is_synced = 1` quer dizer "esta linha está igual à nuvem". Depois de um
// pull, TODOS os ativos da unidade ficam assim — inclusive os que ninguém
// conferiu. Mostrar "Sincronizado" neles fazia parecer que o app tinha subido
// a base inteira para a nuvem.
// ============================================================================
import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import { syncBadgeState } from '../utils/syncBadge';

const ativo = (over: Partial<Asset> = {}): Asset => ({
  etiqueta: '008491',
  _conferido: false,
  _is_synced: 1,
  ...over,
} as Asset);

describe('syncBadgeState', () => {
  it('ativo da base vindo da nuvem, nunca conferido, não tem selo', () => {
    expect(syncBadgeState(ativo())).toBeNull();
  });

  it('ativo conferido e na nuvem mostra Sincronizado', () => {
    expect(syncBadgeState(ativo({ _conferido: true, _is_synced: 1 }))).toBe('sincronizado');
  });

  it('ativo conferido e ainda fora da nuvem mostra Pendente Nuvem', () => {
    expect(syncBadgeState(ativo({ _conferido: true, _is_synced: 0 }))).toBe('pendente');
  });

  it('base importada ainda não espelhada mostra Pendente Nuvem', () => {
    expect(syncBadgeState(ativo({ _conferido: false, _is_synced: 0 }))).toBe('pendente');
  });

  it('tolera _conferido/_is_synced gravados como 1/0 no Dexie', () => {
    expect(syncBadgeState(ativo({ _conferido: 1 as unknown as boolean, _is_synced: 1 }))).toBe('sincronizado');
    expect(syncBadgeState(ativo({ _conferido: 0 as unknown as boolean, _is_synced: 0 }))).toBe('pendente');
    expect(syncBadgeState(ativo({ _conferido: 0 as unknown as boolean, _is_synced: 1 }))).toBeNull();
  });

});
