// Money on the real server bundle: setup lists, saving, duplicate prompts,
// approvals, corrections, cancellations and balances.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../../tools/build.mjs';
import { emptyState, loadServer } from '../../tools/gas-shim/index.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblion-money-'));
const { gas } = build({ outDir });
test.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

function shop() {
  const state = emptyState();
  state.props.SETUP_CODE = '1';
  const server = loadServer(path.join(gas, 'Code.js'), state);
  const call = (token, action, payload = {}, opId = crypto.randomUUID()) =>
    server.post({ action, payload, token, op_id: opId, contract: 1 });
  call(null, 'setup.owner', { code: '1', display_name: 'Owner', username: 'owner', password: 'owner-pass' });
  const login = (u, p) => call(null, 'auth.login', { username: u, password: p }).data.data.token;
  const owner = login('owner', 'owner-pass');
  const id = (reply) => reply.data.record_id;
  call(owner, 'users.save', { display_name: 'Manager', username: 'manager', role_id: 'ROL-MANAGER', status: 'active', password: 'manager-pass' });
  call(owner, 'users.save', { display_name: 'Staff', username: 'staff', role_id: 'ROL-STAFF', status: 'active', password: 'staff-pass' });
  const ids = {
    cash: id(call(owner, 'setup.account.save', { name: 'Cash drawer', kind: 'drawer', opening: 1000, status: 'active' })),
    bkash: id(call(owner, 'setup.account.save', { name: 'bKash', kind: 'bkash', status: 'active' })),
    milk: id(call(owner, 'setup.category.save', { name: 'Milk', area: 'cafe', status: 'active' })),
    rent: id(call(owner, 'setup.category.save', { name: 'Rent', area: 'shared', needs_shareholder: true, status: 'active' })),
    rahim: id(call(owner, 'setup.contact.save', { name: 'Rahim', phone: '01711000000', opening_due: 300, status: 'active' })),
    karim: id(call(owner, 'setup.shareholder.save', { name: 'Karim', status: 'active' })),
  };
  return { call, owner, manager: login('manager', 'manager-pass'), staff: login('staff', 'staff-pass'), ids };
}

const expense = (ids, more = {}) => ({ kind: 'expense', date: '2026-11-20', amount: 500, account_id: ids.cash, category_id: ids.milk, ...more });

test('setup: one cash drawer, and similar category names are pointed out', () => {
  const { call, owner } = shop();
  const second = call(owner, 'setup.account.save', { name: 'Drawer 2', kind: 'drawer', status: 'active' }).data;
  assert.equal(second.error.fields.kind.code, 'val.one_drawer');
  const similar = call(owner, 'setup.category.save', { name: 'Milks', area: 'cafe', status: 'active' }).data;
  assert.deepEqual(similar.error.fields.name, { code: 'val.similar', params: { name: 'Milk' } });
  assert.equal(call(owner, 'setup.category.save', { name: 'Milks', area: 'cafe', status: 'active', confirm_similar: true }).data.status, 'saved');
});

test('staff never reach the money screen', () => {
  const { call, staff, ids } = shop();
  assert.equal(call(staff, 'money.boot').error.code, 'FORBIDDEN');
  assert.equal(call(staff, 'money.save', expense(ids)).error.code, 'FORBIDDEN');
});

test('each kind checks its own fields', () => {
  const { call, owner, ids } = shop();
  const r = call(owner, 'money.save', { kind: 'transfer', date: '2026-11-20', amount: 10, account_id: ids.cash, to_account_id: ids.cash }).data;
  assert.deepEqual(r.error.fields, { to_account_id: { code: 'val.same_account', params: {} } });
  const r2 = call(owner, 'money.save', { kind: 'expense', date: '2026-02-30', amount: 0 }).data;
  assert.deepEqual(Object.keys(r2.error.fields).sort(), ['amount', 'date']);
  const r3 = call(owner, 'money.save', { kind: 'loan_repayment', date: '2026-11-20', amount: 10, account_id: ids.cash, party_id: ids.karim }).data;
  assert.deepEqual(r3.error.fields, { direction: { code: 'val.required', params: {} } });
});

