// ============================================================================
// normalizacaoLeituras.test.ts — a normalização do arranque é uma vez, não
// todas as vezes.
//
// Dois defeitos no mesmo bloco (`App.tsx`, arranque):
//   1. gravava a base inteira para corrigir as poucas linhas cuja
//      `_dataLeitura` era anterior a 15/03/2026;
//   2. escrevia `2026-03-15T12:00:00Z`, que no arranque seguinte voltava a ser
//      «anterior a 2026-03-16» — a base era reescrita em TODOS os arranques.
//
// A regra passou para `utils/normalizacaoLeitura`: idempotente (só normaliza o
// que ainda está antes do alvo) e com a lista das linhas alteradas, que é o que
// o arranque grava.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Asset } from '../types';
import {
  LEITURA_NORMALIZADA,
  normalizarLeiturasDeConferencia
} from '../utils/normalizacaoLeitura';

const ativo = (over: Record<string, unknown> = {}): Asset =>
  ({
    id: 'PK-1',
    primarykey: 'PK-1',
    tenantid: 'CICOPAL',
    filial: '010101 CICOPAL GO',
    etiqueta: '007222',
    status: 'CONFERIDO',
    _conferido: true,
    _dataLeitura: '2026-03-10T08:00:00.000Z',
    ...over
  }) as unknown as Asset;

describe('normalizarLeiturasDeConferencia — o alvo e a idempotência', () => {
  it('normaliza a leitura anterior ao alvo e devolve a linha em `alteradas`', () => {
    const base = [ativo()];

    const { assets, alteradas } = normalizarLeiturasDeConferencia(base);

    expect(assets[0]._dataLeitura).toBe(LEITURA_NORMALIZADA);
    expect(alteradas).toHaveLength(1);
    expect(alteradas[0]).toBe(assets[0]);
  });

  it('uma segunda passagem não altera nada — é o ciclo fechado', () => {
    const primeira = normalizarLeiturasDeConferencia([ativo()]);

    const segunda = normalizarLeiturasDeConferencia(primeira.assets);

    expect(segunda.alteradas).toEqual([]);
    expect(segunda.assets[0]).toBe(primeira.assets[0]);
  });

  it('não toca numa leitura já no alvo nem posterior a ele', () => {
    const noAlvo = ativo({ _dataLeitura: LEITURA_NORMALIZADA });
    const depois = ativo({ id: 'PK-2', primarykey: 'PK-2', _dataLeitura: '2026-03-15T18:00:00.000Z' });

    const { alteradas } = normalizarLeiturasDeConferencia([noAlvo, depois]);

    expect(alteradas).toEqual([]);
  });

  it('normaliza leitura ausente ou ilegível', () => {
    const semData = ativo({ _dataLeitura: undefined });
    const ilegivel = ativo({ id: 'PK-2', primarykey: 'PK-2', _dataLeitura: 'ontem' });

    const { alteradas } = normalizarLeiturasDeConferencia([semData, ilegivel]);

    expect(alteradas.map((linha) => linha._dataLeitura)).toEqual([
      LEITURA_NORMALIZADA,
      LEITURA_NORMALIZADA
    ]);
  });

  it('não mexe em ativos não conferidos', () => {
    const pendente = ativo({ _conferido: 0, status: 'PENDENTE' });

    const { assets, alteradas } = normalizarLeiturasDeConferencia([pendente]);

    expect(alteradas).toEqual([]);
    expect(assets[0]).toBe(pendente);
  });

  it('conferido só pela coluna de auditoria: canónico, sem inventar leitura', () => {
    const soAuditoria = ativo({
      _conferido: 0,
      AUDITOR_STATUS_CONFERENCIA: 'SIM',
      _dataLeitura: '2026-11-20T09:00:00.000Z'
    });

    const { alteradas } = normalizarLeiturasDeConferencia([soAuditoria]);

    expect(alteradas).toHaveLength(1);
    expect(alteradas[0]._conferido).toBe(true);
    expect(alteradas[0]._dataLeitura).toBe('2026-11-20T09:00:00.000Z');
  });

  it('numa base de 500 linhas devolve só as que mudaram', () => {
    const base = Array.from({ length: 500 }, (_, i) =>
      ativo({
        id: `PK-${i}`,
        primarykey: `PK-${i}`,
        _dataLeitura: i < 2 ? '2026-03-01T10:00:00.000Z' : '2026-11-20T09:00:00.000Z'
      })
    );

    const { alteradas } = normalizarLeiturasDeConferencia(base);

    expect(alteradas).toHaveLength(2);
    expect(alteradas.map((linha) => linha.id)).toEqual(['PK-0', 'PK-1']);
  });
});

describe('contrato do arranque — delta e regra única', () => {
  const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
  const codigo = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('o arranque usa a normalização partilhada', () => {
    expect(codigo).toContain('normalizarLeiturasDeConferencia(saved.assets)');
  });

  it('o arranque grava só as linhas normalizadas', () => {
    expect(codigo).toContain('saveInventory(saved, undefined, false, true)');
    expect(codigo).toContain('persistAssetsBatch(');
    expect(codigo).not.toContain('saveInventory(saved)');
  });

  it('a recuperação do JSON legado usa a mesma regra', () => {
    expect(codigo).toContain('normalizarLeiturasDeConferencia(parsed.assets)');
  });

  it('a data do alvo não vive no App', () => {
    expect(codigo).not.toContain("'2026-03-16'");
    expect(codigo).not.toContain("'2026-03-15T12:00:00Z'");
  });
});
