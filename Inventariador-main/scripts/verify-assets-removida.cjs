#!/usr/bin/env node
/**
 * GBR KARDEK · guarda do fim do terceiro espelho local (`assets`).
 *
 * A store Dexie `assets` saiu na `version(11)` (A.3a.4). Este gate impede o
 * regresso em duas frentes:
 *
 *   código — `db.assets`, `.table('assets')`, `mirrors.assets`, declaração
 *            `assets: Dexie.Table` e um campo `assets` em `MirrorCounts`;
 *   docs   — «três espelhos / três tabelas locais / três cópias», `db.assets`,
 *            linha de tabela `| `assets` |` e `assets` apresentada como tabela
 *            local (ao lado de `local_assets`/`ativos` ou com «tabela local»,
 *            «store local», «espelho local» ou «Dexie»).
 *
 * Isenções (registro histórico, não estado atual):
 *   - `CHANGELOG.md` e os docs de decisão/análise anteriores à A.3a.4;
 *   - linhas de remoção/negação («saiu na v11», «foi removida», «não existe»);
 *   - `public.assets` (nuvem) e o filtro `table_name in (…)` da auditoria;
 *   - linhas datadas de decisão (`[x]`/✅ + data) e a tabela de versões do
 *     `docs/SCHEMA_BASELINE.md` (v1–v11);
 *   - `src/services/migrationV5.ts` (o upgrade v5 lê a store dessa versão).
 *
 * Uso: node scripts/verify-assets-removida.cjs [--root <pasta>]
 * CI:  npm run verify:assets-removida
 */
'use strict';

const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative, resolve, sep } = require('node:path');

const IGNORE = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  '.agent',
  '.agents',
  'artifacts',
  'android',
  '.tools',
  'shots',
]);

/** Docs que narram a era das três tabelas — registo, não estado atual. */
const DOCS_HISTORICOS = new Set([
  'CHANGELOG.md',
  'docs/ANALISE_TABELAS_ATIVOS_ASSETS.md',
  'docs/CORRECAO_INVENTORYCARD_MODULO_ATIVO.md',
  'docs/DECISAO_MERGE_CONFERIDO.md',
  'docs/PLANO_FASE_C_HIGIENIZACAO.md',
]);

/** Código que fala de `assets` por motivo histórico/localizado. */
const CODIGO_ISENTO = new Set([
  // O upgrade v5 lê a store que existia nessa versão (antes da v11).
  'src/services/migrationV5.ts',
  // O próprio teste contém as strings proibidas como fixture.
  'src/__tests__/verificaAssetsRemovida.test.ts',
  // Testes das migrações históricas: semeiam a store da versão que a tinha.
  'src/__tests__/migracaoV10.test.ts',
  'src/__tests__/migrationV5.test.ts',
]);

/**
 * Marcadores de que a linha fala da REMOÇÃO (ou da nuvem), não de uma tabela
 * local viva. Mantidos curtos e específicos para não isentar uma frase que
 * apenas mencione «histórico» ao lado de uma asserção errada.
 */
const MARCA_HISTORICA =
  /(removid[ao]?|saiu|extint[ao]?|já não existe|não existe|deixou de existir|hist[óo]ric[ao]?|superad[ao]?|A\.3a\.4|public\.assets|table_name|audit_logs)/i;

const TRES_ESPELHOS =
  /tr[êe]s\s+(espelhos|tabelas\s+locais|c[óo]pias)|3\s+(espelhos|tabelas\s+locais)/i;

const COMO_TABELA_LOCAL = /(tabela|store|espelho)\s+local|Dexie/i;

