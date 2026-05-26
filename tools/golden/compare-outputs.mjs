#!/usr/bin/env node
// Golden-file harness — compares extracted manhwa-convertor output
// against a legacy manhwa-pipeline baseline for the same input PDF.
//
// Usage:
//   node tools/golden/compare-outputs.mjs <legacy-dir> <new-dir>
//
// Exit code: 0 on full match, 1 on any failed check, 2 on usage error.

import fs from 'node:fs';
import path from 'node:path';

const [legacyDir, newDir] = process.argv.slice(2);
if (!legacyDir || !newDir) {
  console.error('Usage: node compare-outputs.mjs <legacy-dir> <new-dir>');
  process.exit(2);
}
for (const d of [legacyDir, newDir]) {
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) {
    console.error(`Not a directory: ${d}`);
    process.exit(2);
  }
}

const failures = [];

function check(label, pass, detail) {
  const tag = pass ? '✓' : '✗';
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`${tag} ${label}${suffix}`);
  if (!pass) failures.push(`${label}${suffix}`);
}

function readMaybe(dir, name) {
  const p = path.join(dir, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function panelCount(dir) {
  return fs.readdirSync(dir).filter((f) => /^panel.*\.jpe?g$/i.test(f)).length;
}

// 1. Required files present in both.
for (const name of ['script.txt', 'script.srt', 'manifest.json']) {
  check(`legacy has ${name}`, fs.existsSync(path.join(legacyDir, name)));
  check(`new has ${name}`, fs.existsSync(path.join(newDir, name)));
}

// 2. Panel JPEG count matches.
const legacyPanels = panelCount(legacyDir);
const newPanels = panelCount(newDir);
check('panel JPEG count matches', legacyPanels === newPanels,
  `legacy=${legacyPanels}, new=${newPanels}`);

// 3. script.txt paragraph count matches.
const legacyScript = readMaybe(legacyDir, 'script.txt') ?? '';
const newScript = readMaybe(newDir, 'script.txt') ?? '';
const legacyParas = legacyScript.split(/\n{2,}/).filter((p) => p.trim().length > 0);
const newParas = newScript.split(/\n{2,}/).filter((p) => p.trim().length > 0);
check('script.txt paragraph count matches', legacyParas.length === newParas.length,
  `legacy=${legacyParas.length}, new=${newParas.length}`);

// 4. script.txt size within 30% of legacy (catches prompt drift).
const denom = Math.max(legacyScript.length, 1);
const pctDelta = Math.abs(newScript.length - legacyScript.length) / denom;
check('script.txt size within 30% of legacy', pctDelta < 0.3,
  `legacy=${legacyScript.length} chars, new=${newScript.length} chars, delta=${(pctDelta * 100).toFixed(1)}%`);

// 5. Panel count matches paragraph count in BOTH outputs (SRT-sync invariant).
check('legacy paragraph count == legacy panel count', legacyParas.length === legacyPanels,
  `paragraphs=${legacyParas.length}, panels=${legacyPanels}`);
check('new paragraph count == new panel count', newParas.length === newPanels,
  `paragraphs=${newParas.length}, panels=${newPanels}`);

console.log('');
if (failures.length === 0) {
  console.log('✅ All checks passed.');
  process.exit(0);
}
console.log(`❌ ${failures.length} check(s) failed:`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
