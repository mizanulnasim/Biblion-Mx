import test from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../../shared/rules/approval.js';
import { findDuplicates } from '../../shared/rules/duplicates.js';
import { cashEffect, kindAccess, loanEffect } from '../../shared/money/kinds.js';

const settings = { limit: 2000, rules: { expense: 'final', income: 'final', transfer: 'final', other: 'final' } };
const manager = { level: 2, permissions: ['acc.entry', 'acc.expense', 'acc.transfer', 'acc.dues'] };
const owner = { level: 3, permissions: [] };
const codes = (d) => d.reasons.map((r) => r.code);

test('decide: a shareholder\'s own entries are final', () => {
  assert.deepEqual(decide(owner, { kind: 'expense', amount: 99999, category_needs_shareholder: true, dup_reason: 'x' }, settings),
    { final: true, needsShareholder: false, reasons: [] });
});

test('decide: a manager\'s entry within the rules is final', () => {
  assert.equal(decide(manager, { kind: 'expense', amount: 2000 }, settings).final, true);
});

test('decide: every reason to wait is listed', () => {
  const d = decide(manager, { kind: 'expense', amount: 2001, category_needs_shareholder: true, dup_reason: 'checked' },
    { ...settings, rules: { ...settings.rules, expense: 'shareholder' } });
  assert.equal(d.final, false);
  assert.equal(d.needsShareholder, true);
  assert.deepEqual(codes(d), ['approve.why.over_limit', 'approve.why.category', 'approve.why.kind_rule', 'approve.why.duplicate']);
  assert.deepEqual(d.reasons[0].params, { limit: 2000 });
});

test('decide: a kind outside the person\'s permissions is a request', () => {
  assert.deepEqual(codes(decide(manager, { kind: 'income', amount: 10 }, settings)), ['approve.why.request']);
});

test('kindAccess: direct, request, or not at all', () => {
  assert.equal(kindAccess(manager.permissions, 'expense'), 'direct');
  assert.equal(kindAccess(manager.permissions, 'income'), 'request');
  assert.equal(kindAccess(manager.permissions, 'owner_salary'), 'none');
  assert.equal(kindAccess([], 'expense'), 'none');
});

test('cash effects: in, out, transfer, none, and loan repayment by direction', () => {
  assert.equal(cashEffect({ kind: 'expense', amount: 50, account_id: 'A' }, 'A'), -50);
  assert.equal(cashEffect({ kind: 'income', amount: 50, account_id: 'A' }, 'A'), 50);
  assert.equal(cashEffect({ kind: 'income', amount: 50, account_id: 'A' }, 'B'), 0);
  const t = { kind: 'transfer', amount: 70, account_id: 'A', to_account_id: 'B' };
  assert.equal(cashEffect(t, 'A'), -70);
  assert.equal(cashEffect(t, 'B'), 70);
  assert.equal(cashEffect({ kind: 'due_taken', amount: 50, account_id: '' }, ''), 0);
  assert.equal(cashEffect({ kind: 'loan_repayment', amount: 30, account_id: 'A', direction: 'in' }, 'A'), 30);
  assert.equal(cashEffect({ kind: 'loan_repayment', amount: 30, account_id: 'A', direction: 'out' }, 'A'), -30);
  assert.equal(loanEffect({ kind: 'loan_to_shareholder', amount: 100 }) + loanEffect({ kind: 'loan_repayment', amount: 40, direction: 'in' }), 60);
});

const e = (id, more) => ({ id, kind: 'expense', amount: 500, date: '2026-11-20', account_id: 'MAC-CASH', category_id: 'EXC-MILK', note: '', ...more });

test('duplicates A: same kind, party and amount within 7 days', () => {
  const entry = e('new', {});
  assert.deepEqual(findDuplicates(entry, [e('TRX-1', { date: '2026-11-13' })]).map((w) => w.code), ['dup.twin']);
  assert.deepEqual(findDuplicates(entry, [e('TRX-1', { date: '2026-11-12' })]), []);
  assert.deepEqual(findDuplicates(entry, [e('TRX-1', { category_id: 'EXC-TEA' })]), []);
  assert.deepEqual(findDuplicates(entry, [e('TRX-1', { amount: 501 })]), []);
});

test('duplicates I: an expense and an income of the same amount and day offer one transfer', () => {
  const income = { id: 'TRX-9', kind: 'income', amount: 500, date: '2026-11-20', account_id: 'MAC-BKASH' };
  const [w] = findDuplicates(e('new', {}), [income]);
  assert.equal(w.code, 'dup.transfer_pair');
  assert.deepEqual(w.fix, { kind: 'transfer', date: '2026-11-20', amount: 500, account_id: 'MAC-CASH', to_account_id: 'MAC-BKASH', pair_id: 'TRX-9' });
});

test('duplicates I: a note that mentions bKash or a deposit suggests a transfer', () => {
  assert.deepEqual(findDuplicates(e('new', { note: 'Cash out to bKash' }), []).map((w) => w.code), ['dup.transfer_words']);
  assert.deepEqual(findDuplicates(e('new', { note: 'ব্যাংকে জমা' }), []).map((w) => w.code), ['dup.transfer_words']);
  assert.deepEqual(findDuplicates(e('new', { note: 'Milk for the café' }), []), []);
});
