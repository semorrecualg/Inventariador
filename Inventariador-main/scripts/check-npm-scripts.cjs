#!/usr/bin/env node
/**
 * GBR KARDEK · verificação dos `npm run <script>` citados nos docs
 *
 * Um comando documentado que não existe (`npm run bench`) falha com
 * "Missing script" e custa mais ao leitor do que um número errado. Este gate
 * compara cada `npm run <script>` dos markdown com os scripts do `package.json`.
 *
 * Documentos de HISTÓRICO (CHANGELOG, planos de fase datados) ficam de fora, tal
 * como no gate de contagem: lá o comando é o retrato de uma entrega antiga, não
 * uma instrução do presente.
 *
 * Uso: node scripts/check-npm-scripts.cjs [raiz] [--extra ../AGENTS.md]
 */
'use strict';

const { existsSync, readdirSync, readFileSync, statSync } = require('node:fs');
const { basename, join, relative, resolve } = require('node:path');

const IGNORAR_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'artifacts', '.agents', 'android', '.tools']);
const NPM_RUN = /npm run ([A-Za-z0-9:_-]+)/g;

/** Registos de entregas passadas: o comando é história, não instrução. */
const HISTORICOS = new Set([
  'CHANGELOG.md',
  'PLANO_FASE_C_HIGIENIZACAO.md',
  'MIGRACAO_HIBRIDA.md',
  'HIGIENIZACAO_ENDERECO.md',
  'RBAC_GOVERNANCA.md',
  'ANALISE_TABELAS_ATIVOS_ASSETS.md',
  'VISAO_MALHA_AUDITORIA_CAMPO.md',
  'CORRECAO_INVENTORYCARD_MODULO_ATIVO.md'
]);

function listarMd(raiz) {
  const saida = [];
  const andar = dir => {
    for (const nome of readdirSync(dir).sort()) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        if (!IGNORAR_DIRS.has(nome)) andar(caminho);
      } else if (nome.toLowerCase().endsWith('.md')) {
        saida.push(caminho);
      }
    }
  };
  andar(raiz);
  return saida;
}

function argumentos(argv) {
  const opcoes = { raiz: resolve(__dirname, '..'), extras: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--extra') opcoes.extras.push(argv[++i]);
    else opcoes.raiz = resolve(argv[i]);
  }
  return opcoes;
}

function verificar(raiz, extras) {
  const scripts = new Set(Object.keys(JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).scripts || {}));
  const docs = listarMd(raiz);
  for (const extra of extras) {
    const caminho = resolve(raiz, extra);
    if (existsSync(caminho) && !docs.includes(caminho)) docs.push(caminho);
  }

  const mortas = [];
  let documentos = 0;
  let referencias = 0;

  for (const caminho of docs) {
    const relativo = relative(raiz, caminho).split('\\').join('/');
    if (HISTORICOS.has(basename(caminho))) continue;
    documentos += 1;
    for (const [i, linha] of readFileSync(caminho, 'utf8').split('\n').entries()) {
      for (const m of linha.matchAll(NPM_RUN)) {
        referencias += 1;
        if (!scripts.has(m[1])) mortas.push({ doc: relativo, numero: i + 1, script: m[1] });
      }
    }
  }

  return { documentos, referencias, mortas };
}

function main() {
  const { raiz, extras } = argumentos(process.argv.slice(2));
  const { documentos, referencias, mortas } = verificar(raiz, extras);

  if (mortas.length > 0) {
    console.error(`[ FALHA ] ${mortas.length} comando(s) documentado(s) sem script no package.json:`);
    for (const p of mortas) console.error(`  ${p.doc}:${p.numero} — npm run ${p.script}`);
    process.exit(1);
  }

  console.log(`[ OK ] ${referencias} \`npm run\` em ${documentos} documento(s), todos com script.`);
}

main();
