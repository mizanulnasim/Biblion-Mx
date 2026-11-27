// Leave earned and counted.

import test from 'node:test';
import assert from 'node:assert/strict';
import { earnedLeave, leaveDays } from '../../shared/hr/leave.js';
import { restHours } from '../../shared/hr/plan.js';

const RULES = { rate: 1.5, probation_months: 3 };

test('by month of service: nothing in probation, then 1.5 days for each full month', () => {
  const earned = (asOf) => earnedLeave({ ...RULES, joined_on: '2026-01-15', as_of: asOf, timing: 'service_month', partial: 'prorate_days' });
  assert.equal(earned('2026-04-14'), 0);
  assert.equal(earned('2026-05-14'), 0);
  assert.equal(earned('2026-05-15'), 1.5);
  assert.equal(earned('2026-11-27'), 10.5);
  // A month ends on the same day next month, or the month's last day.
  assert.equal(earnedLeave({ ...RULES, probation_months: 0, joined_on: '2026-01-31', as_of: '2026-02-28', timing: 'service_month', partial: 'none' }), 1.5);
});

test('by calendar month: the first part month prorated, or not counted', () => {
  const base = { ...RULES, probation_months: 0, joined_on: '2026-11-16', timing: 'calendar_month' };
  assert.equal(earnedLeave({ ...base, as_of: '2026-11-30', partial: 'prorate_days' }), 0);
  assert.equal(earnedLeave({ ...base, as_of: '2026-12-01', partial: 'prorate_days' }), 0.75);
  assert.equal(earnedLeave({ ...base, as_of: '2026-12-01', partial: 'none' }), 0);
  assert.equal(earnedLeave({ ...base, as_of: '2027-01-01', partial: 'none' }), 1.5);
  assert.equal(earnedLeave({ ...base, as_of: '2027-01-01', partial: 'prorate_days' }), 2.25);
  assert.equal(earnedLeave({ ...base, joined_on: '2026-11-01', as_of: '2026-12-01', partial: 'none' }), 1.5);
});

test('leave is counted in working days or calendar days', () => {
  const plans = [{ kind: 'work' }, { kind: 'off' }, { kind: 'holiday' }, { kind: 'work' }];
  assert.equal(leaveDays(plans, 'working'), 2);
  assert.equal(leaveDays(plans, 'calendar'), 4);
});

test('rest between one day\'s end and the next day\'s start', () => {
  assert.equal(restHours('22:00', '06:00'), 8);
  assert.equal(restHours('18:00', '10:00'), 16);
});
