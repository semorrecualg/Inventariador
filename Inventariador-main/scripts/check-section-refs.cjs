#!/usr/bin/env node
/**
 * GBR KARDEK · verificação das referências «§N» entre documentos
 *
 * O `check-docs.cjs` valida caminhos de ficheiro e links; não valida que a
 * secção citada exista. Foi assim que o ARCHITECTURE mandou os segredos para a
 * «§5 da governança» (que existe, mas é o fluxo de git) sem nada falhar.
 *
 * Regras:
 *  - Cabecalho numerado (`## 4. …`, `### 7.6 …`) define os ids de cada documento.
 *  - Uma referência `§N` resolve-se no próprio documento **ou** num documento
 *    nomeado na mesma linha (nome de ficheiro `.md` ou apelido: governança,
 *    architecture, spec, rbac). Assim «ver § 12» dentro de GOVERNANCA resolve-se
 *    na própria governança mesmo citando `SCHEMA_BASELINE.md` ao lado.
 *  - Ids repetidos no mesmo documento também são erro: a renumeração deixa
 *    duas secções com o mesmo número e a referência passa a ser ambígua.
 *
 * Uso: node scripts/check-section-refs.cjs [raiz]
 */
'use strict';

const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative, resolve, basename } = require('node:path');

const IGNORAR_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'artifacts']);
const HEADING = /^#{1,6}\s+(?:\*\*)?(\d+(?:\.\d+)*)[.)]?\s/;
const REFERENCIA = /§\s?(\d+(?:\.\d+)*)/g;
const FICHEIRO_MD = /([A-Za-z0-9_-]+\.md)/g;
/** Cercas de código: `# 1. …` dentro de um bloco bash não é um cabeçalho. */
const CERCA = /^\s*(```|~~~)/;

/** Apelidos usados no texto corrido para documentos do repo. */
const APELIDOS = [
  ['governança', 'docs/GOVERNANCA.md'],
  ['governanca', 'docs/GOVERNANCA.md'],
  ['architecture', 'docs/ARCHITECTURE.md'],
  ['rbac', 'docs/RBAC_GOVERNANCA.md'],
  ['spec', 'docs/SPEC.md']
];

function listarMd(raiz) {
  const saida = [];
  const andar = dir => {
    for (const nome of readdirSync(dir).sort()) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        if (!IGNORAR_DIRS.has(nome)) andar(caminho);
      } else if (nome.toLowerCase().endsWith('.md')) {
        saida.push(relative(raiz, caminho).split('\\').join('/'));
      }
    }
  };
  andar(raiz);
  return saida;
}

function indexar(raiz, docs) {
  const ids = new Map();
  const duplicados = [];
  for (const doc of docs) {
    const vistos = new Map();
    let emCodigo = false;
    for (const [i, linha] of readFileSync(join(raiz, doc), 'utf8').split('\n').entries()) {
      if (CERCA.test(linha)) {
        emCodigo = !emCodigo;
        continue;
      }
      if (emCodigo) continue;
      const m = linha.match(HEADING);
      if (!m) continue;
      const id = m[1];
      if (vistos.has(id)) duplicados.push({ doc, numero: i + 1, id, primeiro: vistos.get(id) });
      else vistos.set(id, i + 1);
    }
    ids.set(doc, new Set(vistos.keys()));
  }
  return { ids, duplicados };
}

/** Documentos nomeados na linha, resolvidos por nome de ficheiro ou apelido. */
function nomeados(linha, porNome) {
  const alvos = [];
  const minuscula = linha.toLowerCase();
  for (const [apelido, doc] of APELIDOS) {
    if (minuscula.includes(apelido)) alvos.push(doc);
  }
  for (const ficheiro of linha.match(FICHEIRO_MD) || []) {
    const doc = porNome.get(basename(ficheiro).toLowerCase());
    if (doc) alvos.push(doc);
  }
  return alvos;
}

function verificar(raiz) {
  const docs = listarMd(raiz);
  const porNome = new Map(docs.map(doc => [basename(doc).toLowerCase(), doc]));
  const { ids, duplicados } = indexar(raiz, docs);

  const problemas = [];
  let referencias = 0;

  for (const doc of docs) {
    const linhas = readFileSync(join(raiz, doc), 'utf8').split('\n');
    let emCodigo = false;
    for (const [i, linha] of linhas.entries()) {
      if (CERCA.test(linha)) {
        emCodigo = !emCodigo;
        continue;
      }
      if (emCodigo) continue;
      const alvos = nomeados(linha, porNome);
      // Um documento nomeado sem secções numeradas não pode validar nada:
      // nesse caso a referência resolve-se no próprio documento.
      const candidatos = [doc, ...alvos].filter(d => (ids.get(d) || new Set()).size > 0);
      for (const m of linha.matchAll(REFERENCIA)) {
        referencias += 1;
        const id = m[1];
        const existe = candidatos.some(d => ids.get(d).has(id));
        if (!existe) {
          problemas.push({
            doc,
            numero: i + 1,
            id,
            alvos: candidatos.length > 0 ? candidatos.join(', ') : '(nenhum documento com secções numeradas)'
          });
        }
      }
    }
  }

  return { docs, referencias, problemas, duplicados };
}

function main() {
  const raiz = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '..');
  const { docs, referencias, problemas, duplicados } = verificar(raiz);

  if (problemas.length > 0 || duplicados.length > 0) {
    console.error(`[ FALHA ] referências «§N» inválidas em ${docs.length} documento(s):`);
    for (const p of problemas) {
      console.error(`  ${p.doc}:${p.numero} — § ${p.id} não existe em: ${p.alvos}`);
    }
    for (const d of duplicados) {
      console.error(`  ${d.doc}:${d.numero} — secção § ${d.id} repetida (já em ${d.primeiro})`);
    }
    process.exit(1);
  }

  console.log(`[ OK ] ${referencias} referência(s) «§N» resolvidas em ${docs.length} documento(s).`);
}

main();
