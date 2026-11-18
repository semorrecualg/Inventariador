// ============================================================================
// conferencia.test.ts — «conferido» tem uma só definição no app.
//
// A conferência chega pela flag local `_conferido` (booleano ou 1/0) e pela
// coluna de auditoria da base (`AUDITOR_STATUS_CONFERENCIA === 'SIM'`). O selo
// de sincronização e o cartão do ativo passaram a ler esta mesma função.
// ============================================================================
import { describe, it, expect } from 'vitest';
import type { Asset } from '../types';
import { isConferido } from '../utils/conferencia';

const ativo = (over: Record<string, unknown> = {}): Asset =>
  ({
    id: 'A1',
    etiqueta: '008491',
    _is_synced: 1,
    ...over
  }) as unknown as Asset;

describe('isConferido', () => {
  it('reconhece a flag local como booleano, do Dexie, e como 1/0 do SQLite', () => {
    expect(isConferido(ativo({ _conferido: true }))).toBe(true);
    expect(isConferido(ativo({ _conferido: 1 }))).toBe(true);
    expect(isConferido(ativo({ _conferido: false }))).toBe(false);
    expect(isConferido(ativo({ _conferido: 0 }))).toBe(false);
    expect(isConferido(ativo())).toBe(false);
  });

