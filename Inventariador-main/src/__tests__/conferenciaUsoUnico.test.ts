// ============================================================================
// conferenciaUsoUnico.test.ts — a regra de conferido não volta a ser copiada.
//
// O mapa, o painel, a ficha, os PDFs e a ficha de impressão tinham cada um a
// sua cópia da regra (`_conferido` ou a coluna de auditoria). Passaram todos a
// ler `utils/conferencia.ts`; este gate impede que a próxima cópia entre sem
// que se repare nisso.
//
// A lista de exceções foi podada até ao fim: o App, o Dashboard, o Inventory, o
// tagService e o supabaseService já leem o predicado, e a coluna de auditoria
// deixou de ser comparada a 'SIM' fora dele. Só o `status` textual com CONFERIDO
// continua a ser lido onde pertence (o marcador legado do contrato).
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = fileURLToPath(new URL('..', import.meta.url));
const conferencia = join(srcRoot, 'utils', 'conferencia.ts');

/** A cópia integral da regra: flag local encadeada com a coluna de auditoria. */
const COPIA_DA_REGRA =
  /AUDITOR_STATUS_CONFERENCIA\s*\|\|\s*(?:''|"")\s*\)?\s*\.toUpperCase\(\)\s*===\s*'SIM'/;

/** A coluna de auditoria comparada a 'SIM' por conta própria. */
const REGRA_NA_COLUNA = /AUDITOR_STATUS_CONFERENCIA[^\n]*(?:===|!==|==|!=)\s*['"]SIM['"]/i;

function ficheirosFonte(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entrada => {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      return entrada.name === '__tests__' ? [] : ficheirosFonte(caminho);
    }
    return /\.tsx?$/.test(entrada.name) ? [caminho] : [];
  });
}

const foraDoPredicado = (regex: RegExp): string[] =>
  ficheirosFonte(srcRoot)
    .filter(ficheiro => ficheiro !== conferencia)
    .filter(ficheiro => regex.test(readFileSync(ficheiro, 'utf8')))
    .map(ficheiro => ficheiro.slice(srcRoot.length).replace(/^[\\/]/, ''));

describe('regra de conferido — definição única', () => {
  it('nenhum ficheiro de src/ repete a regra à mão', () => {
    expect(foraDoPredicado(COPIA_DA_REGRA)).toEqual([]);
  });

  it('a coluna de auditoria não é comparada a SIM fora do predicado', () => {
    expect(foraDoPredicado(REGRA_NA_COLUNA)).toEqual([]);
  });

  it('o predicado continua a ser o único lugar com a regra completa', () => {
    const fonte = readFileSync(conferencia, 'utf8');

    expect(COPIA_DA_REGRA.test(fonte)).toBe(true);
  });
});
