#!/usr/bin/env node
// Traceability check between BACKLOG.md and tests (AGENTS.md, "Acceptance criteria").
//
// Fails (exit 1) when:
//   - a test names an AC ID that is not in BACKLOG.md, or that is retired
//   - an AC ID is defined twice in BACKLOG.md
// Reports criteria that have no automated test and no dated manual check.
// With --strict, those uncovered criteria also fail the run.
//
// Run from the repo root: node scripts/ac-coverage.mjs [--strict]

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const ID = 'AC-[A-Z]+-\\d{2}\\.\\d+';
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'test-results', 'playwright-report', '.swa']);
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/;

// 1. Read criteria from BACKLOG.md. A criterion is a line that starts with "- AC-...".
const active = new Set();
const retired = new Set();
const duplicates = [];
const backlog = readFileSync(join(root, 'BACKLOG.md'), 'utf8');
for (const line of backlog.split('\n')) {
  const m = line.match(new RegExp(`^- (${ID})(.*)$`));
  if (!m) continue;
  const [, id, rest] = m;
  if (active.has(id) || retired.has(id)) duplicates.push(id);
  if (/^\s*\(retired/i.test(rest)) retired.add(id);
  else active.add(id);
}

// 2. Find test files and read the IDs in their names: [AC-XXX-NN.n]
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else {
      yield join(dir, entry.name);
    }
  }
}

const tested = new Map(); // id -> files
for (const file of walk(root)) {
  if (!TEST_FILE.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(new RegExp(`\\[(${ID})\\]`, 'g'))) {
    if (!tested.has(m[1])) tested.set(m[1], new Set());
    tested.get(m[1]).add(file.slice(root.length + 1));
  }
}

// 3. Manual checks count only with a real date.
const manual = new Set();
const manualPath = join(root, 'docs', 'manual-checks.md');
if (existsSync(manualPath)) {
  for (const line of readFileSync(manualPath, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^- (${ID})\\b.*last checked:\\s*(\\d{4}-\\d{2}-\\d{2})`));
    if (m) manual.add(m[1]);
  }
}

// 4. Report.
const unknown = [];
const pointsAtRetired = [];
for (const id of tested.keys()) {
  if (retired.has(id)) pointsAtRetired.push(id);
  else if (!active.has(id)) unknown.push(id);
}
const uncovered = [...active].filter((id) => !tested.has(id) && !manual.has(id));

console.log(`Criteria: ${active.size} active, ${retired.size} retired`);
console.log(`Covered: ${active.size - uncovered.length} (automated: ${[...active].filter((id) => tested.has(id)).length}, manual: ${manual.size})`);

let failed = false;
if (duplicates.length) {
  failed = true;
  console.error(`\nERROR: defined more than once in BACKLOG.md: ${duplicates.join(', ')}`);
}
if (unknown.length) {
  failed = true;
  console.error(`\nERROR: tests reference IDs that are not in BACKLOG.md (typo?):\n  ${unknown.join('\n  ')}`);
}
if (pointsAtRetired.length) {
  failed = true;
  console.error(`\nERROR: tests reference retired criteria:\n  ${pointsAtRetired.join('\n  ')}`);
}
if (uncovered.length) {
  const label = strict ? 'ERROR' : 'note';
  console.log(`\n${label}: ${uncovered.length} criteria have no test and no dated manual check${strict ? '' : ' (reported only; use --strict to fail)'}`);
  if (process.env.AC_VERBOSE || strict) console.log('  ' + uncovered.join('\n  '));
  if (strict) failed = true;
}

process.exit(failed ? 1 : 0);
