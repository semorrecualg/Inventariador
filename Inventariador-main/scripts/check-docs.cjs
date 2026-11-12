#!/usr/bin/env node
/**
 * GBR KARDEK · verificação de docs
 *
 * Falha (exit 1) se algum `.md` do repositório tiver:
 *   1. link relativo `](caminho)` que não existe;
 *   2. referência de ficheiro em backticks (`src/App.tsx`, `docs/X.md`, `scripts/x.sql`)
 *      que não existe.
 *
 * Referências declaradas como planeadas ("a criar", "Criar", "planejada",
 * "pendência", "nunca foi criado", "deixou de existir") são aceites: não são
 * links quebrados, são intenção documentada.
 *
 * Corre no CI (`npm run check:docs`). Uso local: `node scripts/check-docs.cjs`.
 */
'use strict';

const { readdirSync, readFileSync, statSync, existsSync } = require('node:fs');
const { join, dirname, resolve, basename } = require('node:path');

const IGNORE = new Set([
  'node_modules',
  'dist',
  '.git',
  'android',
  '.tools',
  'artifacts',
  '.agents',
  'coverage'
]);

const MD_LINK_RE = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const FILE_REF_RE = /`([^`\n]+?\.(?:md|sql|json|ya?ml|cjs|mjs|ts|tsx|sh))`/g;
const PATH_REF_RE = /`((?:docs|scripts|\.github|src|public)\/[^`\n\s]+)`/g;
const PLACEHOLDER_RE = /(<|…|\*|\|)/;
const PLANNED_RE = /a criar|Criar |planejad|Planejada|pendência|nunca foi criado|deixou de existir/i;

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'AGENTS.md')) || existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/** `src/services/{a,b}.ts` conta como duas referências (`a.ts` e `b.ts`). */
function expandBraces(ref) {
  const braces = ref.match(/\{([^}]+)\}/);
  if (!braces) return [ref];
  return braces[1].split(',').map(part => ref.replace(braces[0], part.trim()));
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

const appRoot = resolve(__dirname, '..');
const repoRoot = process.argv[2] ? resolve(process.argv[2]) : findRepoRoot(appRoot);

if (!existsSync(repoRoot)) {
  console.error(`[ERRO] raiz do repositório não encontrada: ${repoRoot}`);
  process.exit(1);
}

const allFiles = walk(repoRoot);
const mdFiles = allFiles.filter(file => file.toLowerCase().endsWith('.md'));
const basenames = new Set(allFiles.map(file => basename(file)));
const rel = file => file.slice(repoRoot.length + 1);

const broken = [];
let linkCount = 0;
let refCount = 0;

const resolves = (file, ref) =>
  [resolve(dirname(file), ref), resolve(repoRoot, ref), resolve(appRoot, ref)].some(candidate =>
    existsSync(candidate)
  );

for (const file of mdFiles) {
  const text = readFileSync(file, 'utf8');

  // 1. Links markdown relativos
  MD_LINK_RE.lastIndex = 0;
  let match;
  while ((match = MD_LINK_RE.exec(text))) {
    let target = (match[1] || '').trim();
    if (!target || target.startsWith('#') || /^(https?:|mailto:|tel:|data:)/i.test(target)) continue;
    target = decodeURIComponent(target.split('#')[0]);
    if (!target) continue;
    linkCount++;
    if (!resolves(file, target)) broken.push({ file: rel(file), ref: target, kind: 'link' });
  }

  // 2. Referências de ficheiro em backticks
  const refs = new Set();
  for (const re of [FILE_REF_RE, PATH_REF_RE]) {
    re.lastIndex = 0;
    while ((match = re.exec(text))) refs.add(match[1].trim());
  }

  const lines = text.split('\n');
  const linesOf = ref => lines.filter(line => line.includes('`' + ref + '`'));

  for (const raw of refs) {
    if (/^(https?:|mailto:)/i.test(raw) || PLACEHOLDER_RE.test(raw)) continue;
    for (const ref of expandBraces(raw)) {
      refCount++;
      if (resolves(file, ref)) continue;
      if (!ref.includes('/') && basenames.has(ref)) continue; // nome solto: existe nalguma pasta
      if (allFiles.some(candidate => candidate.endsWith('/' + ref))) continue; // caminho parcial
      const declared = linesOf(raw);
      if (declared.length > 0 && declared.every(line => PLANNED_RE.test(line))) continue;
      broken.push({ file: rel(file), ref, kind: 'referência' });
    }
  }
}

console.log(`GBR KARDEK · docs: ${mdFiles.length} ficheiro(s) · ${linkCount} link(s) relativo(s) · ${refCount} referência(s) de ficheiro`);
console.log(`raiz: ${repoRoot}`);

if (broken.length === 0) {
  console.log('[ OK ] nenhum link ou referência quebrada.');
  process.exit(0);
}

console.error(`[FALHA] ${broken.length} referência(s) quebrada(s):`);
for (const item of broken) {
  console.error(`  ${item.file} -> ${item.ref} (${item.kind})`);
}
process.exit(1);
