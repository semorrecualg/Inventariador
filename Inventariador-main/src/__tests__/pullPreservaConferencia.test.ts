// src/__tests__/pullPreservaConferencia.test.ts
// ============================================================================
// O PULL NÃO DESFAZ A CONFERÊNCIA FEITA NO APARELHO
//
// Mesmo defeito de classe do carimbo da falha (#119): o merge do pull remontava
// a linha da nuvem e deixava cair a decisão de conferência do registo local.
// Bastava a linha da nuvem chegar com `_conferido = 0` (ou sem `data_leitura`)
// para o item conferido no campo voltar a «por conferir» no ciclo seguinte.
// A decisão passa a ser tomada por TEMPO (`_dataLeitura`, e o toque
// `_lastUpdated` quando a decisão foi desmarcar), nunca por omissão.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { preservarPendenciaLocal } from '../utils/pendencia';
import { isConferido } from '../utils/conferencia';

type Registo = Record<string, unknown>;

/** A linha que desceu da nuvem (já mapeada para o vocabulário do app). */
const daNuvem = (over: Registo = {}): Registo => ({
  id: 'PK-1',
  primarykey: 'PK-1',
  etiqueta: '007222',
  status: 'PENDENTE',
  _conferido: false,
  ...over,
});

/** A cópia deste aparelho, com alteração por subir. */
const doAparelho = (over: Registo = {}): Registo => ({
  ...daNuvem(),
  _is_synced: 0,
  ...over,
});

/** O merge do pull, como o App o faz. */
const comPull = (nuvem: Registo, local: Registo): Registo => ({
  ...nuvem,
  ...preservarPendenciaLocal(local, nuvem),
});

describe('pull — a conferência do aparelho sobrevive à linha da nuvem', () => {
  it('o desmarcar do aparelho não regressa conferido', () => {
    const nuvem = daNuvem({
      status: 'CONFERIDO',
      _conferido: true,
      _auditor: 'outro.auditor@gbr.com.br',
      _dataLeitura: '2026-11-19T08:00:00.000Z',
    });
    const aparelho = doAparelho({
      status: 'PENDENTE',
      _conferido: false,
      _dataLeitura: undefined,
      AUDITOR_STATUS_CONFERENCIA: 'NAO',
      _lastUpdated: '2026-11-20T10:00:00.000Z',
    });

    const depois = comPull(nuvem, aparelho);

    expect(isConferido(depois)).toBe(false);
    expect(depois.status).toBe('PENDENTE');
    expect(depois.AUDITOR_STATUS_CONFERENCIA).toBe('NAO');
    // A data da leitura antiga não pode ficar de pé ao lado de «não conferido».
    expect(Object.prototype.hasOwnProperty.call(depois, '_dataLeitura')).toBe(true);
    expect(depois._dataLeitura).toBeUndefined();
  });

  it('a marca do aparelho mantém autor e data da leitura', () => {
    const nuvem = daNuvem({ _conferido: false });
    const aparelho = doAparelho({
      status: 'CONFERIDO',
      _conferido: true,
      _auditor: 'semorr@gmail.com',
      _dataLeitura: '2026-11-20T09:30:00.000Z',
    });

    const depois = comPull(nuvem, aparelho);

    expect(isConferido(depois)).toBe(true);
    expect(depois._auditor).toBe('semorr@gmail.com');
    expect(depois._dataLeitura).toBe('2026-11-20T09:30:00.000Z');
  });

  it('a marca local sem data de leitura usa o toque como prova', () => {
    const nuvem = daNuvem({ _conferido: false });
    const aparelho = doAparelho({
      _conferido: true,
      _auditor: 'semorr@gmail.com',
      _lastUpdated: '2026-11-20T09:30:00.000Z',
    });

    const depois = comPull(nuvem, aparelho);

    expect(isConferido(depois)).toBe(true);
    expect(depois._auditor).toBe('semorr@gmail.com');
  });

  it('a conferência da nuvem posterior ao toque continua a ganhar', () => {
    const nuvem = daNuvem({
      status: 'CONFERIDO',
      _conferido: true,
      _auditor: 'outro.auditor@gbr.com.br',
      _dataLeitura: '2026-11-20T11:00:00.000Z',
    });
    const aparelho = doAparelho({
      _conferido: false,
      AUDITOR_STATUS_CONFERENCIA: 'NAO',
      _lastUpdated: '2026-11-20T09:00:00.000Z',
    });

    const depois = comPull(nuvem, aparelho);

    expect(isConferido(depois)).toBe(true);
    expect(depois._auditor).toBe('outro.auditor@gbr.com.br');
    expect(depois._dataLeitura).toBe('2026-11-20T11:00:00.000Z');
  });

  it('conferência igual dos dois lados fica com a leitura mais recente', () => {
    const nuvem = daNuvem({
      status: 'CONFERIDO',
      _conferido: true,
      _auditor: 'semorr@gmail.com',
      _dataLeitura: '2026-11-19T08:00:00.000Z',
    });
    const aparelho = doAparelho({
      status: 'CONFERIDO',
      _conferido: true,
      _auditor: 'semorr@gmail.com',
      _dataLeitura: '2026-11-20T12:00:00.000Z',
    });

    const depois = comPull(nuvem, aparelho);

    expect(depois._dataLeitura).toBe('2026-11-20T12:00:00.000Z');
  });

  it('sem data de nenhum dos lados não se inventa uma decisão', () => {
    const nuvem = daNuvem({ status: 'CONFERIDO', _conferido: true });
    const aparelho = doAparelho({
      _conferido: false,
      AUDITOR_STATUS_CONFERENCIA: 'NAO',
    });

    const depois = comPull(nuvem, aparelho);

    expect(isConferido(depois)).toBe(true);
    expect(preservarPendenciaLocal(aparelho, nuvem)).not.toHaveProperty('_conferido');
  });

  it('com a nuvem já desmarcada não há decisão a repor', () => {
    const nuvem = daNuvem({ _conferido: false });
    const aparelho = doAparelho({
      _conferido: false,
      AUDITOR_STATUS_CONFERENCIA: 'NAO',
      _lastUpdated: '2026-11-20T10:00:00.000Z',
    });

    expect(preservarPendenciaLocal(aparelho, nuvem)).toEqual({
      _is_synced: 0,
      _lastUpdated: '2026-11-20T10:00:00.000Z',
    });
  });
});

describe('pull — a conferência não é decidida por omissão', () => {
  it('o merge passa a linha da nuvem à decisão da conferência', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');

    expect(fonte).toContain('preservarPendenciaLocal(local, cloudAsset)');
    expect(fonte).not.toContain('preservarPendenciaLocal(local._lastUpdated');
  });

  it('a regra da conferência vive num só sítio', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'utils', 'pendencia.ts'), 'utf8');

    expect(fonte).toContain('conferenciaLocalVenceNuvem(local, nuvem)');
    expect(fonte).toContain('preservarConferenciaLocal(local)');
  });
});
