// Payslips, pay accounts and the staff pay kinds on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop, setSettings } from './shop.mjs';

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
  // No food allowance unless a test sets one; calendar months unless a
  // test sets the 11th (the default).
  setSettings(s, 'payroll', { 'payroll.unpaid_divisor': 'period_days', 'food.unpaid_rule': 'every_day', 'food.rates': [{ from: '2000-01-01', amount: 0 }], 'accounting.month_start_day': 1 });
  s.call(s.owner, 'start.date.save', { start_date: plus(today(), -200) });
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
  setSettings(s, 'payroll', { 'payroll.unpaid_divisor': 'fixed_30', 'food.unpaid_rule': 'every_day', 'food.rates': [{ from: '2000-01-01', amount: 0 }] });
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
  setSettings(s, 'payroll', { 'payroll.unpaid_divisor': 'period_days', 'food.unpaid_rule': 'every_day', 'food.rates': [{ from: '2000-01-01', amount: 100 }, { from: plus(today(), -9), amount: 150 }] });
  const earned = row(s, today().slice(0, 7), 'Sumi').account.food_earned;
  assert.equal(earned, 191 * 100 + 10 * 150);
  // Sumi's own rate from 4 days ago (today included: 5 days at 200).
  s.call(s.owner, 'salary.change', { staff_id: s.ids.sumi, from: plus(today(), -4), parts: [{ name: '', amount: 12000 }], food_rate: 200 });
  assert.equal(row(s, today().slice(0, 7), 'Sumi').account.food_earned, 191 * 100 + 5 * 150 + 5 * 200);
  setSettings(s, 'payroll', { 'payroll.unpaid_divisor': 'period_days', 'food.unpaid_rule': 'worked_days', 'food.rates': [{ from: '2000-01-01', amount: 100 }] });
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

test('the accounting month starts on the 11th by default; a payslip follows its dates', () => {
  const s = shop();
  const id = s.call(s.owner, 'staff.save', { name: 'Kamal', status: 'active', joined_on: '2026-01-01', salary: 9000, days_off: [] }).data.record_id;
  const month = s.call(s.owner, 'payroll.month', { month: '2026-10' }).data;
  assert.deepEqual([month.period_from, month.period_to], ['2026-10-11', '2026-11-10']);
  assert.equal(month.rows.find((r) => r.staff.id === id).slip.month_days, 31);
});

test('salary history in parts, from a date: the payslip counts the days of each; issued months are kept', () => {
  const s = payroll();
  const month = lastMonth();
  const days = daysIn(month);
  // From the 11th of last month: 10 days at 12,000, the rest at 15,000.
  const change = s.call(s.owner, 'salary.change', { staff_id: s.ids.sumi, from: `${month}-11`, parts: [{ name: 'Basic', amount: 10000 }, { name: 'House rent', amount: 5000 }], note: 'Yearly raise' }).data;
  assert.equal(change.data.total, 15000);
  assert.equal(s.call(s.manager, 'salary.change', { staff_id: s.ids.sumi, from: today(), parts: [{ amount: 1 }] }).error.code, 'FORBIDDEN');
  const history = s.call(s.owner, 'salary.history', { staff_id: s.ids.sumi }).data;
  assert.deepEqual(history.changes.map((c) => c.total), [15000, 12000]);
  assert.equal(s.call(s.owner, 'staff.list', {}).data.items.find((x) => x.name === 'Sumi').salary, 15000);
  const slip = row(s, month, 'Sumi').slip;
  assert.equal(slip.base, Math.round((12000 * 10 + 15000 * (days - 10)) / days));
  assert.deepEqual(slip.parts.map((p) => p.name), ['Basic', 'House rent']);
  s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 0 });
  const late = s.call(s.owner, 'salary.change', { staff_id: s.ids.sumi, from: `${month}-20`, parts: [{ amount: 16000 }] }).data;
  assert.equal(late.error.fields.from.code, 'val.payslip_issued');
});

