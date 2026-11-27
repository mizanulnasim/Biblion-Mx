// The daily shift and day closing on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { shop } from './shop.mjs';

const DAY = '2026-11-20';

function withAccounts() {
  const s = shop();
  s.ids.held = s.call(s.owner, 'setup.account.save', { name: 'Held by Karim', kind: 'owner', shareholder_id: s.ids.karim, status: 'active' }).data.record_id;
  s.ids.bank = s.call(s.owner, 'setup.account.save', { name: 'Card bank', kind: 'bank', status: 'active' }).data.record_id;
  return s;
}

// Drawer opens at 1,000. Sales 5,000: cash 3,000, bKash 1,200, card 500, Rahim's due 300.
// 2,000 handed to Karim. Expected in the drawer: 1,000 + 3,000 − 2,000 = 2,000.
const shiftOf = (ids, more = {}) => ({
  date: DAY, net_sales: 5000, books_sales: 1500, cash: 3000, bkash: 1200, card: 500,
  dues: [{ party_id: ids.rahim, amount: 300 }],
  handed: 2000, handed_to: ids.held, bkash_account_id: ids.bkash, card_account_id: ids.bank,
  actual_cash: 2000, ...more,
});

test('a balanced shift by a manager is final, and moves every account', () => {
  const { call, manager, owner, ids } = withAccounts();
  const r = call(manager, 'shift.save', shiftOf(ids)).data;
  assert.equal(r.status, 'saved');
  assert.equal(r.data.approval, 'final');
  const boot = call(owner, 'money.boot').data;
  const balance = (id) => boot.accounts.find((a) => a.id === id).balance;
  assert.equal(balance(ids.cash), 2000);
  assert.equal(balance(ids.bkash), 1200);
  assert.equal(balance(ids.bank), 500);
  assert.equal(balance(ids.held), 2000);
  assert.equal(boot.contacts.find((c) => c.id === ids.rahim).due, 600);
});

test('any short or over, however small, waits for a shareholder; the drawer then holds what was counted', () => {
  const { call, manager, owner, ids } = withAccounts();
  const r = call(manager, 'shift.save', shiftOf(ids, { actual_cash: 1999.5 })).data.data;
  assert.equal(r.approval, 'waiting');
  assert.deepEqual(r.reasons, [{ code: 'approve.why.short', params: { amount: 0.5 } }]);
  const boot = call(owner, 'money.boot').data;
  assert.equal(boot.accounts.find((a) => a.id === ids.cash).balance, 1999.5);
});

test('Loyverse\'s expected cash is kept beside the app\'s; only the app\'s figure decides', () => {
  const { call, manager, owner, ids } = withAccounts();
  // The app expects 2,000 and 2,000 is counted: balanced and final, though
  // Loyverse expected 2,150.
  const r = call(manager, 'shift.save', shiftOf(ids, { pos_expected: 2150 })).data;
  assert.equal(r.data.approval, 'final');
  const { details } = call(owner, 'money.get', { id: r.record_id }).data.entry;
  assert.deepEqual([details.short_over, details.pos_expected, details.pos_gap], [0, 2150, -150]);
});

test('the split must add up to net sales, and each account named must exist', () => {
  const { call, manager, ids } = withAccounts();
  const r = call(manager, 'shift.save', shiftOf(ids, { card: 400, bkash_account_id: null })).data;
  assert.deepEqual(r.error.fields.net_sales, { code: 'val.split', params: { split: 4900, diff: 100 } });
  assert.deepEqual(r.error.fields.bkash_account_id, { code: 'val.required', params: {} });
  const r2 = call(manager, 'shift.save', shiftOf(ids, { dues: [{ party_id: ids.rahim, amount: 0 }] })).data;
  assert.equal(r2.error.fields['dues.0.amount'].code, 'val.amount_positive');
});

