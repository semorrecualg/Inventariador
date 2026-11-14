// @vitest-environment node
// ============================================================================
// checkTestCounts.test.ts — o gate `check:test-counts` (parte de `check:docs`).
//
// A contagem real vem do Vitest; aqui injecta-se com `--tests/--files` para não
// correr a suíte dentro da suíte. Os documentos são uma raiz temporária, por isso
// o teste não depende do número real (que muda a cada teste novo).
// ============================================================================
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SCRIPT = resolve(__dirname, '../../scripts/check-test-counts.cjs');

let raiz: string;

const escrever = (relativo: string, conteudo: string) => {
  const caminho = join(raiz, relativo);
  mkdirSync(join(caminho, '..'), { recursive: true });
  writeFileSync(caminho, conteudo, 'utf8');
};

const correr = (args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, raiz, ...args], { encoding: 'utf8' });

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'gbr-counts-'));
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

describe('check:test-counts', () => {
  it('passa quando os docs dizem a contagem certa, nas duas ordens', () => {
    escrever('README.md', '| `npm test` | Vitest — 844 testes / 94 arquivos |\n');
    escrever('docs/SPEC.md', '| Testes | Vitest (94 arquivos / 844 testes) |\n- **Vitest:** 844 testes / 94 arquivos\n');

    const r = correr(['--tests', '844', '--files', '94']);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('844 testes / 94 arquivos');
  });

  it('falha quando só o total de testes está velho, apontando ficheiro e linha', () => {
    escrever('SKILL.md', 'linha 1\n`npx vitest run` (**295 testes / 30 arquivos**)\n');

    const r = correr(['--tests', '844', '--files', '94']);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('SKILL.md:2');
    expect(r.stderr).toContain('295 testes / 30 arquivos');
  });

  it('apanha a forma "adapta (N testes)" e a ordem invertida', () => {
    escrever('docs/ARCHITECTURE.md', '`countAtivosByTenant` (30 arquivos / 295 testes).\n');

    const r = correr(['--tests', '844', '--files', '94']);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/ARCHITECTURE.md:1');
  });

  it('apanha a forma "`npx vitest run` (N testes)" dos passos de validação', () => {
    escrever('docs/ARCHITECTURE.md', '5. **Valide**: `npx tsc --noEmit` + `npx vitest run` (366 testes).\n');

    const r = correr(['--tests', '844', '--files', '94']);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/ARCHITECTURE.md:1');
    expect(r.stderr).toContain('366 testes');
  });

  it('aceita a mesma forma com a contagem certa', () => {
    escrever('docs/ARCHITECTURE.md', '5. **Valide**: `npx vitest run` (844 testes).\n');

    const r = correr(['--tests', '844', '--files', '94']);

    expect(r.status).toBe(0);
  });

  it('detecta contagem errada mesmo quando os ficheiros não existem', () => {
    escrever('docs/GOVERNANCA.md', '| `npm test` | **844 testes / 94 arquivos** verdes |\n');

    const r = correr(['--tests', '844', '--files', '95']);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/GOVERNANCA.md:1');
  });

  it('ignora documentos fora do escopo (histórico não é afirmação do presente)', () => {
    escrever('CHANGELOG.md', '- **Testes:** 295/295 (30 arquivos)\n');
    escrever('docs/MIGRACAO_HIBRIDA.md', '295 testes verdes (30 arquivos)\n');

    const r = correr(['--tests', '844', '--files', '94']);

    expect(r.status).toBe(0);
  });

  it('ignora placeholders e não confunde contagem por ficheiro com a total', () => {
    escrever('README.md', '| `npm test` | Vitest — N testes / M arquivos |\n');
    escrever('docs/SPEC.md', '`src/__tests__/rbacService.test.ts` — 12 testes travando a matriz\n');

    const r = correr(['--tests', '844', '--files', '94']);

    expect(r.status).toBe(0);
  });
});
