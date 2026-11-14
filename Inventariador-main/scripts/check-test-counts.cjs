#!/usr/bin/env node
/**
 * GBR KARDEK · verificação das contagens de teste nos docs
 *
 * Falha (exit 1) quando um documento que afirma o estado ATUAL do gate de
 * qualidade diz um número de testes/arquivos diferente do que o Vitest tem.
 * Sem isto, cada teste novo volta a deixar os docs a mentir até alguém reparar.
 *
 * A contagem real vem de `vitest list --json` (colecciona as suítes, não as
 * executa): ~13s, sem efeitos de dados.
 *
 * Uso:
 *   node scripts/check-test-counts.cjs                 # raiz do app, contagem real
 *   node scripts/check-test-counts.cjs <raiz>          # outra raiz (testes)
 *   node scripts/check-test-counts.cjs <raiz> --tests 844 --files 94
 *
 * Documentos de HISTÓRICO (CHANGELOG, planos de fase datados) ficam de fora por
 * desenho: lá o número é o retrato de uma entrega, não uma afirmação do presente.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join, resolve } = require('node:path');

/** Documentos que afirmam o gate atual; é aqui que a contagem tem de bater certo. */
const DOCS_ATUAIS = [
  'README.md',
  'SKILL.md',
  'docs/SPEC.md',
  'docs/ARCHITECTURE.md',
  'docs/GOVERNANCA.md',
  '.agents/skills/gbr-project-context/SKILL.md'
];

/** `N testes / M arquivos` e a ordem inversa. */
const COMPOSTO_TESTES = /(\d+)\s+testes?\s*\/\s*(\d+)\s+arquivos?/;
const COMPOSTO_ARQUIVOS = /(\d+)\s+arquivos?\s*\/\s*(\d+)\s+testes?/;
/** Afirmações de só testes: "(844 testes)" junto ao comando ou a "Vitest (…)". */
const TOTAL_TESTES = /(?:vitest run|Vitest)\s*\(?(\d+)\s+testes?/;

const PLACEHOLDER = /(<|…|\bN\b|\bNN\b)/;

function contarSuites(raiz) {
  const bin = join(raiz, 'node_modules', '.bin', 'vitest');
  const alvo = existsSync(bin)
    ? [bin, ['list', '--json']]
    : [process.execPath, [join(raiz, 'node_modules', 'vitest', 'vitest.mjs'), 'list', '--json']];

  const saida = spawnSync(alvo[0], alvo[1], { cwd: raiz, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (saida.status !== 0 || !saida.stdout) {
    throw new Error(`vitest list falhou (exit ${saida.status}): ${(saida.stderr || '').trim().split('\n').slice(-3).join(' | ')}`);
  }

  const lista = JSON.parse(saida.stdout);
  if (!Array.isArray(lista)) throw new Error('vitest list devolveu um formato inesperado.');
  return { testes: lista.length, arquivos: new Set(lista.map(item => item.file)).size };
}

function lerArgumentos(argv) {
  const opcoes = { raiz: resolve(__dirname, '..'), testes: null, arquivos: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--tests') opcoes.testes = Number(argv[++i]);
    else if (arg === '--files') opcoes.arquivos = Number(argv[++i]);
    else opcoes.raiz = resolve(arg);
  }
  return opcoes;
}

/** Devolve as divergências de um documento, com a linha e o que ele afirma. */
function divergenciasDoDoc(texto, esperado) {
  const problemas = [];
  texto.split('\n').forEach((linha, i) => {
    if (PLACEHOLDER.test(linha)) return;
    const numero = i + 1;

    const compostos = [
      { re: COMPOSTO_TESTES, testes: 1, arquivos: 2 },
      { re: COMPOSTO_ARQUIVOS, testes: 2, arquivos: 1 }
    ];
    for (const { re, testes, arquivos } of compostos) {
      const m = linha.match(re);
      if (!m) continue;
      const dizTestes = Number(m[testes]);
      const dizArquivos = Number(m[arquivos]);
      if (dizTestes !== esperado.testes || dizArquivos !== esperado.arquivos) {
        problemas.push({ numero, afirmado: `${dizTestes} testes / ${dizArquivos} arquivos` });
      }
      return;
    }

    const total = linha.match(TOTAL_TESTES);
    if (total && Number(total[1]) !== esperado.testes) {
      problemas.push({ numero, afirmado: `${total[1]} testes` });
    }
  });
  return problemas;
}

function main() {
  const { raiz, testes, arquivos } = lerArgumentos(process.argv.slice(2));
  const esperado = (testes !== null && arquivos !== null) ? { testes, arquivos } : contarSuites(raiz);

  const problemas = [];
  let verificados = 0;
  for (const relativo of DOCS_ATUAIS) {
    const caminho = join(raiz, relativo);
    if (!existsSync(caminho)) continue;
    verificados += 1;
    for (const p of divergenciasDoDoc(readFileSync(caminho, 'utf8'), esperado)) {
      problemas.push({ arquivo: relativo, ...p });
    }
  }

  if (problemas.length > 0) {
    console.error(`[ FALHA ] contagem de testes divergente — a suíte tem ${esperado.testes} testes em ${esperado.arquivos} arquivos:`);
    for (const p of problemas) {
      console.error(`  ${p.arquivo}:${p.numero} — diz ${p.afirmado}`);
    }
    process.exit(1);
  }

  console.log(`[ OK ] ${verificados} documento(s) com a contagem certa: ${esperado.testes} testes / ${esperado.arquivos} arquivos.`);
}

main();
