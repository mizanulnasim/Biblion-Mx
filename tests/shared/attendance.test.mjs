// Attendance rules: distance, punch time, and what a day adds up to.

import test from 'node:test';
import assert from 'node:assert/strict';
import { daySummary, dhakaIso, distanceM, nextTypes, outsideHours, punchMoment } from '../../shared/hr/attendance.js';
import { dayPlan, rotaPlan } from '../../shared/hr/plan.js';

const RULES = { late_grace: 5, early_grace: 0, incomplete_after: 120 };
const STAFF = { id: 'STF-1', work_start: '10:00', work_end: '18:00', days_off: [5] };
const at = (date, hhmm) => Date.parse(dhakaIso(date, hhmm));
const day = (date, punches, now) => daySummary({ date, plan: rotaPlan(STAFF, date, null, new Map()), punches, nowMs: now, rules: RULES });

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

test('the next punch: in; then out or a break; after a break, back', () => {
  assert.deepEqual(nextTypes([]), ['in']);
  assert.deepEqual(nextTypes([{ type: 'out', at: 2 }, { type: 'in', at: 1 }]), ['in']);
  assert.deepEqual(nextTypes([{ type: 'in', at: 1 }]), ['out', 'break']);
  assert.deepEqual(nextTypes([{ type: 'in', at: 1 }, { type: 'break', at: 2 }]), ['back']);
  assert.deepEqual(nextTypes([{ type: 'break', at: 2 }, { type: 'back', at: 3 }]), ['out', 'break']);
});

test('shop hours: a punch before opening or after closing is outside', () => {
  assert.equal(outsideHours(Date.parse(dhakaIso('2026-11-24', '10:59')), '11:00', '23:00'), true);
  assert.equal(outsideHours(Date.parse(dhakaIso('2026-11-24', '11:00')), '11:00', '23:00'), false);
  assert.equal(outsideHours(Date.parse(dhakaIso('2026-11-24', '23:00')), '11:00', '23:00'), false);
  assert.equal(outsideHours(Date.parse(dhakaIso('2026-11-24', '23:01')), '11:00', '23:00'), true);
});

test('a break is paid time and counted on its own; a break still open is "on a break"', () => {
  const p = (type, hhmm) => ({ type, at: Date.parse(dhakaIso('2026-11-24', hhmm)), status: 'ok' });
  const done = day('2026-11-24', [p('in', '10:00'), p('break', '13:00'), p('back', '13:30'), p('out', '18:00')], at('2026-11-24', '19:00'));
  assert.deepEqual([done.state, done.worked_min, done.break_min], ['out', 480, 30]);
  assert.equal(day('2026-11-24', [p('in', '10:00'), p('break', '13:00')], at('2026-11-24', '13:10')).state, 'break');
});

test('a day\'s plan: leave first, then a closed holiday, then the rota, then usual hours', () => {
  const shifts = new Map([['SHF-1', { name: 'Morning' }]]);
  const usual = rotaPlan(STAFF, '2026-11-24', null, shifts);
  assert.deepEqual([usual.kind, usual.start, usual.end], ['work', '10:00', '18:00']);
  assert.equal(rotaPlan(STAFF, '2026-11-27', null, shifts).kind, 'off');
  const morning = rotaPlan(STAFF, '2026-11-27', { mode: 'hours', start: '08:00', end: '14:00', shift_id: 'SHF-1' }, shifts);
  assert.deepEqual([morning.kind, morning.shift, morning.start], ['work', 'Morning', '08:00']);
  assert.equal(rotaPlan(STAFF, '2026-11-24', { mode: 'off' }, shifts).kind, 'off');
  assert.equal(rotaPlan(STAFF, '2026-11-27', { mode: 'usual' }, shifts).kind, 'off');
  const holiday = { name: 'Victory Day' };
  assert.equal(dayPlan(usual, { holiday, closed: false }).kind, 'work');
  assert.equal(dayPlan(usual, { holiday, closed: false }).holiday, 'Victory Day');
  assert.equal(dayPlan(usual, { holiday, closed: true }).kind, 'holiday');
  assert.equal(dayPlan(usual, { leave: { kind: 'paid' }, holiday, closed: true }).kind, 'leave');
  const onLeave = daySummary({ date: '2026-11-24', plan: dayPlan(usual, { leave: { kind: 'paid' } }), punches: [], nowMs: at('2026-11-25', '09:00'), rules: RULES });
  assert.equal(onLeave.state, 'leave');
});
