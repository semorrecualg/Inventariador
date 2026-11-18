// ============================================================================
// conferenciaUsoUnico.test.ts — a regra de conferido não volta a ser copiada.
//
// O mapa, o painel, a ficha, os PDFs e a ficha de impressão tinham cada um a
// sua cópia da regra (`_conferido` ou a coluna de auditoria). Passaram todos a
// ler `utils/conferencia.ts`; este gate impede que a próxima cópia entre sem
// que se repare nisso.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));
const conferencia = join(srcRoot, 'utils', 'conferencia.ts');

/** A cópia integral da regra: flag local encadeada com a coluna de auditoria. */
const COPIA_DA_REGRA =
  /AUDITOR_STATUS_CONFERENCIA\s*\|\|\s*(?:''|"")\)?\s*\.toUpperCase\(\)\s*===\s*'SIM'/;

/**
 * Cópias que já têm dono e ainda não entraram em `main`:
 * - App, Dashboard, Inventory e tagService vão no PR #107;
 * - supabaseService é o produtor/consumidor da coluna de auditoria, fora deste
 *   âmbito (o normalizador de linhas da nuvem).
 * Quando migrarem, a entrada sai daqui sem mais nenhum ajuste: o teste só falha
 * se aparecer uma cópia fora desta lista.
 */
const AINDA_MIGRANDO = new Set([
  'App.tsx',
  'components/Dashboard.tsx',
  'components/Inventory.tsx',
  'services/supabaseService.ts',
  'services/tagService.ts'
]);

function ficheirosFonte(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entrada => {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      return entrada.name === '__tests__' ? [] : ficheirosFonte(caminho);
    }
    return /\.tsx?$/.test(entrada.name) ? [caminho] : [];
  });
}

describe('regra de conferido — definição única', () => {
  it('nenhum ficheiro de src/ repete a regra à mão fora das cópias já mapeadas', () => {
    const culpados = ficheirosFonte(srcRoot)
      .filter(ficheiro => ficheiro !== conferencia)
      .filter(ficheiro => COPIA_DA_REGRA.test(readFileSync(ficheiro, 'utf8')))
      .map(ficheiro => ficheiro.slice(srcRoot.length).replace(/^[\\/]/, ''));

    expect(culpados.filter(ficheiro => !AINDA_MIGRANDO.has(ficheiro))).toEqual([]);
  });

  it('o predicado continua a ser o único lugar com a regra completa', () => {
    const fonte = readFileSync(conferencia, 'utf8');

    expect(COPIA_DA_REGRA.test(fonte)).toBe(true);
  });
});