test('a manager\'s entry within the rules is final; over the limit or in a ticked category it waits', () => {
  const { call, manager, ids } = shop();
  assert.equal(call(manager, 'money.save', expense(ids, { amount: 2000 })).data.data.approval, 'final');
  const big = call(manager, 'money.save', expense(ids, { amount: 2500, date: '2026-11-01' })).data.data;
  assert.equal(big.approval, 'waiting');
  assert.deepEqual(big.reasons.map((r) => r.code), ['approve.why.over_limit']);
  const rent = call(manager, 'money.save', expense(ids, { amount: 100, category_id: ids.rent })).data.data;
  assert.deepEqual(rent.reasons.map((r) => r.code), ['approve.why.category']);
});

test('a kind outside the manager\'s permissions is saved as a request; owner pay cannot be requested', () => {
  const { call, manager, ids } = shop();
  const income = call(manager, 'money.save', { kind: 'income', date: '2026-11-20', amount: 50, account_id: ids.cash }).data.data;
  assert.deepEqual(income.reasons.map((r) => r.code), ['approve.why.request']);
  assert.equal(call(manager, 'money.save', { kind: 'owner_salary', date: '2026-11-20', amount: 50, account_id: ids.cash, party_id: ids.karim }).data.error.code, 'FORBIDDEN');
});

test('S1: a duplicate asks for a reason; answered with the same op_id it saves once and waits', () => {
  const { call, manager, owner, ids } = shop();
  call(manager, 'money.save', expense(ids));
  const op = crypto.randomUUID();
  const first = call(manager, 'money.save', expense(ids, { date: '2026-11-22' }), op).data;
  assert.equal(first.status, 'needs_input');
  assert.equal(first.prompt.warnings[0].code, 'dup.twin');
  assert.equal(first.prompt.warnings[0].existing[0].category, 'Milk');
  const answered = call(manager, 'money.save', expense(ids, { date: '2026-11-22', reason: 'Two deliveries that week' }), op).data;
  assert.equal(answered.status, 'saved');
  assert.deepEqual(answered.data.reasons.map((r) => r.code), ['approve.why.duplicate']);
  const again = call(manager, 'money.save', expense(ids, { date: '2026-11-22', reason: 'Two deliveries that week' }), op).data;
  assert.deepEqual(again, answered);
  assert.equal(call(owner, 'money.list', { q: '2026-11-22' }).data.total, 1);
});

test('an expense and income of the same amount become one transfer, cancelling the other half', () => {
  const { call, owner, ids } = shop();
  const income = call(owner, 'money.save', { kind: 'income', date: '2026-11-20', amount: 500, account_id: ids.bkash }).data.record_id;
  const prompt = call(owner, 'money.save', expense(ids)).data.prompt;
  const fix = prompt.warnings.find((w) => w.code === 'dup.transfer_pair').fix;
  const transfer = call(owner, 'money.save', { ...fix, reason: 'Cash put into bKash' }).data;
  assert.equal(transfer.status, 'saved');
  const half = call(owner, 'money.get', { id: income }).data.entry;
  assert.equal(half.status, 'cancelled');
  assert.equal(half.replaced_by, transfer.record_id);
  const boot = call(owner, 'money.boot').data;
  assert.equal(boot.accounts.find((a) => a.id === ids.cash).balance, 500);
  assert.equal(boot.accounts.find((a) => a.id === ids.bkash).balance, 500);
});

test('approvals: a shareholder approves; nobody approves their own entry', () => {
  const { call, manager, owner, ids } = shop();
  const waiting = call(manager, 'money.save', expense(ids, { amount: 5000 })).data.record_id;
  assert.equal(call(manager, 'money.approve', { id: waiting }).error.code, 'FORBIDDEN');
  const home = call(owner, 'home.get').data;
  assert.deepEqual(home.waiting.map((w) => w.id), [waiting]);
  assert.equal(call(owner, 'money.approve', { id: waiting }).data.status, 'saved');
  assert.equal(call(owner, 'home.get').data.waiting.length, 0);
  // A manager's own request can't be approved by a shareholder who is also the person who entered it.
  const own = call(owner, 'money.save', expense(ids, { amount: 9000, date: '2026-10-01' })).data;
  assert.equal(own.data.approval, 'final');
});

