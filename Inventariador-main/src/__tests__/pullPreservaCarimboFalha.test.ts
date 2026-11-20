// ============================================================================
// pullPreservaCarimboFalha.test.ts — descer a base não apaga o selo vermelho.
//
// O merge do pull remonta a linha com a versão da nuvem (que não traz campos
// locais) e junta a pendência que já existia. Enquanto só preservava
// `_is_synced`/`_lastUpdated`, cada descarga apagava `_syncFailAt` e
// `_syncFailReason`: o cartão voltava a âmbar «na fila» e o motivo da recusa
// desaparecia até à tentativa seguinte falhar outra vez — num aparelho que
// descarrega a base com frequência, o alerta podia quase nunca aparecer.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preservarPendenciaLocal } from '../utils/pendencia';
import { syncFailureInfo } from '../utils/syncFalha';

const AGORA = Date.parse('2026-11-19T12:00:00.000Z');
const FALHA_EM = '2026-11-19T10:00:00.000Z';
const MOTIVO = 'Erro Supabase: [42501] RLS negou o upsert';

const localPendenteComFalha = {
  _is_synced: 0,
  _lastUpdated: '2026-11-19T09:30:00.000Z',
  _syncFailAt: FALHA_EM,
  _syncFailReason: MOTIVO,
};

/** O merge do pull, como `App.tsx` o faz. */
const linhaDepoisDoPull = (
  cloudAsset: Record<string, unknown>,
  local: Record<string, unknown>
): Record<string, unknown> => ({ ...cloudAsset, ...preservarPendenciaLocal(local) });

describe('o pull da nuvem não apaga o carimbo de falha', () => {
  it('preserva a data do toque e o carimbo da recusa', () => {
    expect(preservarPendenciaLocal(localPendenteComFalha)).toEqual({
      _is_synced: 0,
      _lastUpdated: '2026-11-19T09:30:00.000Z',
      _syncFailAt: FALHA_EM,
      _syncFailReason: MOTIVO,
    });
  });

  it('depois de descer da base o ativo continua a declarar a falha', () => {
    // A linha da nuvem chega sem os campos locais (não existem lá).
    const cloudAsset = {
      id: 'PK-1',
      primarykey: 'PK-1',
      _conferido: false,
      _is_synced: 1,
    };

    const depois = linhaDepoisDoPull(cloudAsset, localPendenteComFalha);

    expect(depois._is_synced).toBe(0);
    expect(syncFailureInfo(depois, AGORA)).toEqual({ motivo: MOTIVO, idade: 'há 2 h' });
  });

  it('um registo que nunca falhou continua sem carimbo', () => {
    const depois = linhaDepoisDoPull(
      { id: 'PK-2', _is_synced: 1 },
      { _is_synced: 0, _lastUpdated: '2026-11-19T09:30:00.000Z' }
    );

    expect(depois._syncFailAt).toBeUndefined();
    expect(depois._syncFailReason).toBeUndefined();
    expect(syncFailureInfo(depois, AGORA)).toBeNull();
  });

  it('não copia um motivo órfão, sem data de falha', () => {
    expect(preservarPendenciaLocal({ _syncFailReason: MOTIVO })).toEqual({ _is_synced: 0 });
  });

  it('não transforma campos vazios ou de outro tipo em carimbo', () => {
    expect(
      preservarPendenciaLocal({ _syncFailAt: '   ', _syncFailReason: 'RLS' })
    ).toEqual({ _is_synced: 0 });
    expect(preservarPendenciaLocal({ _syncFailAt: 123 as unknown as string })).toEqual({
      _is_synced: 0,
    });
  });

  it('o merge do pull parte do registo local inteiro, não só da data', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');

    expect(fonte).toContain('preservarPendenciaLocal(local, cloudAsset)');
    expect(fonte).not.toContain('preservarPendenciaLocal(local._lastUpdated');
  });
});
