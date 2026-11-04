#!/usr/bin/env node
'use strict';

/**
 * Verificador de governança GBR KARDEK — elo dev ↔ GitHub ↔ Supabase.
 *
 * Uso:
 *   node scripts/verify-governance.cjs                # git + env + Supabase
 *   node scripts/verify-governance.cjs --offline      # git + env (modo INTERNAL)
 *   node scripts/verify-governance.cjs --use-example  # testa o host do .env.example
 *
 * Regras (docs/GOVERNANCA.md § 8):
 *   - nunca imprime valores de chaves, apenas presença;
 *   - exit 0 = íntegro, exit 1 = pelo menos uma falha.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const APP_DIR = path.resolve(__dirname, '..');
const REPO_DIR = path.resolve(APP_DIR, '..');
const FLAGS = new Set(process.argv.slice(2));
const OFFLINE = FLAGS.has('--offline');
const USE_EXAMPLE = FLAGS.has('--use-example');
const TIMEOUT_MS = 8000;
const REQUIRED_TABLES = ['assets', 'user_permissions', 'inventory_config', 'audit_logs'];
const TAG = { ok: '[ OK ]', fail: '[FALHA]', warn: '[AVISO]' };

const results = [];

function report(status, area, message) {
  results.push({ status, area });
  console.log(`${TAG[status]} ${area.padEnd(11)} ${message}`);
}

const ok = (area, message) => report('ok', area, message);
const fail = (area, message) => report('fail', area, message);
const warn = (area, message) => report('warn', area, message);

function git(...gitArgs) {
  try {
    return execFileSync('git', ['-C', REPO_DIR, ...gitArgs], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function parseEnvFile(file) {
  const parsed = {};
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return parsed;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    parsed[key] = value;
  }
  return parsed;
}

function resolveEnv() {
  const env = {};
  const sources = USE_EXAMPLE
    ? ['.env.example', '.env.local', '.env']
    : ['.env.local', '.env'];

  for (const name of sources) {
    Object.assign(env, parseEnvFile(path.join(APP_DIR, name)));
  }
  // Variáveis do processo vencem os arquivos (CI / linha de comando).
  for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_ADMIN_EMAIL']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

async function httpStatus(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    return res.status;
  } catch (err) {
    if (err && err.name === 'AbortError') return 'timeout';
    const cause = err && err.cause && err.cause.code ? err.cause.code : 'rede indisponível';
    return String(cause);
  } finally {
    clearTimeout(timer);
  }
}

function checkStructure() {
  const pkgPath = path.join(APP_DIR, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    fail('estrutura', 'Inventariador-main/package.json ausente — app não está no layout esperado');
    return null;
  }
  if (!fs.existsSync(path.join(REPO_DIR, '.git'))) {
    fail('estrutura', 'raiz do repositório git não encontrada acima de Inventariador-main/');
    return null;
  }
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    fail('estrutura', 'package.json inválido (JSON malformado)');
    return null;
  }
  ok('estrutura', `app em Inventariador-main/ · versão ${pkg.version || '?'}`);
  return pkg;
}

function checkGit() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (!branch) {
    fail('git', 'não foi possível ler a branch atual');
    return;
  }
  if (branch === 'main' || branch === 'master') {
    ok('git', `branch de release (${branch})`);
  } else {
    warn('git', `branch de trabalho (${branch}) — faça PR para main`);
  }

  const dirty = git('status', '--porcelain');
  if (dirty === null) {
    warn('git', 'status indisponível');
  } else if (dirty === '') {
    ok('git', 'árvore de trabalho limpa');
  } else {
    const count = dirty.split(/\r?\n/).filter(Boolean).length;
    warn('git', `${count} arquivo(s) não commitado(s) — commit antes do release`);
  }

  const hasOrigin = git('rev-parse', '--verify', '--quiet', 'origin/main');
  if (!hasOrigin) {
    warn('git', 'origin/main não existe localmente — rode git fetch');
    return;
  }
  const behind = Number(git('rev-list', '--count', 'HEAD..origin/main') || 0);
  const ahead = Number(git('rev-list', '--count', 'origin/main..HEAD') || 0);
  if (behind > 0) {
    fail('git', `${behind} commit(s) atrás de origin/main — atualize antes de trabalhar`);
  } else if (ahead > 0) {
    warn('git', `${ahead} commit(s) locais à frente de origin/main — push pendente`);
  } else {
    ok('git', 'sincronizado com origin/main');
  }

  const head = git('rev-parse', '--short', 'HEAD');
  if (head) ok('git', `HEAD ${head}`);
}

function checkEnv() {
  const env = resolveEnv();
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_ANON_KEY || '').trim();
  const admin = (env.VITE_ADMIN_EMAIL || '').trim();

  if (!url || !key) {
    fail(
      'env',
      'VITE_SUPABASE_URL/ANON_KEY ausentes — app sobe em INTERNAL (offline). Defina em Inventariador-main/.env',
    );
  } else {
    ok('env', `credenciais presentes (url ${url.replace(/^https?:\/\//, '')} · anon key ${key.length} chars)`);
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/i.test(url)) {
      warn('env', 'VITE_SUPABASE_URL não parece um endpoint de projeto Supabase');
    }
  }

  if (admin) {
    ok('env', 'VITE_ADMIN_EMAIL configurado (soberania do proprietário ativa)');
  } else {
    warn('env', 'VITE_ADMIN_EMAIL ausente — ninguém terá soberania de admin');
  }
  return { url: url.replace(/\/+$/, ''), key, ready: Boolean(url && key) };
}

async function checkSupabase({ url, key, ready }) {
  if (!ready) {
    warn('supabase', 'sem credenciais — verificação de nuvem ignorada');
    return;
  }
  if (OFFLINE) {
    warn('supabase', '--offline informado — verificação de nuvem ignorada');
    return;
  }

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  // Sonda uma tabela real, nunca a raiz do PostgREST: `/rest/v1/` responde 401
  // mesmo em projeto saudável, o que gerava falso negativo.
  const probeTable = REQUIRED_TABLES[0];
  const rest = await httpStatus(`${url}/rest/v1/${probeTable}?select=*&limit=1`, headers);
  if (rest === 200 || rest === 206) {
    ok('supabase', `REST respondendo (${rest}) · sonda ${probeTable}`);
  } else if (rest === 401 || rest === 403) {
    fail(
      'supabase',
      `REST rejeitou a chave (${rest}) — publishable/anon key inválida ou de outro projeto`,
    );
  } else if (rest === 404) {
    fail('supabase', `REST sem a tabela ${probeTable} — rode docs/supabase_bootstrap.sql`);
  } else {
    fail('supabase', `REST inacessível (${rest}) — host do projeto não existe ou está bloqueado`);
  }

  const auth = await httpStatus(`${url}/auth/v1/health`, headers);
  if (auth === 200) {
    ok('supabase', 'AUTH saudável (200)');
  } else {
    fail('supabase', `AUTH inacessível (${auth})`);
  }

  if (rest !== 200 && rest !== 206) {
    warn('supabase', 'tabelas não verificadas — corrija a conectividade primeiro');
    return;
  }

  for (const table of REQUIRED_TABLES) {
    const status = await httpStatus(`${url}/rest/v1/${table}?select=*&limit=1`, headers);
    if (status === 200 || status === 206) {
      ok('supabase', `tabela ${table} acessível`);
    } else if (status === 404) {
      fail('supabase', `tabela ${table} inexistente — rode docs/supabase_bootstrap.sql`);
    } else if (status === 401 || status === 403) {
      warn('supabase', `tabela ${table} existe mas bloqueia a anon key (${status}) — RLS ativa`);
    } else {
      fail('supabase', `tabela ${table} respondeu ${status}`);
    }
  }
}

async function main() {
  console.log('\n=== GBR KARDEK · governança dev <-> GitHub <-> Supabase ===');
  console.log(`app: ${APP_DIR}`);
  console.log(`repo: ${REPO_DIR}\n`);

  checkStructure();
  checkGit();
  const env = checkEnv();
  await checkSupabase(env);

  const failures = results.filter((r) => r.status === 'fail').length;
  const warnings = results.filter((r) => r.status === 'warn').length;

  console.log(
    `\n${failures === 0 ? 'GOVERNANÇA ÍNTEGRA' : 'GOVERNANÇA COM PENDÊNCIAS'} — ${failures} falha(s), ${warnings} aviso(s)\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('[FALHA] verificador abortou:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
