// The deployer's initialize() and runSelfTest(), and the starting lists the
// first setup makes (rulebook S3).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../../tools/build.mjs';
import { emptyState, loadServer } from '../../tools/gas-shim/index.mjs';
import { shop } from './shop.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblion-deploy-'));
const { gas } = build({ outDir });
test.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

test('initialize makes the spreadsheets, the folder and one hourly trigger; the self test says what it found', () => {
  const state = emptyState();
  state.props.SETUP_CODE = '1';
  const server = loadServer(path.join(gas, 'Code.js'), state);
  const lines = server.initialize();
  assert.ok(lines.every((l) => l.startsWith('✓')), lines.join('\n'));
  assert.equal(Object.keys(state.books).length, 5);
  assert.deepEqual(state.triggers, ['jobHourly']);
  assert.match(state.log.at(-1), /✓ The hourly trigger/);
  server.initialize();
  assert.deepEqual(state.triggers, ['jobHourly']);
  // Without the trigger, the self test fails and names it.
  state.triggers = [];
  assert.throws(() => server.selfTest(), /1 problem\(s\): The hourly trigger/);
});

test('the first setup makes Biblion\'s starting lists, all of them changeable', () => {
  const s = shop();
  const money = s.call(s.owner, 'setup.money').data;
  const names = (list) => list.map((x) => x.name);
  for (const name of ['Cash drawer', 'bKash', 'Bank', 'Cash with Nasim', 'Cash with Mushfiq', 'Cash with Shourov']) assert.ok(names(money.accounts).includes(name), name);
  assert.equal(money.accounts.find((a) => a.name === 'Cash with Nasim').shareholder_id, money.shareholders.find((h) => h.name === 'Mizanul Islam Nasim').id);
  assert.equal(money.categories.filter((c) => c.name !== 'Milk').length, 10);
  const holders = money.shareholders.filter((h) => h.name !== 'Karim');
  assert.deepEqual(holders.map((h) => [h.name, h.salary]), [['Mizanul Islam Nasim', 10000], ['Mushfiqul Karim', 10000], ['Shourov Kabir', 10000]]);
  const shares = s.call(s.owner, 'shareholders.view').data;
  assert.deepEqual(shares.history[0].shares.map((x) => [x.name, x.percent]), [['Mizanul Islam Nasim', 46], ['Mushfiqul Karim', 44], ['Shourov Kabir', 10]]);
  const week = s.call(s.owner, 'rota.week', {}).data;
  assert.deepEqual(week.shifts.map((x) => [x.name, x.start, x.end]).sort(), [['Day', '11:00', '19:00'], ['Evening', '15:00', '23:00'], ['Morning', '09:00', '17:00']]);
  const templates = s.call(s.owner, 'tasks.templates', {}).data.items.map((x) => [x.title, x.role, x.repeat]);
  assert.deepEqual(templates.map((x) => x[0]).sort(), ['Café closing count', 'Day closing', 'Electricity bill', 'Month closing', 'Print the monthly accounts']);
  assert.deepEqual(templates.find((x) => x[0] === 'Month closing').slice(1), ['owner', 'monthly']);
});
