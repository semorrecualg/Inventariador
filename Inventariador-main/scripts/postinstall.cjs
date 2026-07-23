#!/usr/bin/env node
/**
 * postinstall.cjs — Cross-platform postinstall hook for husky setup.
 *
 * Creates .husky/_/ directory and copies/symlinks hook files there.
 * Replaces the original bash-only postinstall that broke on Windows.
 */

const fs = require('fs');
const path = require('path');

const huskyDir = path.resolve(__dirname, '..', '.husky');
const hooksDir = path.resolve(huskyDir, '_');

// Ensure .husky/_/ exists
fs.mkdirSync(hooksDir, { recursive: true });

// Copy husky.sh into _/
const huskySh = path.resolve(huskyDir, 'husky.sh');
const huskyShTarget = path.resolve(hooksDir, 'husky.sh');
if (fs.existsSync(huskySh)) {
  fs.copyFileSync(huskySh, huskyShTarget);
  console.log('[postinstall] ✓ husky.sh copied to .husky/_/');
} else {
  console.warn('[postinstall] ⚠ husky.sh not found at', huskySh);
}

// Copy pre-commit and pre-push hooks into _/
const hookFiles = ['pre-commit', 'pre-push'];
for (const hook of hookFiles) {
  const src = path.resolve(huskyDir, hook);
  const dest = path.resolve(hooksDir, hook);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`[postinstall] ✓ ${hook} copied to .husky/_/`);
  }
}

console.log('[postinstall] ✓ Husky hooks setup complete');
