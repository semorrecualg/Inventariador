/**
 * sre-validator.cjs — Validador SRE para o Projeto GBR KARDEK
 *
 * Uso: node scripts/sre-validator.cjs [--fix]
 *
 * Verifica:
 *   1. Proibição de dialetos SQL em arquivos Dexie.js
 *   2. Presença do guardião selectedUnit em telas operacionais
 *   3. Ausência de console.log em produção
 *   4. Estrutura de rotas canônicas no App.tsx
 *
 * Exit code: 0 = ok, 1 = violações encontradas
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXIT_PASS = 0;
const EXIT_FAIL = 1;

// ── Arquivos que operam com Dexie.js (proibido SQL dialetos) ──────────────
const DEXIE_FILES = [
  'src/services/localDbService.ts',
  'src/services/sqliteService.ts',
  'src/services/syncService.ts',
  'src/services/persistenceService.ts',
  'src/services/DatabaseLoaderService.ts',
];

// ── Telas que exigem guardião selectedUnit ─────────────────────────────────
const SCREENS_WITH_GUARD = [
  'src/components/Dashboard.tsx',
  'src/components/AddressSelector.tsx',
  'src/components/Inventory.tsx',
  'src/components/InventoryCard.tsx',
];

// ── Padrões SQL proibidos ──────────────────────────────────────────────────
const SQL_PATTERNS = [
  /\bSELECT\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bCREATE\s+TABLE\b/i,
  /\bDROP\s+(TABLE|INDEX|VIEW)\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bDELETE\s+FROM\b/i,
];

// ── Helpers ────────────────────────────────────────────────────────────────

function readFileLines(filePath) {
  try {
    const fullPath = path.resolve(ROOT, filePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf-8').split('\n');
  } catch {
    return null;
  }
}

function findViolations(lines, patterns) {
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i])) {
        results.push({ line: i + 1, content: lines[i].trim(), pattern });
      }
    }
  }
  return results;
}

// ── Verificação 1: Proibição de SQL em Dexie ───────────────────────────────

function checkNoSqlInDexie() {
  console.log('\n🔍 [SRE] Verificando proibição de SQL em arquivos Dexie.js...');
  let totalViolations = 0;

  for (const filePath of DEXIE_FILES) {
    const lines = readFileLines(filePath);
    if (!lines) {
      console.log(`  ⚠️  Arquivo não encontrado: ${filePath}`);
      continue;
    }

    const violations = findViolations(lines, SQL_PATTERNS);

    // Falsos positivos conhecidos: comentários, strings literais, nomes de método
    const filtered = violations.filter(v => {
      const lower = v.content.toLowerCase();
      // Ignorar se for comentário ou string de exemplo
      if (lower.includes('//') || lower.includes('*') || lower.includes('exemplo')) return false;
      // Ignorar se for parte de nome de variável/método (ex: "selected", "inserted")
      if (lower.includes('selected') || lower.includes('inserted') || lower.includes('created')) return false;
      return true;
    });

    if (filtered.length > 0) {
      console.log(`  ❌ ${filePath} — ${filtered.length} violação(ões):`);
      for (const v of filtered) {
        console.log(`     Linha ${v.line}: ${v.content.substring(0, 100)}`);
      }
      totalViolations += filtered.length;
    } else {
      console.log(`  ✅ ${filePath} — OK`);
    }
  }

  return totalViolations;
}

// ── Verificação 2: Guardião selectedUnit ───────────────────────────────────

function checkSelectedUnitGuard() {
  console.log('\n🔍 [SRE] Verificando guardião selectedUnit nas telas...');
  let totalViolations = 0;

  for (const filePath of SCREENS_WITH_GUARD) {
    const lines = readFileLines(filePath);
    if (!lines) {
      console.log(`  ⚠️  Arquivo não encontrado: ${filePath}`);
      continue;
    }

    const content = lines.join('\n');
    const hasGuard =
      content.includes('selectedUnit') &&
      (content.includes('UNIT_SELECTION') || content.includes('pushScreen'));

    if (!hasGuard) {
      console.log(`  ⚠️  ${filePath} — possível falta de guardião selectedUnit`);
      totalViolations++;
    } else {
      console.log(`  ✅ ${filePath} — guardião presente`);
    }
  }

  return totalViolations;
}

// ── Verificação 3: console.log em produção ─────────────────────────────────

function checkConsoleLog() {
  console.log('\n🔍 [SRE] Verificando console.log em arquivos de produção...');
  let totalViolations = 0;

  const targetDirs = ['src/components', 'src/services', 'src/hooks', 'src/utils'];

  for (const dir of targetDirs) {
    const fullDir = path.resolve(ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = [];
  const walkDir = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walkDir(full);
      } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        if (!full.includes('__tests__') && !full.includes('.test.')) {
          files.push(full);
        }
      }
    }
  };
  walkDir(fullDir);

    for (const filePath of files) {
      const lines = readFileLines(filePath);
      if (!lines) continue;

      // Ignorar o logger.ts intencional (usa console.log internamente)
      const normPath = filePath.replace(/\\/g, '/');
      if (normPath.includes('src/utils/logger.ts')) continue;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Ignorar comentários e declarações de logger configurado
        if (/console\.log\(/.test(line) &&
            !line.trim().startsWith('//') &&
            !line.includes('// eslint-disable')) {
          console.log(`  ⚠️  ${filePath}:${i + 1} — console.log encontrado`);
          totalViolations++;
        }
      }
    }
  }

  if (totalViolations === 0) {
    console.log('  ✅ Nenhum console.log suspeito encontrado');
  }

  return totalViolations;
}

// ── Verificação 4: Rotas canônicas no App.tsx ──────────────────────────────

function checkCanonicalRoutes() {
  console.log('\n🔍 [SRE] Verificando rotas canônicas no App.tsx...');
  let totalViolations = 0;

  const lines = readFileLines('src/App.tsx');
  if (!lines) {
    console.log('  ⚠️  src/App.tsx não encontrado');
    return 1;
  }

  const content = lines.join('\n');
  const expectedScreens = [
    'AppScreen.LOGIN',
    'AppScreen.LOAD_DATABASE',
    'AppScreen.MODULE_SELECTION',
    'AppScreen.UNIT_SELECTION',
    'AppScreen.DASHBOARD',
    'AppScreen.ADDRESS_SELECTION',
    'AppScreen.INVENTORY',
  ];

  for (const screen of expectedScreens) {
    if (!content.includes(screen)) {
      console.log(`  ❌ Rota ausente: ${screen}`);
      totalViolations++;
    } else {
      console.log(`  ✅ ${screen} — presente`);
    }
  }

  // Verificar guardião atômico (selectedUnit check)
  if (content.includes('selectedUnit') && content.includes('UNIT_SELECTION')) {
    console.log('  ✅ Guardião atômico selectedUnit — presente');
  } else {
    console.log('  ❌ Guardião atômico selectedUnit — ausente ou incompleto');
    totalViolations++;
  }

  return totalViolations;
}

// ── Main ───────────────────────────────────────────────────────────────────

let exitCode = EXIT_PASS;

console.log('═══════════════════════════════════════════════');
console.log('  SRE AUDITOR — Validação de Governança GBR');
console.log('═══════════════════════════════════════════════');
console.log(`  Projeto: GBR KARDEK v24.50-PROD`);
console.log(`  Data:    ${new Date().toISOString()}`);
console.log('═══════════════════════════════════════════════');

let violations = 0;
violations += checkNoSqlInDexie();
violations += checkSelectedUnitGuard();
violations += checkConsoleLog();
violations += checkCanonicalRoutes();

console.log('\n═══════════════════════════════════════════════');
console.log(`  Total de violações: ${violations}`);
console.log('═══════════════════════════════════════════════');

if (violations > 0) {
  console.log('\n  ❌ VALIDAÇÃO SRE: FALHOU — Corrija as violações acima.');
  exitCode = EXIT_FAIL;
} else {
  console.log('\n  ✅ VALIDAÇÃO SRE: APROVADO — Nenhuma violação encontrada.');
}

process.exit(exitCode);
