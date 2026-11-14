import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * O gate `npm run check:docs` (scripts/check-docs.cjs) existe para o CI falhar
 * quando um doc aponta para um ficheiro que não existe. Aqui testa-se o próprio
 * gate contra uma pasta temporária (o script aceita a raiz como argumento).
 */
const scriptPath = fileURLToPath(new URL('../../scripts/check-docs.cjs', import.meta.url));

function runAgainst(docContent: string) {
  const root = mkdtempSync(join(tmpdir(), 'check-docs-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'exemplo.md'), docContent, 'utf8');
  return spawnSync(process.execPath, [scriptPath, root], { encoding: 'utf8' });
}

describe('check-docs — gate de referências dos docs', () => {
  it('referência quebrada falha (exit 1) e aponta o ficheiro culpado', () => {
    const result = runAgainst('Veja `src/nao-existe-xyz.ts` para o detalhe.\n');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[FALHA]');
    expect(result.stderr).toContain('src/nao-existe-xyz.ts');
    expect(result.stderr).toContain('docs/exemplo.md');
  });

  it('referência planeada passa (exit 0) — não é link quebrado', () => {
    const result = runAgainst('Artefacto a criar: `scripts/nao-existe-xyz.sql`.\n');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[ OK ]');
    expect(result.stderr).toBe('');
  });

  it('palavra "Criar" longe da referência não isenta (regra apertada)', () => {
    const result = runAgainst('Criar isto mais tarde. O ficheiro é `src/nao-existe-xyz.ts`.\n');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/nao-existe-xyz.ts');
  });

  it('a palavra "criado" ao lado da referência não isenta', () => {
    const result = runAgainst('Este doc foi criado com `src/nao-existe-xyz.ts` no texto.\n');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/nao-existe-xyz.ts');
  });

  it('a palavra "removido" ao lado da referência não isenta', () => {
    const result = runAgainst('O antigo `src/nao-existe-xyz.ts` foi removido.\n');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/nao-existe-xyz.ts');
  });

  it('link markdown relativo quebrado também falha', () => {
    const result = runAgainst('[quebrado](docs/nao-existe-abc.md)\n');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/nao-existe-abc.md');
  });

  it('valida documentos fora da árvore indicados com --extra', () => {
    // É assim que o AGENTS.md da raiz entra quando o gate corre contra o app.
    const root = mkdtempSync(join(tmpdir(), 'check-docs-'));
    writeFileSync(join(root, 'vazio.md'), '# Vazio\n', 'utf8');
    const extraDir = mkdtempSync(join(tmpdir(), 'check-docs-extra-'));
    const extra = join(extraDir, 'AGENTS.md');
    writeFileSync(extra, 'Ver `src/nao-existe-xyz.ts`.\n', 'utf8');

    const result = spawnSync(process.execPath, [scriptPath, root, '--extra', extra], { encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/nao-existe-xyz.ts');
    expect(result.stderr).toContain('AGENTS.md');
  });

  it('resolve nomes soltos do extra contra a raiz onde ele vive', () => {
    // `ci.yml` só existe em `.github/workflows/`: com a raiz apontada ao app, o
    // índice de nomes soltos (e a resolução) tem de incluir a raiz do extra.
    const base = mkdtempSync(join(tmpdir(), 'check-docs-repo-'));
    mkdirSync(join(base, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(base, '.github', 'workflows', 'ci.yml'), 'name: CI\n', 'utf8');
    writeFileSync(join(base, 'AGENTS.md'), 'CI em `ci.yml`.\n', 'utf8');
    const app = join(base, 'app');
    mkdirSync(app);
    writeFileSync(join(app, 'vazio.md'), '# Vazio\n', 'utf8');

    const result = spawnSync(
      process.execPath,
      [scriptPath, app, '--extra', join(base, 'AGENTS.md')],
      { encoding: 'utf8' }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[ OK ]');
  });

  it('doc sem referências passa', () => {
    const result = runAgainst('# Título\n\nTexto simples, sem caminhos.\n');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[ OK ]');
  });
});
