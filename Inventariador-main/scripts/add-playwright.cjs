/**
 * Quick script to add Playwright-related entries to package.json and .gitignore.
 */
const fs = require('fs');
const path = require('path');

const PKG_PATH = path.join(__dirname, '..', 'package.json');
const GIT_PATH = path.join(__dirname, '..', '.gitignore');

// Add npm scripts
const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
pkg.scripts['test:e2e'] = 'playwright test';
pkg.scripts['test:e2e:ui'] = 'playwright test --ui';
pkg.scripts['test:e2e:debug'] = 'playwright test --debug';
pkg.scripts['test:e2e:report'] = 'playwright show-report';
pkg.scripts['test:e2e:install'] = 'npx playwright install --with-deps';
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
console.log('✓ Added Playwright scripts to package.json');

// Add .gitignore entries
let gitignore = fs.readFileSync(GIT_PATH, 'utf8');
const entries = [
  '\n# Playwright E2E test artifacts',
  '/test-results/',
  '/playwright-report/',
  '/playwright/.cache/',
  '**/__screenshots__/',
];
for (const entry of entries) {
  if (!gitignore.includes(entry)) {
    gitignore += entry + '\n';
  }
}
fs.writeFileSync(GIT_PATH, gitignore, 'utf8');
console.log('✓ Added Playwright entries to .gitignore');

console.log('\n✅ Done! Run `npm install --save-dev @playwright/test --legacy-peer-deps` to install Playwright.');
