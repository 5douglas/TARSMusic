#!/usr/bin/env node

/**
 * Guards against the locale-API anti-patterns that cause Hermes-on-Android
 * ANRs (https://github.com/facebook/hermes/issues/867).
 *
 * Banned patterns outside src/utils/intl.ts:
 *   1. `String.prototype.localeCompare(...)` — every call clones a fresh
 *      ICU collator on Android ARM64 (2-8s per call). Use `defaultCollator`
 *      or `baseCollator` from `src/utils/intl.ts` instead.
 *   2. `new Intl.DateTimeFormat(...)` — same per-call ICU init shape. Use
 *      `getDateTimeFormat(...)` from `src/utils/intl.ts` instead.
 *
 * The canonical helpers live in src/utils/intl.ts and ARE allowed to use
 * those constructors directly — that's the whole point of the file.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const allowlist = new Set([
  path.join(repoRoot, 'src', 'utils', 'intl.ts'),
  // Self-reference: this script's regexes intentionally contain the literal
  // strings being banned, so it must allowlist itself.
  path.join(repoRoot, 'scripts', 'validate-intl.js'),
]);

// Bans applied to files matching these directories.
const scanRoots = [
  path.join(repoRoot, 'src'),
  path.join(repoRoot, 'modules'),
];

const SOURCE_EXT = /\.(ts|tsx|js|jsx)$/;

const bans = [
  {
    name: 'localeCompare',
    pattern: /\.localeCompare\s*\(/,
    fix: "Use `defaultCollator.compare(a, b)` (case/accent-sensitive) or `baseCollator.compare(a, b)` (case/accent-insensitive) from src/utils/intl.ts.",
  },
  {
    name: 'new Intl.DateTimeFormat',
    pattern: /new\s+Intl\.DateTimeFormat\s*\(/,
    fix: "Use `getDateTimeFormat(locale, options).format(date)` from src/utils/intl.ts.",
  },
];

function walk(dir, hits) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return;
    throw e;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(full, hits);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXT.test(entry.name)) continue;
    if (allowlist.has(full)) continue;

    const contents = fs.readFileSync(full, 'utf8');
    const lines = contents.split('\n');
    lines.forEach((line, idx) => {
      for (const ban of bans) {
        if (ban.pattern.test(line)) {
          hits.push({ file: path.relative(repoRoot, full), line: idx + 1, ban, source: line.trim() });
        }
      }
    });
  }
}

const hits = [];
for (const root of scanRoots) {
  walk(root, hits);
}

if (hits.length === 0) {
  console.log('validate-intl: clean ✓');
  process.exit(0);
}

for (const hit of hits) {
  console.error(`${hit.file}:${hit.line}  banned ${hit.ban.name}`);
  console.error(`  ${hit.source}`);
  console.error(`  fix: ${hit.ban.fix}`);
  console.error('');
}
console.error(`validate-intl: ${hits.length} violation${hits.length === 1 ? '' : 's'}`);
process.exit(1);
