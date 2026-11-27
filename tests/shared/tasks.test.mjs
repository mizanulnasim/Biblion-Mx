// When a repeating task falls.

import test from 'node:test';
import assert from 'node:assert/strict';
import { occursOn } from '../../shared/tasks/tasks.js';

const on = (tpl, dates) => dates.filter((d) => occursOn({ start_date: '2026-11-01', end_date: '', ...tpl }, d));

test('repeat patterns: every few days, every other week, every few months, last day, chosen dates', () => {
  assert.deepEqual(on({ repeat: 'every_n_days', every: 3 }, ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-07']), ['2026-11-01', '2026-11-04', '2026-11-07']);
  // 2026-11-01 is a Sunday: Mondays of the first week and every other week after.
  assert.deepEqual(on({ repeat: 'fortnightly', days: [1] }, ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']), ['2026-11-02', '2026-11-16']);
  assert.deepEqual(on({ repeat: 'every_n_months', every: 2, day_of_month: 31 }, ['2026-11-30', '2026-12-31', '2027-01-31']), ['2026-11-30', '2027-01-31']);
  assert.deepEqual(on({ repeat: 'monthly_last' }, ['2026-11-29', '2026-11-30', '2027-02-28']), ['2026-11-30', '2027-02-28']);
  assert.deepEqual(on({ repeat: 'dates', dates: ['2026-11-15'] }, ['2026-11-14', '2026-11-15']), ['2026-11-15']);
  assert.deepEqual(on({ repeat: 'daily', end_date: '2026-11-02' }, ['2026-10-31', '2026-11-01', '2026-11-03']), ['2026-11-01']);
});
