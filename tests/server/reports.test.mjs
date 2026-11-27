// Reports on the real server bundle: each builds for a shareholder, every
// message id in it exists, who may see each, and some figures.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';
import { loadLocale } from '../../tools/build.mjs';
import { REPORTS } from '../../shared/reports/reports.js';

const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const en = loadLocale('en');

// Every message id a report model uses.
function ids(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => ids(v, out));
  else if (value && typeof value === 'object') {
    if (typeof value.t === 'string') out.push(value.t);
    Object.values(value).forEach((v) => ids(v, out));
  }
  return out;
}

test('every report builds, and every message id in it exists', () => {
  const s = shop();
  s.call(s.owner, 'money.save', { kind: 'expense', date: today(), amount: 500, account_id: s.ids.cash, category_id: s.ids.milk });
  s.call(s.owner, 'money.save', { kind: 'due_collected', date: today(), amount: 100, account_id: s.ids.cash, party_id: s.ids.rahim });
  for (const report of Object.keys(REPORTS)) {
    const reply = s.call(s.owner, 'reports.get', { report });
    assert.equal(reply.ok, true, report);
    // Titles, headings and labels are texts, never bare ids.
    const { model } = reply.data;
    const labels = [model.title, ...model.blocks.flatMap((b) => [b.title, ...(b.rows && b.kind === 'kv' ? b.rows.map((r) => r.label) : []), ...(b.columns || []).map((c) => c.label), ...(b.labels || [])])];
    assert.ok(labels.filter((x) => x !== undefined).every((x) => typeof x === 'object'), report);
    const missing = ids(model).filter((id) => !(id in en));
    assert.deepEqual(missing, [], report);
  }
});

test('who may see a report, and the figures in two of them', () => {
  const s = shop();
  assert.equal(s.call(s.manager, 'reports.get', { report: 'dues' }).error.code, 'FORBIDDEN');
  s.call(s.owner, 'money.save', { kind: 'expense', date: today(), amount: 500, account_id: s.ids.cash, category_id: s.ids.milk });
  s.call(s.owner, 'money.save', { kind: 'transfer', date: today(), amount: 200, account_id: s.ids.cash, to_account_id: s.ids.bkash });
  const all = s.call(s.owner, 'reports.get', { report: 'all_money', from: today(), to: today() }).data.model;
  // In: 200 (bKash); out: 500 + 200 (cash).
  assert.deepEqual(all.blocks[0].rows.slice(0, 3).map((r) => r.value), [200, -700, -500]);
  // Rahim owes 300 (the shop's sample due); people owing nothing are left out.
  const dues = s.call(s.owner, 'reports.get', { report: 'dues', date: today() }).data.model;
  assert.deepEqual(dues.blocks[0].rows.map((r) => [r[0], r[2]]), [['Rahim', 300]]);
  assert.equal(s.call(s.owner, 'reports.get', { report: 'all_money', from: today(), to: '2000-01-01' }).error.code, 'VALIDATION');
});
