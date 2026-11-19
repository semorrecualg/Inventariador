// ============================================================================
// syncFalha.test.ts — carimbo da recusa da nuvem no registo local.
//
// «Pendente Nuvem» não dizia se o registo esperava a sua vez ou se a nuvem o
// tinha recusado. O carimbo é o que dá ao cartão e ao botão global essa
// diferença — e não pode ser reescrito a cada ciclo de 60 s.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  SYNC_FAILURE_STAMP_WINDOW_MS,
  carimbarFalhaEnvio,
  resumirMotivoFalha,
  syncFailureInfo
} from '../utils/syncFalha';

const AGORA = new Date('2026-11-19T12:00:00.000Z').getTime();
const iso = (ms: number) => new Date(ms).toISOString();

describe('carimbarFalhaEnvio', () => {
  it('carimba um registo que nunca falhou', () => {
    const carimbo = carimbarFalhaEnvio(undefined, 'Erro Supabase: [42501] RLS negou', AGORA);

    expect(carimbo).toEqual({
      _syncFailAt: iso(AGORA),
      _syncFailReason: 'Erro Supabase: [42501] RLS negou'
    });
  });

  it('não reescreve dentro da janela com o mesmo motivo (o ciclo roda a cada 60 s)', () => {
    const carimbo = carimbarFalhaEnvio(
      { _syncFailAt: iso(AGORA - 60 * 1000), _syncFailReason: 'timeout' },
      'timeout',
      AGORA
    );

    expect(carimbo).toBeNull();
  });

  it('regista a nova tentativa quando o motivo muda', () => {
    const carimbo = carimbarFalhaEnvio(
      { _syncFailAt: iso(AGORA - 60 * 1000), _syncFailReason: 'timeout' },
      'coluna "conferido" não existe',
      AGORA
    );

    expect(carimbo?._syncFailAt).toBe(iso(AGORA));
    expect(carimbo?._syncFailReason).toContain('conferido');
  });

  it('regista a nova tentativa depois de a janela passar', () => {
    const carimbo = carimbarFalhaEnvio(
      { _syncFailAt: iso(AGORA - SYNC_FAILURE_STAMP_WINDOW_MS - 1), _syncFailReason: 'timeout' },
      'timeout',
      AGORA
    );

    expect(carimbo?._syncFailAt).toBe(iso(AGORA));
  });

  it('grava o motivo numa linha só e curto', () => {
    const carimbo = carimbarFalhaEnvio(undefined, `Erro   na\nnuvem: ${'x'.repeat(200)}`, AGORA);

    expect(carimbo?._syncFailReason.startsWith('Erro na nuvem:')).toBe(true);
    expect(carimbo?._syncFailReason).not.toContain('\n');
    expect((carimbo?._syncFailReason ?? '').length).toBeLessThanOrEqual(90);
  });

  it('um motivo vazio não deixa o selo sem texto', () => {
    expect(resumirMotivoFalha('   ')).toBe('erro sem detalhe');
  });
});

describe('syncFailureInfo', () => {
  it('sem carimbo não há aviso de falha', () => {
    expect(syncFailureInfo({}, AGORA)).toBeNull();
    expect(syncFailureInfo(null, AGORA)).toBeNull();
  });

  it('devolve o motivo e a idade da última recusa', () => {
    const info = syncFailureInfo(
      { _syncFailAt: iso(AGORA - 2 * 3600 * 1000), _syncFailReason: 'RLS negou o upsert' },
      AGORA
    );

    expect(info).toEqual({ motivo: 'RLS negou o upsert', idade: 'há 2 h' });
  });

  it('carimbo sem motivo legível não inventa texto', () => {
    const info = syncFailureInfo({ _syncFailAt: iso(AGORA - 5 * 60 * 1000) }, AGORA);

    expect(info).toEqual({ motivo: 'erro sem detalhe', idade: 'há 5 min' });
  });
});
