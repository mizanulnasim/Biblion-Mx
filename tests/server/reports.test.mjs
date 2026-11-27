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

test('publisher and vendor reports: statement, vendors and payables add up', () => {
  const s = shop();
  const id = (r) => r.data.record_id;
  const pub = id(s.call(s.owner, 'setup.supplier.save', { kind: 'publisher', name: 'Sheba', commission: 25, sell_discount: 0, pays_on: 'sale', opening_due: 1000, status: 'active' }));
  const vendor = id(s.call(s.owner, 'setup.supplier.save', { kind: 'vendor', name: 'Milk Vita', opening_due: 200, status: 'active' }));
  const book = id(s.call(s.owner, 'books.save', { title: 'Nodi', publisher_id: pub, printed_price: 400, status: 'active' }));
  s.call(s.owner, 'books.delivery.save', { date: today(), publisher_id: pub, lines: [{ book_id: book, printed_price: 400, qty: 5 }] });
  s.call(s.owner, 'books.sales.save', { date: today(), lines: [{ book_id: book, qty: 2, amount: 800 }] });
  s.call(s.owner, 'money.save', { kind: 'publisher_payment', date: today(), amount: 500, account_id: s.ids.cash, party_id: pub });
  s.call(s.owner, 'money.save', { kind: 'vendor_purchase_credit', date: today(), amount: 900, party_id: vendor, ref: 'B-7' });
  s.call(s.owner, 'money.save', { kind: 'vendor_payment', date: today(), amount: 600, account_id: s.ids.cash, party_id: vendor });
  const get = (report, more = {}) => s.call(s.owner, 'reports.get', { report, from: today(), to: today(), ...more }).data;
  // Sheba: 1,000 before; 2 copies sold at 300 each add 600; 500 paid.
  const st = get('publisher_statement', { party_id: pub }).model;
  const account = st.blocks.find((b) => b.kind === 'kv').rows.map((r) => r.value);
  assert.deepEqual(account, [1000, 600, -500, 0, 1100]);
  // Milk Vita: 200 before, 900 on credit, 600 paid.
  const v = get('vendors').model.blocks[0].rows[0];
  assert.deepEqual([v[0], v[1], v[2], v[5], v[6], v[7]], ['Milk Vita', 200, 900, 600, 500, 900]);
  const pay = get('payables').model;
  assert.deepEqual(pay.blocks[pay.blocks.length - 1].text, { t: 'rep.payables_ok', p: {} });
  // A statement names the vendor asked for; a publisher id isn't a vendor.
  assert.equal(s.call(s.owner, 'reports.get', { report: 'vendor_statement', party_id: pub }).error.code, 'NOT_FOUND');
});
