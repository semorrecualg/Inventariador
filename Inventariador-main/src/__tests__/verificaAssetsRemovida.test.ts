// ============================================================================
// verificaAssetsRemovida.test.ts — contrato da guarda `verify:assets-removida`.
//
// A store Dexie `assets` saiu na version(11) (A.3a.4). O script
// `scripts/verify-assets-removida.cjs` falha se o código ou os docs voltarem a
// tratá-la como tabela local. Este teste prova que a guarda NÃO é um no-op:
// apanha `db.assets`, `table('assets')`, `mirrors.assets`, a contagem de três
// espelhos e a linha de tabela, e continua a aceitar os docs históricos.
// ============================================================================
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

type Falha = { file: string; line: number; rule: string; text: string };
type Resultado = { falhas: Falha[]; docs: number; codigo: number };

const require = createRequire(import.meta.url);
const { verificar } = require('../../scripts/verify-assets-removida.cjs') as {
  verificar: (root: string) => Resultado;
};

const temporarias: string[] = [];

/** Cria uma raiz efémera com os ficheiros indicados (caminho → conteúdo). */
function fixture(ficheiros: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'guarda-assets-'));
  temporarias.push(root);
  for (const [rel, conteudo] of Object.entries(ficheiros)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, conteudo);
  }
  return root;
}

afterEach(() => {
  while (temporarias.length > 0) {
    rmSync(temporarias.pop() as string, { recursive: true, force: true });
  }
});

describe('guarda do fim do espelho local `assets`', () => {
  it('falha em db.assets, table("assets") e mirrors.assets no código', () => {
    const root = fixture({
      'src/services/recaida.ts': [
        "await db.assets.put(item);",
        "await tx.table('assets').clear();",
        'const linha = `assets=${mirrors.assets}`;'
      ].join('\n')
    });

    const { falhas, codigo } = verificar(root);
    expect(codigo).toBe(1);
    expect(falhas.map((f) => f.rule)).toEqual(
      expect.arrayContaining([
        'db.assets no código',
        "table('assets') no código",
        'mirrors.assets na contagem'
      ])
    );
  });

  it('aceita a fachada `localDb.assets` (grava em ativos + local_assets)', () => {
    const root = fixture({
      'src/services/localDbService.ts': 'await localDb.assets.add(asset);'
    });

    expect(verificar(root).falhas).toEqual([]);
  });

  it('falha na contagem de três espelhos e em `assets` como tabela local', () => {
    const root = fixture({
      'docs/atual.md': [
        'Hoje a mesma informação mora em três tabelas locais.',
        'A tabela local `assets` continua a ser a canónica.',
        'A store local `assets` saiu na v11.'
      ].join('\n')
    });

    const { falhas } = verificar(root);
    expect(falhas.map((f) => f.rule)).toEqual([
      'três espelhos/tabelas/cópias',
      'assets como tabela local'
    ]);
  });

  it('não falha em docs históricos nem na tabela de versões do baseline', () => {
    const root = fixture({
      'CHANGELOG.md': 'Os três espelhos antigos foram unificados.',
      'docs/DECISAO_MERGE_CONFERIDO.md': 'As três cópias tinham datas diferentes.',
      'docs/SCHEMA_BASELINE.md':
        '| **v6** | DROP das 3 tabelas de ativos (`local_assets`, `ativos`, `assets`) |',
      'docs/atual.md': 'O `assets` local foi removido na v11; restam `local_assets` + `ativos`.'
    });

    expect(verificar(root).falhas).toEqual([]);
  });

  it('falha se `MirrorCounts` voltar a contar `assets`', () => {
    const root = fixture({
      'src/utils/perfMetrics.ts':
        'export interface MirrorCounts {\n  local_assets: number;\n  ativos: number;\n  assets: number;\n}'
    });

    const { falhas } = verificar(root);
    expect(falhas.map((f) => f.rule)).toContain('campo assets em MirrorCounts');
  });
});