test('one shift per date; a correction replaces it', () => {
  const { call, manager, owner, ids } = withAccounts();
  const first = call(manager, 'shift.save', shiftOf(ids)).data.record_id;
  assert.equal(call(manager, 'shift.save', shiftOf(ids)).data.error.fields.date.code, 'val.shift_exists');
  const fixed = call(owner, 'shift.save', shiftOf(ids, { cash: 3100, net_sales: 5100, actual_cash: 2100, replaces: first })).data;
  assert.equal(fixed.status, 'saved');
  assert.equal(call(owner, 'money.get', { id: first }).data.entry.status, 'replaced');
  const prep = call(manager, 'shift.prepare', { date: DAY }).data;
  assert.equal(prep.existing.id, fixed.record_id);
  // The drawer before the shift leaves the shift itself out.
  assert.equal(prep.drawer_before, 1000);
});

test('F: a due in the shift and a separate "Due taken" for the same due are warned, both ways', () => {
  const { call, manager, ids } = withAccounts();
  call(manager, 'shift.save', shiftOf(ids));
  const due = call(manager, 'money.save', { kind: 'due_taken', date: DAY, amount: 300, party_id: ids.rahim }).data;
  assert.equal(due.status, 'needs_input');
  assert.equal(due.prompt.warnings[0].code, 'dup.due_in_shift');

  const other = withAccounts();
  other.call(other.manager, 'money.save', { kind: 'due_taken', date: DAY, amount: 300, party_id: other.ids.rahim });
  const shift = other.call(other.manager, 'shift.save', shiftOf(other.ids)).data;
  assert.equal(shift.status, 'needs_input');
  assert.equal(shift.prompt.warnings[0].code, 'dup.due_entered');
});

test('day closing: needs the shift, shows warnings, locks the day for managers, reopens with a reason', () => {
  const { call, manager, owner, ids } = withAccounts();
  assert.equal(call(manager, 'closing.day.close', { date: DAY }).data.error.fields.date.code, 'val.closing_shift');
  call(manager, 'shift.save', shiftOf(ids, { actual_cash: 1950 }));
  const list = call(manager, 'closing.day', { date: DAY }).data;
  assert.deepEqual(list.steps.map((s) => [s.id, s.state]), [['shift', 'done'], ['drawer', 'warn'], ['waiting', 'warn']]);
  assert.equal(list.can_close, true);
  assert.equal(list.can_reopen, false);
  assert.equal(call(manager, 'closing.day.close', { date: DAY, note: 'All fine' }).data.status, 'saved');
  assert.equal(call(manager, 'closing.day.close', { date: DAY }).data.error.code, 'CONFLICT');

  const late = call(manager, 'money.save', { kind: 'expense', date: DAY, amount: 50, account_id: ids.cash, category_id: ids.milk }).data;
  assert.deepEqual(late.error.fields.date, { code: 'val.day_closed', params: { date: DAY } });
  assert.equal(call(owner, 'money.save', { kind: 'expense', date: DAY, amount: 50, account_id: ids.cash, category_id: ids.milk }).data.status, 'saved');

  assert.equal(call(manager, 'closing.day.reopen', { date: DAY, reason: 'x' }).error.code, 'FORBIDDEN');
  assert.equal(call(owner, 'closing.day.reopen', { date: DAY, reason: 'A bill was missed' }).data.status, 'saved');
  const reopened = call(manager, 'closing.day', { date: DAY }).data;
  assert.equal(reopened.reopened.reason, 'A bill was missed');
  assert.equal(call(manager, 'money.save', { kind: 'expense', date: DAY, amount: 60, account_id: ids.cash, category_id: ids.milk }).data.status, 'saved');
});

test('home shows today\'s shift and closing to people who do them', () => {
  const { call, manager, staff } = withAccounts();
  const today = call(manager, 'home.get').data.today;
  assert.deepEqual(Object.keys(today).sort(), ['closed', 'date', 'shift']);
  assert.equal(today.shift, false);
  assert.equal(call(staff, 'home.get').data.today, null);
});

test('a shift sent twice from the phone is saved once', () => {
  const { call, manager, owner, ids } = withAccounts();
  const op = crypto.randomUUID();
  const a = call(manager, 'shift.save', shiftOf(ids), op).data;
  const b = call(manager, 'shift.save', shiftOf(ids), op).data;
  assert.deepEqual(a, b);
  assert.equal(call(owner, 'money.list', { kind: 'daily_shift' }).data.total, 1);
});