test('unpaid leave cut is chosen when paying; an unpaid month is overdue after the set days', () => {
  const s = payroll();
  const month = lastMonth();
  s.call(s.manager, 'leave.apply', { staff_id: s.ids.sumi, kind: 'unpaid', from: `${month}-10`, to: `${month}-10`, reason: 'Personal' });
  assert.equal(s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_leave_days: 2, unpaid_absent_days: 0 }).data.error.fields.unpaid_leave_days.code, 'val.max');
  const issued = s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_leave_days: 0, unpaid_absent_days: 0, note: 'Leave agreed as paid' }).data;
  assert.equal(issued.data.net, 12000);
  const sumi = row(s, month, 'Sumi');
  assert.deepEqual([sumi.slip.leave_days, sumi.slip.unpaid_leave_days], [1, 0]);
  // Last calendar month ended before today; with 0 days allowed it is overdue,
  // with the amount left, for payroll and for the person.
  setSettings(s, 'payroll', { 'payroll.overdue_days': 0 });
  assert.equal(row(s, month, 'Sumi').overdue, true);
  const mine = s.call(s.staff, 'payroll.mine').data.overdue;
  assert.deepEqual(mine.find((o) => o.month === month), { month, due_by: `${month}-${String(daysIn(month)).padStart(2, '0')}`, left: 12000, issued: true });
  // Not issued (Rafi's): overdue all the same.
  assert.equal(row(s, month, 'Rafi').overdue, true);
  assert.equal(s.call(s.owner, 'people.waiting').data.salary >= 1, true);
  pay(s, { kind: 'salary_paid', amount: 10000, period: month });
  assert.equal(row(s, month, 'Sumi').to_pay, 2000);
  assert.equal(row(s, month, 'Sumi').overdue, true);
  pay(s, { kind: 'salary_paid', amount: 2000, period: month });
  assert.equal(row(s, month, 'Sumi').overdue, false);
});

test('an advance repaid in instalments: the instalment is suggested as the month\'s deduction', () => {
  const s = payroll();
  pay(s, { kind: 'staff_advance', amount: 3000, instalment: 1000 });
  const account = () => row(s, lastMonth(), 'Sumi').account;
  assert.equal(account().instalment_due, 1000);
  pay(s, { kind: 'staff_deduction', amount: 1000 });
  assert.deepEqual([account().advance, account().instalment_due], [2000, 0]);
});

test('an unpaid half day cuts half a day\'s pay', () => {
  const s = payroll();
  const month = lastMonth();
  s.call(s.manager, 'leave.apply', { staff_id: s.ids.sumi, kind: 'unpaid', half: 'second', from: `${month}-12`, to: `${month}-12`, reason: 'Personal' });
  const slip = row(s, month, 'Sumi').slip;
  assert.equal(slip.leave_days, 0.5);
  assert.equal(slip.unpaid_cut, Math.round((12000 * 0.5) / daysIn(month)));
});

test('overtime is paid only to people with an hourly rate, the hours chosen when issuing', () => {
  const s = payroll();
  const month = lastMonth();
  // The 14th of last month: in at 10:00, out at 20:00 against 10:00–18:00.
  let date = `${month}-14`;
  while (new Date(`${date}T00:00:00Z`).getUTCDay() === 5) date = plus(date, 1);
  for (const [type, time] of [['in', '10:00'], ['out', '20:00']]) s.call(s.owner, 'attendance.fix', { staff_id: s.ids.sumi, date, type, time, reason: 'Stock-take' });
  const before = row(s, month, 'Sumi').slip;
  assert.deepEqual([before.overtime_min, before.overtime_hours, before.overtime_pay], [120, 0, 0]);
  const sumi = s.call(s.owner, 'staff.list', {}).data.items.find((x) => x.name === 'Sumi');
  assert.equal(s.call(s.owner, 'staff.save', { ...sumi, days_off: sumi.days_off.map((day) => ({ day })), overtime_rate: 100, pin: null }).data.status, 'saved');
  assert.deepEqual([row(s, month, 'Sumi').slip.overtime_hours, row(s, month, 'Sumi').slip.overtime_pay], [2, 200]);
  assert.equal(s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 0, overtime_hours: 3 }).data.error.fields.overtime_hours.code, 'val.max');
  const issued = s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 0, overtime_hours: 1.5 }).data;
  assert.equal(issued.data.net, 12000 - Math.round((12000 * row(s, month, 'Sumi').slip.leave_days) / daysIn(month)) + 150);
});
