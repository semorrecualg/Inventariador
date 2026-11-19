// ============================================================================
// conferidoExportacao.test.ts — a exportação lê a conferência pelo predicado.
//
// O Excel de auditoria do App (`AUDITOR_DE_PARA` / `AUDITOR_STATUS_CONFERENCIA`)
// e o do painel (`GBR_AUDIT`) decidiam a conferência com `a._conferido ? …`.
// A flag chega como 1/0, como `'1'`/`true` de um JSON reimportado, ou nem chega:
// uma planilha já conferida traz só `AUDITOR_STATUS_CONFERENCIA = 'SIM'`. Nesses
// casos a exportação escrevia PENDENTE/NAO num item que TODOS os ecrãs mostram
// como conferido — e o ficheiro é a prova que sai para fora.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isConferido } from '../utils/conferencia';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

/** Código sem comentários: um comentário pode citar o padrão antigo. */
const semComentarios = (fonte: string): string =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** O corpo de `handleExport`, de `const handleExport` até à escrita do ficheiro. */
const blocoDeExportacao = (rel: string): string => {
  const fonte = readFileSync(join(srcRoot, rel), 'utf8');
  const inicio = fonte.indexOf('const handleExport');
  expect(inicio, `${rel} já não tem handleExport`).toBeGreaterThan(-1);
  const fim = fonte.indexOf('XLSX.writeFile', inicio);
  expect(fim, `${rel}: handleExport já não escreve o ficheiro`).toBeGreaterThan(inicio);
  return semComentarios(fonte.slice(inicio, fim));
};

describe('exportação — a conferência vem do predicado único', () => {
  const EXPORTACOES = ['App.tsx', 'components/Dashboard.tsx'];

  it('os dois exports chamam `isConferido` e não leem a flag crua', () => {
    for (const rel of EXPORTACOES) {
      const bloco = blocoDeExportacao(rel);
      expect(bloco, `${rel} deixou de usar o predicado`).toContain('isConferido(a)');
      expect(bloco, `${rel} volta a ler a flag crua`).not.toContain('_conferido');
      expect(bloco, `${rel}: AUDITOR_STATUS_CONFERENCIA fora do predicado`)
        .toMatch(/AUDITOR_STATUS_CONFERENCIA'\]\s*=\s*conferido\s*\?\s*'SIM'\s*:\s*'NAO'/);
      expect(bloco, `${rel}: AUDITOR_DE_PARA fora do predicado`)
        .toMatch(/AUDITOR_DE_PARA'\]\s*=\s*[^;\n]*conferido\s*\?/);
    }
  });

  it('um ativo conferido só pela coluna de auditoria sai conferido', () => {
    // Era exatamente esta linha que o `a._conferido ?` da exportação negava.
    const daPlanilha = { _conferido: 0, AUDITOR_STATUS_CONFERENCIA: 'SIM', endereco: 'A-01' };
    expect(daPlanilha._conferido ? 'SIM' : 'NAO', 'o comportamento antigo').toBe('NAO');
    expect(isConferido(daPlanilha) ? 'SIM' : 'NAO').toBe('SIM');
  });

  it('as escritas legadas da flag também saem conferidas', () => {
    for (const flag of [1, '1', true, 'true']) {
      expect(isConferido({ _conferido: flag }) ? 'SIM' : 'NAO', `flag ${String(flag)}`).toBe('SIM');
    }
    for (const flag of [0, '0', false, undefined, null]) {
      expect(isConferido({ _conferido: flag }) ? 'SIM' : 'NAO', `flag ${String(flag)}`).toBe('NAO');
    }
  });
});
