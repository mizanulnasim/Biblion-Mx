// One-step install and check. Called by install.sh and install.bat.
//   1. checks the Node.js version
//   2. builds the app
//   3. runs the hygiene check
//   4. runs every test and reports the real counts
//   5. with --preview, starts the local preview
// Nothing is downloaded: the project has no dependencies.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, build } from './build.mjs';
import { check } from './check.mjs';
import { startPreview } from './preview.mjs';

const MIN_NODE = 22;
const say = (text) => process.stdout.write(`${text}\n`);
const fail = (text) => {
  process.stderr.write(`\n✗ ${text}\n`);
  process.exit(1);
};

const major = Number(process.versions.node.split('.')[0]);
if (major < MIN_NODE) fail(`Node.js ${MIN_NODE} or newer is needed (found ${process.versions.node}). Get it from https://nodejs.org`);
say(`✓ Node.js ${process.versions.node}`);

const built = build();
say(`✓ Built ${built.id} → ${path.relative(ROOT, built.web)}, ${path.relative(ROOT, built.gas)}`);

const problems = await check();
if (problems.length) fail(`Hygiene check found ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
say('✓ Hygiene check passed');

const spec = spawnSync(process.execPath, ['--test', 'tests/**/*.test.mjs'], { cwd: ROOT, encoding: 'utf8' });
const tests = Number((spec.stdout.match(/^# tests (\d+)/m) || [])[1] || 0);
const passed = Number((spec.stdout.match(/^# pass (\d+)/m) || [])[1] || 0);
const failed = Number((spec.stdout.match(/^# fail (\d+)/m) || [])[1] || 0);
if (spec.status !== 0 || failed || !tests) {
  process.stderr.write(spec.stdout);
  fail(`Tests: ${failed} of ${tests} failed`);
}
say(`✓ Tests: ${passed} of ${tests} passed`);

if (process.argv.includes('--preview')) {
  await startPreview({ fresh: process.argv.includes('--fresh') });
} else {
  say('\nReady. Start the full app on this computer with:\n  npm run preview');
}
