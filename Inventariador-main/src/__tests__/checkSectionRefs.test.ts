// @vitest-environment node
// ============================================================================
// checkSectionRefs.test.ts — o gate `check:section-refs` (parte de `check:docs`).
//
// Cobre a classe de erro que passou despercebida durante meses: uma referência
// «§N» que aponta para uma secção que não existe (ou que foi renumerada).
// Usa uma raiz temporária, para não depender do estado real dos docs.
// ============================================================================
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SCRIPT = resolve(__dirname, '../../scripts/check-section-refs.cjs');

let raiz: string;

const escrever = (relativo: string, conteudo: string) => {
  const caminho = join(raiz, relativo);
  mkdirSync(join(caminho, '..'), { recursive: true });
  writeFileSync(caminho, conteudo, 'utf8');
};

const correr = () => spawnSync(process.execPath, [SCRIPT, raiz], { encoding: 'utf8' });

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'gbr-secoes-'));
});

afterEach(() => {
  rmSync(raiz, { recursive: true, force: true });
});

describe('check:section-refs', () => {
  it('aceita referências que existem no próprio documento', () => {
    escrever('docs/ARCHITECTURE.md', '## 7. Fluxo\n\ntexto\n\n### 7.6 Schema\n\nVer §7.6 e § 7.\n');

    const r = correr();

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('2 referência(s)');
  });

  it('falha quando a secção citada não existe, apontando ficheiro e linha', () => {
    escrever('docs/ARCHITECTURE.md', '## 7. Fluxo\n\n### 7.6 Schema\n\nVer §7.9.\n');

    const r = correr();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/ARCHITECTURE.md:5');
    expect(r.stderr).toContain('§ 7.9');
  });

  it('resolve a referência num documento nomeado na linha', () => {
    escrever('docs/GOVERNANCA.md', '## 1. Um\n');
    escrever('docs/HIGIENIZACAO_ENDERECO.md', '## 6. Expansão\n\n### 6.7 Resultado\n');
    escrever('docs/PLANO.md', '## 1. Plano\n\n26/26 confirmadas — § 6.7 de `HIGIENIZACAO_ENDERECO.md`.\n');

    const r = correr();

    expect(r.status).toBe(0);
  });

  it('aceita a referência quando só o documento actual a tem, mesmo citando outro ao lado', () => {
    // É o caso real de GOVERNANCA: "`SCHEMA_BASELINE.md` — ver § 12", onde a §12
    // existe na governança (mapa de documentos) e não no SCHEMA_BASELINE.
    escrever('docs/GOVERNANCA.md', '## 12. Mapa\n\n> `SCHEMA_BASELINE.md` — ver § 12.\n');
    escrever('docs/SCHEMA_BASELINE.md', '## 1. Banco\n');

    const r = correr();

    expect(r.status).toBe(0);
  });

  it('usa apelidos para resolver referências em texto corrido', () => {
    escrever('docs/GOVERNANCA.md', '## 4. Segredos\n');
    escrever('docs/ARCHITECTURE.md', '## 1. Stack\n\nO valor vive em Settings (§4 da governança).\n');

    const r = correr();

    expect(r.status).toBe(0);
  });

  it('falha com secções repetidas no mesmo documento (numeração ambígua)', () => {
    escrever('docs/ARQUIVO.md', '## 1. Um\n\n## 1. Outro\n');

    const r = correr();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('secção § 1 repetida');
  });

  it('não confunde comentários numerados dentro de blocos de código com secções', () => {
    escrever('docs/TROUBLESHOOTING.md', '## 1. Um\n\n```bash\n# 1. Recarregue\n# 2. Limpe\n```\n\n## 2. Dois\n');

    const r = correr();

    expect(r.status).toBe(0);
  });

  it('falha quando nenhum documento envolvido tem secções numeradas', () => {
    escrever('docs/NOTAS.md', 'Sem cabeçalhos numerados.\n\nVer § 3 deste documento.\n');

    const r = correr();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/NOTAS.md:3');
  });
});
