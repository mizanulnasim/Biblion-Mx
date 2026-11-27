// Payslips, pay accounts and the staff pay kinds on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const DAY = 86400000;
const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const lastMonth = () => {
  const d = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const daysIn = (month) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

function payroll() {
  const s = shop();
  const users = s.call(s.owner, 'users.list', {}).data.items;
  const userId = (name) => users.find((u) => u.username === name).id;
  const add = (fields) => s.call(s.owner, 'staff.save', { status: 'active', work_start: '10:00', work_end: '18:00', days_off: [{ day: 5 }], ...fields }).data.record_id;
  s.ids.sumi = add({ name: 'Sumi', user_id: userId('staff'), joined_on: plus(today(), -200), salary: 12000 });
  s.ids.rafi = add({ name: 'Rafi', user_id: userId('manager'), joined_on: plus(today(), -200), salary: 20000 });
  // No food allowance unless a test sets one.
  s.call(s.owner, 'settings.payroll.save', { divisor: 'period_days', food_rule: 'every_day', food_rates: [{ from: '2000-01-01', amount: 0 }] });
  return s;
}

const pay = (s, fields) => s.call(s.owner, 'money.save', { date: today(), account_id: s.ids.cash, party_id: s.ids.sumi, ...fields }).data;
const row = (s, month, name) => s.call(s.owner, 'payroll.month', { month }).data.rows.find((r) => r.staff.name === name);

test('a payslip: salary, unpaid leave and the absent days a shareholder cuts', () => {
  const s = payroll();
  const month = lastMonth();
  s.call(s.manager, 'leave.apply', { staff_id: s.ids.sumi, kind: 'unpaid', from: `${month}-10`, to: `${month}-10`, reason: 'Personal' });
  const before = row(s, month, 'Sumi');
  assert.equal(before.issued, false);
  assert.equal(before.slip.unpaid_leave_days, 1);
  assert.ok(before.slip.absent_days > 10, 'no punches all month');
  assert.equal(s.call(s.manager, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 1 }).error.code, 'FORBIDDEN');
  const issued = s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 1, note: 'Absent on the 3rd without notice' }).data;
  const expected = 12000 - Math.round((12000 * 2) / daysIn(month));
  assert.equal(issued.data.net, expected);
  assert.equal(s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 0 }).data.error.code, 'CONFLICT');
  assert.equal(s.call(s.owner, 'payroll.issue', { staff_id: s.ids.rafi, month, unpaid_absent_days: 999 }).data.error.fields.unpaid_absent_days.code, 'val.max');
  // Cancelled with a reason, then issued again.
  s.call(s.owner, 'payroll.cancel', { id: issued.record_id, reason: 'Absence was agreed' });
  assert.equal(s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 0 }).data.data.net, 12000 - Math.round(12000 / daysIn(month)));
});

test('joining in the middle of a month pays the days employed', () => {
  const s = payroll();
  const month = lastMonth();
  const id = s.call(s.owner, 'staff.save', { name: 'Kamal', status: 'active', joined_on: `${month}-11`, salary: 9000 }).data.record_id;
  const days = daysIn(month) - 10;
  assert.equal(row(s, month, 'Kamal').slip.base, Math.round((9000 * days) / daysIn(month)));
  s.call(s.owner, 'settings.payroll.save', { divisor: 'fixed_30', food_rule: 'every_day', food_rates: [{ from: '2000-01-01', amount: 0 }] });
  assert.equal(row(s, month, 'Kamal').slip.base, Math.round((9000 * days) / 30));
  assert.ok(id);
});

test('the pay account: payslips owed, salary paid for a month, advances recovered by deductions', () => {
  const s = payroll();
  const month = lastMonth();
  const net = s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 0 }).data.data.net;
  assert.equal(pay(s, { kind: 'salary_paid', amount: 5000 }).error.fields.period.code, 'val.required');
  assert.equal(pay(s, { kind: 'salary_paid', amount: 5000, period: month }).status, 'saved');
  assert.equal(row(s, month, 'Sumi').to_pay, net - 5000);
  assert.equal(pay(s, { kind: 'staff_deduction', amount: 100 }).error.fields.amount.code, 'val.over_advance');
  pay(s, { kind: 'staff_advance', amount: 2000 });
  assert.equal(pay(s, { kind: 'staff_deduction', amount: 500 }).status, 'saved');
  const account = row(s, month, 'Sumi').account;
  assert.deepEqual([account.owed, account.advance], [net - 5000 - 500, 1500]);
  // A manager can't pay staff.
  assert.equal(s.call(s.manager, 'money.save', { kind: 'salary_paid', date: today(), amount: 1, account_id: s.ids.cash, party_id: s.ids.sumi, period: month }).data.error.code, 'FORBIDDEN');
});

test('food allowance is earned by day from the rate in force', () => {
  const s = payroll();
  s.call(s.owner, 'settings.payroll.save', { divisor: 'period_days', food_rule: 'every_day', food_rates: [{ from: '2000-01-01', amount: 100 }, { from: plus(today(), -9), amount: 150 }] });
  const earned = row(s, today().slice(0, 7), 'Sumi').account.food_earned;
  assert.equal(earned, 191 * 100 + 10 * 150);
  s.call(s.owner, 'settings.payroll.save', { divisor: 'period_days', food_rule: 'worked_days', food_rates: [{ from: '2000-01-01', amount: 100 }] });
  assert.equal(row(s, today().slice(0, 7), 'Sumi').account.food_earned, 0);
});

test('people see their own payslips, and only those with payroll.view see others\'', () => {
  const s = payroll();
  const month = lastMonth();
  const id = s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 0 }).data.record_id;
  pay(s, { kind: 'salary_paid', amount: 12000, period: month });
  const mine = s.call(s.staff, 'payroll.mine').data;
  assert.equal(mine.payslips.length, 1);
  assert.equal(mine.account.owed, 0);
  const slip = s.call(s.staff, 'payroll.payslip', { id }).data;
  assert.deepEqual(slip.entries.map((e) => [e.kind, e.amount]), [['salary_paid', 12000]]);
  assert.equal(s.call(s.manager, 'payroll.payslip', { id }).error.code, 'FORBIDDEN');
  assert.equal(s.call(s.manager, 'payroll.month', {}).error.code, 'FORBIDDEN');
  // A shareholder can't issue their own payslip.
  const own = s.call(s.owner, 'staff.save', { name: 'Owner', status: 'active', user_id: s.call(s.owner, 'meta.get').data.user.id, salary: 1 }).data.record_id;
  assert.equal(s.call(s.owner, 'payroll.issue', { staff_id: own, month, unpaid_absent_days: 0 }).data.error.code, 'OWN_ENTRY');
});

test('a shareholder\'s advance is recovered by a salary deduction', () => {
  const s = payroll();
  const save = (fields) => s.call(s.owner, 'money.save', { date: today(), party_id: s.ids.karim, ...fields }).data;
  assert.equal(save({ kind: 'shareholder_advance', amount: 1000, account_id: s.ids.cash }).status, 'saved');
  assert.equal(save({ kind: 'shareholder_deduction', amount: 1200 }).error.fields.amount.code, 'val.over_advance');
  assert.equal(save({ kind: 'shareholder_deduction', amount: 400 }).status, 'saved');
  const karim = s.call(s.owner, 'money.boot').data.shareholders.find((x) => x.id === s.ids.karim);
  assert.equal(karim.advance, 600);
});
