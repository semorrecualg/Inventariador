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
import { syncBadgeState, syncPendingInfo, formatPendingAge } from '../utils/syncBadge';

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

// «Pendente Nuvem» sozinho não distingue uma conferência por enviar de uma base
// nunca espelhada, nem uma pendência de minutos de uma esquecida há dias.
describe('syncPendingInfo', () => {
  const AGORA = Date.parse('2026-11-18T12:00:00.000Z');
  const haHoras = (n: number) => new Date(AGORA - n * 3600 * 1000).toISOString();

  it('conferência por enviar mostra motivo e idade da leitura', () => {
    const info = syncPendingInfo(
      ativo({ _conferido: true, _is_synced: 0, _dataLeitura: haHoras(2) }),
      AGORA
    );
    expect(info).toEqual({ motivo: 'conferência por enviar', idade: 'há 2 h' });
  });

  it('base nunca espelhada mostra motivo próprio e idade da última alteração', () => {
    const info = syncPendingInfo(
      ativo({ _conferido: false, _is_synced: 0, _lastUpdated: new Date(AGORA - 3 * 86400 * 1000).toISOString() }),
      AGORA
    );
    expect(info).toEqual({ motivo: 'base por espelhar', idade: 'há 3 d' });
  });

  it('sem data no registo mostra o motivo mas não inventa idade', () => {
    const info = syncPendingInfo(ativo({ _conferido: false, _is_synced: 0 }), AGORA);
    expect(info).toEqual({ motivo: 'base por espelhar', idade: null });
  });

  it('não há detalhe quando o selo está sincronizado ou ausente', () => {
    expect(syncPendingInfo(ativo({ _conferido: true, _is_synced: 1 }), AGORA)).toBeNull();
    expect(syncPendingInfo(ativo({ _conferido: false, _is_synced: 1 }), AGORA)).toBeNull();
  });
});

describe('formatPendingAge', () => {
  const AGORA = Date.parse('2026-11-18T12:00:00.000Z');

  it('arredonda para baixo e escolhe a unidade', () => {
    expect(formatPendingAge(new Date(AGORA - 30 * 1000).toISOString(), AGORA)).toBe('agora');
    expect(formatPendingAge(new Date(AGORA - 5 * 60 * 1000).toISOString(), AGORA)).toBe('há 5 min');
    expect(formatPendingAge(new Date(AGORA - 59 * 60 * 1000).toISOString(), AGORA)).toBe('há 59 min');
    expect(formatPendingAge(new Date(AGORA - 90 * 60 * 1000).toISOString(), AGORA)).toBe('há 1 h');
    expect(formatPendingAge(new Date(AGORA - 25 * 3600 * 1000).toISOString(), AGORA)).toBe('há 1 d');
  });

  it('relógio atrasado não produz idade negativa', () => {
    expect(formatPendingAge(new Date(AGORA + 3600 * 1000).toISOString(), AGORA)).toBe('agora');
  });

  it('data ausente ou inválida não gera texto', () => {
    expect(formatPendingAge(undefined, AGORA)).toBeNull();
    expect(formatPendingAge('', AGORA)).toBeNull();
    expect(formatPendingAge('não é data', AGORA)).toBeNull();
  });
});
