// @vitest-environment node
// ============================================================================
// checkNpmScripts.test.ts — o gate `check:npm-scripts` (parte de `check:docs`).
//
// Um `npm run x` documentado sem script no package.json falha com "Missing
// script" para quem segue o doc. Fixtures numa raiz temporária: o teste não
// depende dos scripts reais do projecto.
// ============================================================================
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SCRIPT = resolve(__dirname, '../../scripts/check-npm-scripts.cjs');

let raiz: string;

const escrever = (relativo: string, conteudo: string) => {
  const caminho = join(raiz, relativo);
  mkdirSync(join(caminho, '..'), { recursive: true });
  writeFileSync(caminho, conteudo, 'utf8');
};

const correr = (args: string[] = []) =>
  spawnSync(process.execPath, [SCRIPT, raiz, ...args], { encoding: 'utf8' });

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'gbr-npm-'));
  escrever('package.json', JSON.stringify({ scripts: { dev: 'vite', test: 'vitest' } }));
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

describe('check:npm-scripts', () => {
  it('aceita comandos que existem no package.json', () => {
    escrever('README.md', 'Corre `npm run dev` e depois `npm run test`.\n');

    const r = correr();

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('2 `npm run`');
  });

  it('falha com o comando inexistente, apontando ficheiro e linha', () => {
    escrever('docs/SPEC.md', 'linha 1\nBenchmarks: `npm run bench`.\n');

    const r = correr();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/SPEC.md:2');
    expect(r.stderr).toContain('npm run bench');
  });

  it('ignora documentos de histórico (retrato de uma entrega, não instrução)', () => {
    escrever('CHANGELOG.md', '- `npm run coverage` na altura.\n');
    escrever('docs/PLANO_FASE_C_HIGIENIZACAO.md', '- `npm run watch` então.\n');

    expect(correr().status).toBe(0);
  });

  it('verifica os documentos extra indicados com --extra', () => {
    const extraDir = mkdtempSync(join(tmpdir(), 'gbr-npm-extra-'));
    const extra = join(extraDir, 'AGENTS.md');
    writeFileSync(extra, 'Usa `npm run server`.\n', 'utf8');

    const r = correr(['--extra', extra]);
    rmSync(extraDir, { recursive: true, force: true });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('npm run server');
  });
});