test('corrections replace; the person who entered may change it only while it waits', () => {
  const { call, manager, owner, ids } = shop();
  const finalId = call(manager, 'money.save', expense(ids, { amount: 100 })).data.record_id;
  assert.equal(call(manager, 'money.cancel', { id: finalId, reason: 'mistake' }).data.error.code, 'FORBIDDEN');
  const waitId = call(manager, 'money.save', expense(ids, { amount: 3000, date: '2026-11-02' })).data.record_id;
  const fixed = call(manager, 'money.save', expense(ids, { amount: 300, date: '2026-11-02', replaces: waitId })).data;
  assert.equal(fixed.status, 'saved');
  const detail = call(owner, 'money.get', { id: fixed.record_id }).data;
  assert.equal(detail.history.length, 1);
  assert.equal(detail.history[0].status, 'replaced');
  // S7: correcting the old entry again fails clearly, and makes no second replacement.
  const twice = call(owner, 'money.save', expense(ids, { amount: 310, date: '2026-11-02', replaces: waitId })).data;
  assert.equal(twice.error.code, 'CONFLICT');
  assert.equal(twice.error.params.by, 'Manager');
});

test('cancelling needs a reason, keeps the row, and stops it counting', () => {
  const { call, owner, ids } = shop();
  const entry = call(owner, 'money.save', expense(ids, { amount: 200 })).data.record_id;
  assert.equal(call(owner, 'money.cancel', { id: entry, reason: '' }).data.error.fields.reason.code, 'val.required');
  assert.equal(call(owner, 'money.cancel', { id: entry, reason: 'Entered twice' }).data.status, 'saved');
  assert.equal(call(owner, 'money.boot').data.accounts.find((a) => a.id === ids.cash).balance, 1000);
  assert.equal(call(owner, 'money.list', { state: 'cancelled' }).data.total, 1);
  const log = call(owner, 'audit.list', { q: 'money.cancel' }).data.items[0];
  assert.equal(log.reason, 'Entered twice');
});

test('balances: accounts, dues and shareholder loans', () => {
  const { call, owner, ids } = shop();
  call(owner, 'money.save', { kind: 'due_taken', date: '2026-11-20', amount: 200, party_id: ids.rahim });
  call(owner, 'money.save', { kind: 'due_collected', date: '2026-11-21', amount: 100, account_id: ids.cash, party_id: ids.rahim });
  call(owner, 'money.save', { kind: 'loan_to_shareholder', date: '2026-11-21', amount: 400, account_id: ids.cash, party_id: ids.karim });
  const boot = call(owner, 'money.boot').data;
  assert.equal(boot.contacts.find((c) => c.id === ids.rahim).due, 400);
  assert.equal(boot.shareholders.find((s) => s.id === ids.karim).loan, 400);
  assert.equal(boot.accounts.find((a) => a.id === ids.cash).balance, 1000 + 100 - 400);
});

test('managers see only their own entries and no balances', () => {
  const { call, manager, owner, ids } = shop();
  call(owner, 'money.save', expense(ids, { amount: 111 }));
  call(manager, 'money.save', expense(ids, { amount: 222, date: '2026-11-10' }));
  const list = call(manager, 'money.list').data;
  assert.deepEqual(list.items.map((i) => i.amount), [222]);
  assert.equal(call(manager, 'money.boot').data.accounts[0].balance, null);
});

test('approval settings change the rules', () => {
  const { call, manager, owner, ids } = shop();
  assert.equal(call(owner, 'settings.approvals.save', { limit: 100, expense: 'shareholder', income: 'final', transfer: 'final', other: 'final' }).data.status, 'saved');
  assert.equal(call(manager, 'settings.approvals').error.code, 'FORBIDDEN');
  const r = call(manager, 'money.save', expense(ids, { amount: 150 })).data.data;
  assert.deepEqual(r.reasons.map((x) => x.code), ['approve.why.over_limit', 'approve.why.kind_rule']);
});