/** Linha de histórico datado (tabela de versões do baseline, checklist datado). */
function linhaHistorica(linha) {
  if (/^\s*\|\s*\*\*v\d+/i.test(linha)) return true;
  return (/\[x\]/i.test(linha) || linha.includes('✅')) && /\b20\d{2}-\d{2}-\d{2}\b/.test(linha);
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Corre a guarda sobre `root`.
 * Devolve `{ falhas, docs, codigo }`; cada falha é `{ file, line, rule, text }`.
 */
function verificar(root) {
  const falhas = [];
  const ficheiros = walk(root);
  let docs = 0;
  let codigo = 0;

  const registar = (file, line, rule, text) =>
    falhas.push({ file, line, rule, text: String(text).trim().slice(0, 160) });

  for (const abs of ficheiros) {
    const rel = relative(root, abs).split(sep).join('/');
    const baixo = rel.toLowerCase();

    if (baixo.endsWith('.md')) {
      docs++;
      if (DOCS_HISTORICOS.has(rel) || DOCS_HISTORICOS.has(rel.split('/').pop())) continue;

      const linhas = readFileSync(abs, 'utf8').split('\n');
      linhas.forEach((linha, i) => {
        const n = i + 1;
        const historica = MARCA_HISTORICA.test(linha) || linhaHistorica(linha);

        if (/\bdb\.assets\b/.test(linha) && !historica) {
          registar(rel, n, 'db.assets nos docs', linha);
        }
        if (TRES_ESPELHOS.test(linha)) {
          registar(rel, n, 'três espelhos/tabelas/cópias', linha);
        }
        if (/^\s*\|\s*`assets`\s*\|/.test(linha)) {
          registar(rel, n, 'linha de tabela `assets`', linha);
        }
        if (!historica && /`assets`/.test(linha)) {
          if (/`local_assets`|`ativos`/.test(linha)) {
            registar(rel, n, 'assets listada como espelho local', linha);
          } else if (COMO_TABELA_LOCAL.test(linha)) {
            registar(rel, n, 'assets como tabela local', linha);
          }
        }
      });
      continue;
    }

    if (!baixo.startsWith('src/') || !/\.(ts|tsx)$/.test(baixo)) continue;
    codigo++;
    if (CODIGO_ISENTO.has(rel)) continue;

    const linhas = readFileSync(abs, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      const n = i + 1;
      if (/\bdb\.assets\b/.test(linha) || /\bdexie\.assets\b/.test(linha)) {
        registar(rel, n, 'db.assets no código', linha);
      }
      if (/\.table\(\s*['"]assets['"]\s*\)/.test(linha)) {
        registar(rel, n, "table('assets') no código", linha);
      }
      if (/mirrors\??\.assets\b/.test(linha)) {
        registar(rel, n, 'mirrors.assets na contagem', linha);
      }
      if (/\bassets\s*!?\s*:\s*Dexie\.Table/.test(linha)) {
        registar(rel, n, 'declaração de tabela assets', linha);
      }
    });
  }

  // O retrato de linha de base (F0) conta DOIS espelhos. Um campo `assets`
  // em `MirrorCounts` reintroduziria a contagem de três sem tocar numa query.
  const perf = join(root, 'src/utils/perfMetrics.ts');
  if (existsSync(perf)) {
    const bloco = readFileSync(perf, 'utf8').match(/interface\s+MirrorCounts\s*\{([\s\S]*?)\}/);
    if (bloco && /\bassets\s*:/.test(bloco[1])) {
      registar('src/utils/perfMetrics.ts', 0, 'campo assets em MirrorCounts', 'interface MirrorCounts');
    }
  }

  return { falhas, docs, codigo };
}

if (require.main === module) {
  const index = process.argv.indexOf('--root');
  const root = index !== -1 ? resolve(process.argv[index + 1]) : resolve(__dirname, '..');

  if (!existsSync(root)) {
    console.error(`[ERRO] pasta não encontrada: ${root}`);
    process.exit(1);
  }

  const { falhas, docs, codigo } = verificar(root);
  console.log(
    `GBR KARDEK · assets local: ${docs} doc(s) · ${codigo} ficheiro(s) de código · raiz ${root}`,
  );

  if (falhas.length === 0) {
    console.log('[ OK ] `assets` não volta a ser tratada como tabela local.');
    process.exit(0);
  }

  console.error(`[FALHA] ${falhas.length} regresso(s) ao terceiro espelho local:`);
  for (const f of falhas) {
    const onde = f.line > 0 ? `${f.file}:${f.line}` : f.file;
    console.error(`  ${onde} — ${f.rule}\n    ${f.text}`);
  }
  console.error(
    'Use `local_assets` + `ativos` (docs/SCHEMA_BASELINE.md §2). O histórico fica nos docs datados.',
  );
  process.exit(1);
}

module.exports = { verificar, DOCS_HISTORICOS, CODIGO_ISENTO };
