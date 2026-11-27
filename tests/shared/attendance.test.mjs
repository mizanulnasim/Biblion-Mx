// Attendance rules: distance, punch time, and what a day adds up to.

import test from 'node:test';
import assert from 'node:assert/strict';
import { daySummary, dhakaIso, distanceM, nextType, punchMoment } from '../../shared/hr/attendance.js';

const RULES = { late_grace: 5, early_grace: 0, incomplete_after: 120 };
const HOURS = { start: '10:00', end: '18:00', days_off: [5] };
const at = (date, hhmm) => Date.parse(dhakaIso(date, hhmm));
const day = (date, punches, now) => daySummary({ date, hours: HOURS, punches, nowMs: now, rules: RULES });

test('distance between two points in metres', () => {
  assert.equal(distanceM({ lat: 23.7808, lng: 90.4106 }, { lat: 23.7808, lng: 90.4106 }), 0);
  const d = distanceM({ lat: 23.7808, lng: 90.4106 }, { lat: 23.7898, lng: 90.4106 });
  assert.ok(d > 990 && d < 1010, String(d));
});

test('a phone clock that is wrong is corrected, and a punch is never in the future', () => {
  assert.deepEqual(punchMoment(1000, null, 5000), { at: 1000, skewMs: 0 });
  assert.deepEqual(punchMoment(9000, 9000, 5000), { at: 5000, skewMs: 4000 });
  assert.equal(punchMoment(9000, null, 5000).at, 5000);
});

test('late beyond the grace counts from the start; early leaving; worked time', () => {
  const s = day('2026-11-24', [{ type: 'in', at: at('2026-11-24', '10:12'), status: 'ok' }, { type: 'out', at: at('2026-11-24', '17:30'), status: 'ok' }], at('2026-11-25', '09:00'));
  assert.equal(s.state, 'out');
  assert.equal(s.late_min, 12);
  assert.equal(s.early_min, 30);
  assert.equal(s.worked_min, 438);
  const onTime = day('2026-11-24', [{ type: 'in', at: at('2026-11-24', '10:04'), status: 'ok' }], at('2026-11-24', '12:00'));
  assert.equal(onTime.late_min, 0);
  assert.equal(onTime.state, 'in');
});

test('a missing out is incomplete two hours after the end, or on a later day', () => {
  const punches = [{ type: 'in', at: at('2026-11-24', '10:00'), status: 'check' }];
  assert.equal(day('2026-11-24', punches, at('2026-11-24', '19:59')).state, 'in');
  assert.equal(day('2026-11-24', punches, at('2026-11-24', '20:01')).state, 'incomplete');
  assert.equal(day('2026-11-24', punches, at('2026-11-24', '20:01')).waiting, true);
});

test('no punches: not in yet, absent after the end or on a past day, off on a day off', () => {
  assert.equal(day('2026-11-24', [], at('2026-11-24', '11:00')).state, 'not_in');
  assert.equal(day('2026-11-24', [], at('2026-11-24', '18:01')).state, 'absent');
  assert.equal(day('2026-11-23', [], at('2026-11-24', '09:00')).state, 'absent');
  assert.equal(day('2026-11-27', [], at('2026-11-28', '09:00')).state, 'off');
});

test('the next punch is out after an in', () => {
  assert.equal(nextType([]), 'in');
  assert.equal(nextType([{ type: 'out', at: 2 }, { type: 'in', at: 1 }]), 'in');
  assert.equal(nextType([{ type: 'in', at: 1 }]), 'out');
});
