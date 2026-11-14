// @vitest-environment node
// ============================================================================
// checkSectionRefs.test.ts — o gate `check:section-refs` (parte de `check:docs`).
//
// Cobre a classe de erro que passou meses despercebida: uma «§ N» que aponta
// para uma secção inexistente porque o documento foi renumerado. Uma raiz
// temporária evita depender do estado real dos docs.
// ============================================================================
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SCRIPT = resolve(__dirname, '../../scripts/check-section-refs.cjs');

let base: string;
let raiz: string;

const escrever = (relativo: string, conteudo: string) => {
  const caminho = join(raiz, relativo);
  mkdirSync(join(caminho, '..'), { recursive: true });
  writeFileSync(caminho, conteudo, 'utf8');
};

const correr = (args: string[] = []) =>
  spawnSync(process.execPath, [SCRIPT, raiz, ...args], { encoding: 'utf8' });

beforeEach(() => {
  // `base` é a raiz do repositório; `raiz` é o app dentro dele.
  base = mkdtempSync(join(tmpdir(), 'gbr-secoes-'));
  raiz = join(base, 'app');
  mkdirSync(raiz);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('check:section-refs', () => {
  it('aceita referências internas e ignora numeração dentro de blocos de código', () => {
    escrever('docs/A.md', '## 7. Fluxo\n\n### 7.6 Schema\n\nVer §7.6 e § 7.\n\n```bash\n# 1. passo\n```\n');

    const r = correr();

    expect(r.status).toBe(0);
  });

  it('falha quando a secção não existe, com ficheiro e linha', () => {
    escrever('docs/A.md', '## 7. Fluxo\n\n### 7.6 Schema\n\nVer §7.9.\n');

    const r = correr();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/A.md:5');
    expect(r.stderr).toContain('§ 7.9');
  });

  it('segue a ligação explícita e propaga-a aos restantes § da mesma linha', () => {
    // "`B.md` §7.6 / § 12" — o segundo § pertence a B.md, não ao documento actual.
    escrever('docs/B.md', '## 7. Fluxo\n\n### 7.6 Schema\n\n## 12. Detalhe\n');
    escrever('docs/A.md', '## 1. Capa\n\nVer `docs/B.md` §7.6 / § 12.\n');

    const r = correr();

    expect(r.status).toBe(0);
  });

  it('não mascara: § ligada a outro documento é validada nesse documento', () => {
    escrever('docs/B.md', '## 1. Um\n');
    escrever('docs/A.md', '## 9. Nove\n\nVer § 9 de `docs/B.md`.\n');

    const r = correr();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('não existe em docs/B.md');
  });

  it('não captura a referência por um nome de ficheiro mencionado longe dela', () => {
    escrever('docs/B.md', '## 1. Um\n');
    escrever('docs/A.md', '## 9. Nove\n\nO mapa `docs/B.md` foi revisto; ver § 9.\n');

    const r = correr();

    expect(r.status).toBe(0);
  });

  it('resolve apelidos com fronteira de palavra (não confunde "especificação" com "spec")', () => {
    escrever('docs/GOVERNANCA.md', '## 4. Segredos\n');
    escrever('docs/SPEC.md', '## 2. Escopo\n');
    escrever(
      'docs/A.md',
      '## 1. Capa\n\nO valor vive em Settings (§4 da governança); a especificação trata § 1.\n'
    );

    const r = correr();

    expect(r.status).toBe(0);
  });

  it('resolve o apelido também quando vem antes da referência', () => {
    escrever('docs/GOVERNANCA.md', '## 5. Fluxo de git\n');
    escrever('docs/A.md', '## 1. Capa\n\nFluxo obrigatório (governança § 5).\n');

    expect(correr().status).toBe(0);
  });

  it('verifica documentos fora da raiz indicados com --extra', () => {
    // É assim que o AGENTS.md da raiz do repositório entra no gate.
    writeFileSync(join(base, 'AGENTS.md'), '## 1. Regra\n\nVer § 4.\n', 'utf8');

    const r = correr(['--extra', '../AGENTS.md']);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('../AGENTS.md:3');
  });

  it('falha com secções repetidas no mesmo documento', () => {
    escrever('docs/A.md', '## 1. Um\n\n## 1. Outro\n');

    const r = correr();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('secção § 1 repetida');
  });

  it('falha quando o documento não tem secções numeradas (nada a validar)', () => {
    escrever('docs/NOTAS.md', 'Sem cabeçalhos numerados.\n\nVer § 3.\n');

    const r = correr();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('docs/NOTAS.md:3');
  });
});
