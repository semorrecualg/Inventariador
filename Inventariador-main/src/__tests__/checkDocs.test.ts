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

  it('link markdown relativo quebrado também falha', () => {
    const result = runAgainst('[quebrado](docs/nao-existe-abc.md)\n');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/nao-existe-abc.md');
  });

  it('doc sem referências passa', () => {
    const result = runAgainst('# Título\n\nTexto simples, sem caminhos.\n');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[ OK ]');
  });
});
