// ============================================================================
// conferidoEscrita.test.ts — a DECISÃO de conferência tem uma escrita só.
//
// `marcarConferido`/`desmarcarConferido` vivem em `utils/conferencia.ts` e são
// o par que os ecrãs gravam. Antes cada sítio montava o patch à mão: uns
// gravavam `_conferido: 1`, outros `true`, uns carimbavam `_dataLeitura` e
// outros não. Foi essa dispersão que fez o desmarcar de um ecrã não resistir ao
// envio do outro.
//
// O gate lê os ficheiros que decidem conferência e falha se voltar a aparecer
// uma flag escrita à mão.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  alternarConferencia,
  desmarcarConferido,
  isConferido,
  marcarConferido
} from '../utils/conferencia';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

describe('marcarConferido — a marcação grava a flag e a data da leitura', () => {
  it('carimba a leitura quando o momento não é dado', () => {
    const patch = marcarConferido();

    expect(patch._conferido).toBe(true);
    expect(Number.isNaN(Date.parse(String(patch._dataLeitura)))).toBe(false);
  });

  it('respeita o momento recebido (os caminhos que já trazem a data não inventam outra)', () => {
    expect(marcarConferido('2026-03-15T12:00:00Z')).toEqual({
      _conferido: true,
      _dataLeitura: '2026-03-15T12:00:00Z'
    });
  });

  it('a marcação lê-se conferida pelo predicado', () => {
    expect(isConferido(marcarConferido('2026-03-15T12:00:00Z'))).toBe(true);
  });
});

describe('desmarcarConferido — apaga todas as provas de conferência', () => {
  it('limpa flag, marcador do status e coluna de auditoria', () => {
    expect(
      desmarcarConferido({
        _conferido: 1,
        status: 'CONFERIDO',
        AUDITOR_STATUS_CONFERENCIA: 'SIM'
      })
    ).toEqual({
      _conferido: false,
      _dataLeitura: undefined,
      status: 'PENDENTE',
      AUDITOR_STATUS_CONFERENCIA: 'NAO'
    });
  });

  it('não reescreve um status de outro teor', () => {
    expect(desmarcarConferido({ _conferido: true, status: 'EM USO' }).status).toBe('EM USO');
  });
});

describe('alternarConferencia — compõe os dois lados', () => {
  it('pendente → marca; conferido → desmarca', () => {
    const pendente = { _conferido: 0, status: 'PENDENTE' };
    expect(alternarConferencia(pendente, '2026-11-19T10:00:00.000Z')).toEqual(
      marcarConferido('2026-11-19T10:00:00.000Z')
    );

    const conferido = { _conferido: 1, status: 'CONFERIDO', AUDITOR_STATUS_CONFERENCIA: 'SIM' };
    expect(alternarConferencia(conferido)).toEqual(desmarcarConferido(conferido));
  });
});

describe('sítios que decidem conferência — ninguém grava a flag à mão', () => {
  /** Ficheiros onde a conferência é decidida (marcação ou desmarcação). */
  const ESCREVEM = [
    'App.tsx',
    'components/AccountReconciliation.tsx',
    'components/AssetDetail.tsx',
    'components/Inventory.tsx',
    'components/InventoryCard.tsx',
    'components/Labeling.tsx',
    'services/persistenceService.ts'
  ];

  /** `_conferido: true`, `_conferido: 1`, `x._conferido = true`, `… = 1`. */
  const ESCRITA_CRUA = /_conferido\s*:\s*(?:true|1)\b|_conferido\s*=\s*(?:true|1)\b/;

  /** Código sem comentários: um comentário pode citar a escrita antiga. */
  const semComentarios = (fonte: string): string =>
    fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('todos importam a escrita única e nenhum monta o patch à mão', () => {
    for (const rel of ESCREVEM) {
      const fonte = readFileSync(join(srcRoot, rel), 'utf8');

      expect(fonte, `${rel} deixou de usar a escrita única`).toMatch(
        /import \{[^}]*\b(?:marcarConferido|alternarConferencia)\b[^}]*\} from '.*conferencia'/
      );
      expect(
        ESCRITA_CRUA.test(semComentarios(fonte)),
        `${rel} grava a flag de conferência à mão`
      ).toBe(false);
    }
  });
});
