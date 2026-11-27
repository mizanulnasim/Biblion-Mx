// The shared pay rules: the accounting month, salary on a date, payslip
// figures, food allowance by week and the advance instalment due.

import test from 'node:test';
import assert from 'node:assert/strict';
import { foodWeeks, instalmentDue, payslipFigures, periodKey, periodOf, salaryOn, salaryTotal } from '../../shared/hr/pay.js';

test('the accounting month runs from its start day to the day before it next month', () => {
  assert.deepEqual(periodOf('2026-11', 11), { key: '2026-11', from: '2026-11-11', to: '2026-12-10', days: 30 });
  assert.deepEqual(periodOf('2026-12', 11), { key: '2026-12', from: '2026-12-11', to: '2027-01-10', days: 31 });
  assert.deepEqual(periodOf('2026-02', 1), { key: '2026-02', from: '2026-02-01', to: '2026-02-28', days: 28 });
  assert.equal(periodKey('2026-11-10', 11), '2026-10');
  assert.equal(periodKey('2026-11-11', 11), '2026-11');
  assert.equal(periodKey('2027-01-05', 11), '2026-12');
  assert.equal(periodKey('2026-11-30', 1), '2026-11');
});

test('the salary on a date is the latest change from on or before it', () => {
  const changes = [{ from: '2026-11-21', total: 15000 }, { from: '2026-01-01', total: 12000 }];
  assert.equal(salaryOn(changes, '2026-11-20'), 12000);
  assert.equal(salaryOn(changes, '2026-11-21'), 15000);
  assert.equal(salaryOn(changes, '2025-12-31'), 12000);
  assert.equal(salaryOn([], '2026-11-21'), 0);
  assert.equal(salaryTotal([{ name: 'Basic', amount: 9000 }, { name: 'House rent', amount: 3000 }]), 12000);
});

test('a payslip: a whole month at one salary, a change in the month by its days, a part month, the unpaid cut', () => {
  const whole = payslipFigures({ period_days: 30, day_salaries: Array(30).fill(12000), divisor_rule: 'period_days', unpaid_leave_days: 0, unpaid_absent_days: 0 });
  assert.deepEqual([whole.base, whole.net], [12000, 12000]);
  // 10 days at 12,000 and 20 at 15,000.
  const changed = payslipFigures({ period_days: 30, day_salaries: [...Array(10).fill(12000), ...Array(20).fill(15000)], divisor_rule: 'period_days', unpaid_leave_days: 0, unpaid_absent_days: 0 });
  assert.deepEqual([changed.salary, changed.base], [15000, 14000]);
  const part = payslipFigures({ period_days: 31, day_salaries: Array(10).fill(9000), divisor_rule: 'fixed_30', unpaid_leave_days: 0, unpaid_absent_days: 0 });
  assert.equal(part.base, 3000);
  const cut = payslipFigures({ period_days: 30, day_salaries: Array(30).fill(12000), divisor_rule: 'period_days', unpaid_leave_days: 1.5, unpaid_absent_days: 1 });
  assert.deepEqual([cut.unpaid_cut, cut.net], [1000, 11000]);
});

test('food allowance by week from Saturday', () => {
  // 2026-11-27 is a Friday, 2026-11-28 a Saturday.
  const weeks = foodWeeks([{ from: '2000-01-01', amount: 100 }], ['2026-11-26', '2026-11-27', '2026-11-28']);
  assert.deepEqual(weeks, [{ from: '2026-11-21', to: '2026-11-27', earned: 200 }, { from: '2026-11-28', to: '2026-12-04', earned: 100 }]);
});

test('the advance instalment due: each advance by its instalment, repaid oldest first', () => {
  const advances = [{ date: '2026-09-01', amount: 3000, instalment: 1000 }, { date: '2026-10-01', amount: 500, instalment: 0 }];
  assert.equal(instalmentDue(advances, 0), 1500);
  assert.equal(instalmentDue(advances, 2500), 1000);
  assert.equal(instalmentDue(advances, 3500), 0);
});
