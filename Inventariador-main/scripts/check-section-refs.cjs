#!/usr/bin/env node
/**
 * GBR KARDEK · verificação das referências «§N» entre documentos
 *
 * O `check-docs.cjs` valida caminhos e links; não valida que a secção citada
 * exista. Foi assim que o ARCHITECTURE mandou os segredos para a «§5 da
 * governança» sem nada falhar.
 *
 * Resolução de cada «§ N»:
 *  1. Documento ligado por adjacência: `X.md` § N · § N de X.md · § N da governança.
 *  2. O primeiro documento ligado nessa linha (vale para § N seguintes:
 *     "`ARCHITECTURE.md` §7.6 / § 12" → ambos em ARCHITECTURE).
 *  3. Sem ligação, o próprio documento.
 * Um documento nomeado sem secções numeradas não pode validar nada: nesse caso
 * a referência resolve-se no próprio documento.
 *
 * Limite conhecido: o gate garante que a secção existe, não que trate do
 * assunto. «§ 5 da governança» existe mesmo — esse erro é de revisão humana.
 *
 * Uso: node scripts/check-section-refs.cjs [raiz]
 */
'use strict';

const { readdirSync, readFileSync, statSync } = require('node:fs');
const { basename, join, relative, resolve } = require('node:path');

const IGNORAR_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'artifacts']);
const CERCA = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s+(?:\*\*)?(\d+(?:\.\d+)*)[.)]?\s/;
const REFERENCIA = /§\s?(\d+(?:\.\d+)*)/g;
const FICHEIRO_MD = /((?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_-]+\.md)/;
const DOC_POR_APELIDO = {
  governança: 'docs/GOVERNANCA.md',
  governanca: 'docs/GOVERNANCA.md',
  architecture: 'docs/ARCHITECTURE.md',
  rbac: 'docs/RBAC_GOVERNANCA.md',
  spec: 'docs/SPEC.md'
};
/** Apelidos de texto corrido (`\b` evita que «especificação» case com «spec»). */
const APELIDOS = new RegExp(`\\b(${Object.keys(DOC_POR_APELIDO).join('|')})\\b`, 'i');
/** O que pode separar dois § da mesma linha para herdarem o documento ligado. */
const SEPARADOR = /^[\s/,;·&—–-]*(?:e\s+)?$/;

/** Linhas fora de blocos de código, com o número original. */
function linhasUteis(texto) {
  const saida = [];
  let emCodigo = false;
  for (const [i, linha] of texto.split('\n').entries()) {
    if (CERCA.test(linha)) {
      emCodigo = !emCodigo;
    } else if (!emCodigo) {
      saida.push({ numero: i + 1, linha });
    }
  }
  return saida;
}

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

/** Índice de secções por documento + secções repetidas (numeração ambígua). */
function indexar(raiz, docs) {
  const ids = new Map();
  const duplicadas = [];
  for (const doc of docs) {
    const vistas = new Map();
    for (const { numero, linha } of linhasUteis(readFileSync(join(raiz, doc), 'utf8'))) {
      const id = linha.match(HEADING)?.[1];
      if (!id) continue;
      if (vistas.has(id)) duplicadas.push({ doc, numero, id, primeira: vistas.get(id) });
      else vistas.set(id, numero);
    }
    ids.set(doc, new Set(vistas.keys()));
  }
  return { ids, duplicadas };
}

/** Documento citado imediatamente antes ou depois da referência, se houver. */
function documentoLigado(antes, depois, porNome) {
  const atras = antes.slice(-30).match(new RegExp(`${FICHEIRO_MD.source}\`?[\\s()[\\],;:—–-]*(?:ver\\s+)?$`));
  if (atras) return porNome.get(basename(atras[1]).toLowerCase());

  const adiante = depois.match(new RegExp(`^\\s*(?:de|do|da|em)\\s+\`?${FICHEIRO_MD.source}`));
  if (adiante) return porNome.get(basename(adiante[1]).toLowerCase());

  const apelido = depois.match(new RegExp(`^\\s*(?:de|do|da)\\s+(?:a\\s+|o\\s+)?${APELIDOS.source}`, 'i'));
  return apelido ? DOC_POR_APELIDO[apelido[1].toLowerCase()] : undefined;
}

function verificar(raiz) {
  const docs = listarMd(raiz);
  const porNome = new Map(docs.map(doc => [basename(doc).toLowerCase(), doc]));
  const { ids, duplicadas } = indexar(raiz, docs);
  const temSecoes = doc => (ids.get(doc) || new Set()).size > 0;

  const invalidas = [];
  let referencias = 0;

  for (const doc of docs) {
    for (const { numero, linha } of linhasUteis(readFileSync(join(raiz, doc), 'utf8'))) {
      let contexto;
      let fimAnterior = 0;
      for (const m of linha.matchAll(REFERENCIA)) {
        referencias += 1;
        const separador = linha.slice(fimAnterior, m.index);
        if (!SEPARADOR.test(separador)) contexto = undefined;
        fimAnterior = m.index + m[0].length;
        const ligado = documentoLigado(linha.slice(0, m.index), linha.slice(m.index + m[0].length), porNome);
        if (ligado && temSecoes(ligado)) contexto = ligado;
        const alvo = contexto && temSecoes(contexto) ? contexto : doc;
        if (!ids.get(alvo).has(m[1])) {
          invalidas.push({ doc, numero, id: m[1], alvo });
        }
      }
    }
  }

  return { total: docs.length, referencias, invalidas, duplicadas };
}

function main() {
  const raiz = process.argv[2] ? resolve(process.argv[2]) : resolve(__dirname, '..');
  const { total, referencias, invalidas, duplicadas } = verificar(raiz);

  if (invalidas.length > 0 || duplicadas.length > 0) {
    console.error(`[ FALHA ] referências «§N» inválidas em ${total} documento(s):`);
    for (const p of invalidas) console.error(`  ${p.doc}:${p.numero} — § ${p.id} não existe em ${p.alvo}`);
    for (const d of duplicadas) console.error(`  ${d.doc}:${d.numero} — secção § ${d.id} repetida (já em ${d.primeira})`);
    process.exit(1);
  }

  console.log(`[ OK ] ${referencias} referência(s) «§N» resolvidas em ${total} documento(s).`);
}

main();
