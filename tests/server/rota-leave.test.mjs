// The rota, rota requests, public holidays and leave on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const DAY = 86400000;
const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// The first date at least `min` days ahead that falls on weekday `wd`.
const nextWeekday = (wd, min) => {
  let d = plus(today(), min);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== wd) d = plus(d, 1);
  return d;
};
const monthsAgo = (n) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
};

function team() {
  const s = shop();
  const users = s.call(s.owner, 'users.list', {}).data.items;
  const userId = (name) => users.find((u) => u.username === name).id;
  const add = (fields) => s.call(s.owner, 'staff.save', { status: 'active', work_start: '10:00', work_end: '18:00', days_off: [{ day: 5 }], ...fields }).data.record_id;
  s.ids.sumi = add({ name: 'Sumi', user_id: userId('staff'), joined_on: monthsAgo(6) });
  s.ids.rafi = add({ name: 'Rafi', user_id: userId('manager'), joined_on: monthsAgo(6) });
  // These tests count leave by full months of service (the default counts
  // calendar months, with the first part month by its days).
  assert.equal(s.call(s.owner, 'settings.leave').data.timing, 'calendar_month');
  s.call(s.owner, 'settings.leave.save', { ...s.call(s.owner, 'settings.leave').data, timing: 'service_month' });
  s.ids.morning = s.call(s.manager, 'rota.shift.save', { name: 'Morning', start: '07:00', end: '13:00', status: 'active' }).data.record_id;
  s.ids.late = s.call(s.manager, 'rota.shift.save', { name: 'Late', start: '15:00', end: '23:00', status: 'active' }).data.record_id;
  return s;
}

const dayOf = (s, who, date) => s.call(who, 'rota.week', { from: date }).data.rows[0].days[0];

test('a manager sets the rota; staff see only their own row', () => {
  const s = team();
  const d = nextWeekday(1, 2);
  assert.equal(s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: d, value: s.ids.morning }).data.status, 'saved');
  const week = s.call(s.staff, 'rota.week', { from: d }).data;
  assert.equal(week.rows.length, 1);
  assert.deepEqual([week.rows[0].days[0].shift, week.rows[0].days[0].start], ['Morning', '07:00']);
  assert.equal(s.call(s.manager, 'rota.week', { from: d }).data.rows.length, 2);
  s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: d, value: 'off' });
  assert.equal(dayOf(s, s.staff, d).kind, 'off');
  s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: d, value: 'usual' });
  assert.equal(dayOf(s, s.staff, d).start, '10:00');
  assert.equal(s.call(s.staff, 'rota.set', { staff_id: s.ids.sumi, date: d, value: 'off' }).error.code, 'FORBIDDEN');
});

test('choosing a shift: within the days ahead, always confirmed by a manager; short rest is only a warning', () => {
  const s = team();
  const d = nextWeekday(2, 2);
  // Every choice waits for a manager.
  const late = s.call(s.staff, 'rota.request', { kind: 'shift', date: d, shift_id: s.ids.late }).data;
  assert.equal(late.data.final, false);
  s.call(s.manager, 'rota.decide', { id: late.record_id, decision: 'accept' });
  assert.equal(dayOf(s, s.staff, d).shift, 'Late');
  // Late ends at 23:00 and Morning starts at 07:00: 8 hours' rest. With 9
  // needed it is still sent, with a warning the person and the manager see.
  s.call(s.owner, 'settings.leave.save', { ...s.call(s.owner, 'settings.leave').data, min_rest_hours: 9 });
  assert.deepEqual(s.call(s.staff, 'rota.check', { date: plus(d, 1), value: s.ids.morning }).data.rest, [{ side: 'before', date: d, hours: 8 }]);
  const short = s.call(s.staff, 'rota.request', { kind: 'shift', date: plus(d, 1), shift_id: s.ids.morning }).data;
  assert.deepEqual(short.data.rest, [{ side: 'before', date: d, hours: 8 }]);
  assert.deepEqual(s.call(s.manager, 'rota.week', { from: d }).data.requests.find((r) => r.id === short.record_id).rest, [{ side: 'before', date: d, hours: 8 }]);
  s.call(s.staff, 'rota.withdraw', { id: short.record_id });
  // The day after is checked too: a Late shift the day before Morning.
  s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: plus(d, 6), value: s.ids.morning });
  const before = s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: plus(d, 5), value: s.ids.late }).data;
  assert.deepEqual(before.data.rest, [{ side: 'after', date: plus(d, 6), hours: 8 }]);
  assert.equal(s.call(s.staff, 'rota.check', { staff_id: s.ids.rafi, date: d, value: s.ids.morning }).error.code, 'NOT_FOUND');
  assert.equal(s.call(s.staff, 'rota.request', { kind: 'shift', date: plus(today(), 30), shift_id: s.ids.morning }).data.error.fields.date.code, 'val.days_ahead');
  const morning = s.call(s.staff, 'rota.request', { kind: 'shift', date: plus(d, 3), shift_id: s.ids.morning }).data;
  assert.equal(morning.data.final, false);
  assert.equal(s.call(s.manager, 'rota.decide', { id: morning.record_id, decision: 'accept' }).data.status, 'saved');
  assert.equal(dayOf(s, s.staff, plus(d, 3)).shift, 'Morning');
});

test('a swap needs the colleague, then someone who may decide for both', () => {
  const s = team();
  const d = nextWeekday(3, 2);
  s.call(s.owner, 'rota.set', { staff_id: s.ids.rafi, date: d, value: s.ids.morning });
  const asked = s.call(s.staff, 'rota.request', { kind: 'swap', date: d, partner_id: s.ids.rafi, reason: 'Doctor in the afternoon' }).data;
  assert.equal(s.call(s.manager, 'rota.week', { from: d }).data.requests[0].status, 'partner');
  assert.equal(s.call(s.manager, 'rota.answer', { id: asked.record_id, answer: 'accept' }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'rota.decide', { id: asked.record_id, decision: 'accept' }).data.error.code, 'OWN_ENTRY');
  assert.equal(s.call(s.owner, 'rota.decide', { id: asked.record_id, decision: 'accept' }).data.status, 'saved');
  assert.equal(dayOf(s, s.staff, d).shift, 'Morning');
  const rafi = s.call(s.owner, 'rota.week', { from: d }).data.rows.find((r) => r.staff.name === 'Rafi').days[0];
  assert.deepEqual([rafi.start, rafi.end], ['10:00', '18:00']);
});

test('moving the weekly day off: notice, same week, from a day off to a working day', () => {
  const s = team();
  const friday = nextWeekday(5, 2);
  const thursday = plus(friday, -1);
  assert.equal(s.call(s.staff, 'rota.request', { kind: 'dayoff', date: thursday, other_date: friday }).data.error.fields.date.code, 'val.not_day_off');
  assert.equal(s.call(s.staff, 'rota.request', { kind: 'dayoff', date: friday, other_date: plus(friday, 9) }).data.error.fields.other_date.code, 'val.same_week');
  const asked = s.call(s.staff, 'rota.request', { kind: 'dayoff', date: friday, other_date: thursday, reason: 'Family event Thursday' }).data;
  assert.equal(s.call(s.manager, 'rota.decide', { id: asked.record_id, decision: 'accept' }).data.status, 'saved');
  assert.equal(dayOf(s, s.staff, friday).kind, 'work');
  assert.equal(dayOf(s, s.staff, thursday).kind, 'off');
  s.call(s.owner, 'settings.leave.save', { ...s.call(s.owner, 'settings.leave').data, min_notice_days: 30 });
  const late = s.call(s.staff, 'rota.request', { kind: 'dayoff', date: plus(friday, 7), other_date: plus(friday, 6) }).data;
  assert.equal(late.error.code, 'NOTICE');
});

test('leave: counted in working days, waits for a manager, then uses the balance', () => {
  const s = team();
  const monday = nextWeekday(1, 3);
  const balance = s.call(s.staff, 'leave.mine').data.balance;
  assert.equal(balance.earned, 4.5);
  // Thursday to Saturday is 2 working days around the Friday off.
  const thu = plus(monday, 3);
  assert.equal(s.call(s.staff, 'leave.preview', { from: thu, to: plus(thu, 2) }).data.days, 2);
  const asked = s.call(s.staff, 'leave.apply', { kind: 'paid', from: thu, to: plus(thu, 2), reason: 'Sister\'s wedding' }).data;
  assert.equal(asked.data.final, false);
  assert.equal(s.call(s.staff, 'leave.apply', { kind: 'unpaid', from: plus(thu, 1), to: plus(thu, 3), reason: 'x' }).data.error.code, 'OVERLAP');
  // 2 waiting + 3 more is over 4.5.
  assert.equal(s.call(s.staff, 'leave.apply', { kind: 'paid', from: monday, to: plus(monday, 2), reason: 'x' }).data.error.code, 'LEAVE_BALANCE');
  assert.equal(s.call(s.staff, 'people.waiting').data.leave, 0);
  assert.equal(s.call(s.manager, 'people.waiting').data.leave, 1);
  assert.equal(s.call(s.manager, 'leave.decide', { id: asked.record_id, decision: 'accept' }).data.status, 'saved');
  const after = s.call(s.staff, 'leave.mine').data.balance;
  assert.deepEqual([after.used, after.balance], [2, 2.5]);
  assert.equal(dayOf(s, s.staff, thu).kind, 'leave');
  // Not started: the person can still cancel it.
  assert.equal(s.call(s.staff, 'leave.cancel', { id: asked.record_id, reason: 'Wedding moved' }).data.status, 'saved');
  assert.equal(s.call(s.staff, 'leave.mine').data.balance.balance, 4.5);
});

test('a manager\'s leave waits for a shareholder; a shareholder adjusts balances with a reason', () => {
  const s = team();
  const d = nextWeekday(1, 3);
  const asked = s.call(s.manager, 'leave.apply', { kind: 'unpaid', from: d, to: d, reason: 'Exam' }).data;
  assert.equal(s.call(s.manager, 'leave.overview').data.waiting.length, 0);
  assert.equal(s.call(s.manager, 'leave.decide', { id: asked.record_id, decision: 'accept' }).data.error.code, 'OWN_ENTRY');
  assert.equal(s.call(s.owner, 'leave.decide', { id: asked.record_id, decision: 'reject' }).data.error.fields.note.code, 'val.required');
  assert.equal(s.call(s.owner, 'leave.decide', { id: asked.record_id, decision: 'reject', note: 'Stock-take that day' }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'leave.adjust', { staff_id: s.ids.sumi, days: 2, reason: 'x' }).error.code, 'FORBIDDEN');
  const adjusted = s.call(s.owner, 'leave.adjust', { staff_id: s.ids.sumi, days: -1.5, reason: 'Unrecorded leave in October' }).data;
  assert.equal(adjusted.data.balance, 3);
  // A manager records leave for staff directly.
  assert.equal(s.call(s.manager, 'leave.apply', { staff_id: s.ids.sumi, kind: 'unpaid', from: d, to: d, reason: 'Sick' }).data.data.final, true);
});

test('a public holiday when the shop closes is not a working day', () => {
  const s = team();
  const monday = nextWeekday(1, 3);
  s.call(s.owner, 'holidays.save', { date: monday, name: 'Victory Day', status: 'active' });
  assert.equal(dayOf(s, s.staff, monday).kind, 'work');
  assert.equal(dayOf(s, s.staff, monday).holiday, 'Victory Day');
  assert.equal(s.call(s.staff, 'leave.preview', { from: monday, to: plus(monday, 1) }).data.days, 2);
  s.call(s.owner, 'settings.leave.save', { ...s.call(s.owner, 'settings.leave').data, holidays: 'closed' });
  assert.equal(dayOf(s, s.staff, monday).kind, 'holiday');
  assert.equal(s.call(s.staff, 'leave.preview', { from: monday, to: plus(monday, 1) }).data.days, 1);
  assert.equal(s.call(s.owner, 'holidays.save', { date: monday, name: 'Again', status: 'active' }).data.error.fields.date.code, 'val.taken');
});

test('kinds of leave: a shareholder adds one; it is paid or not, from the balance or not, half days or not', () => {
  const s = team();
  const monday = nextWeekday(1, 3);
  const sick = s.call(s.owner, 'leave.type.save', { name: 'Sick leave', paid: true, from_balance: false, half_days: false, status: 'active' }).data.record_id;
  assert.equal(s.call(s.manager, 'leave.type.save', { name: 'x', status: 'active' }).error.code, 'FORBIDDEN');
  assert.deepEqual(s.call(s.staff, 'leave.mine').data.types.map((x) => x.id), ['paid', 'unpaid', sick]);
  // Not from the balance, so the balance doesn't change.
  const asked = s.call(s.staff, 'leave.apply', { kind: sick, from: monday, to: plus(monday, 1), reason: 'Fever' }).data;
  s.call(s.manager, 'leave.decide', { id: asked.record_id, decision: 'accept' });
  assert.equal(s.call(s.staff, 'leave.mine').data.balance.used, 0);
  assert.equal(s.call(s.staff, 'leave.apply', { kind: sick, half: 'first', from: plus(monday, 3), to: plus(monday, 3), reason: 'Doctor' }).data.error.fields.half.code, 'val.no_half_days');
  assert.equal(s.call(s.staff, 'leave.apply', { kind: 'nothing', from: plus(monday, 3), to: plus(monday, 3), reason: 'x' }).data.error.fields.kind.code, 'val.not_found');
});

test('a half day counts 0.5 and halves the hours expected that day', () => {
  const s = team();
  const monday = nextWeekday(1, 3);
  assert.equal(s.call(s.staff, 'leave.preview', { from: monday, to: monday, half: 'first' }).data.days, 0.5);
  assert.equal(s.call(s.staff, 'leave.apply', { kind: 'paid', half: 'first', from: monday, to: plus(monday, 1), reason: 'x' }).data.error.fields.to.code, 'val.half_one_day');
  const asked = s.call(s.staff, 'leave.apply', { kind: 'paid', half: 'first', from: monday, to: monday, reason: 'Bank in the morning' }).data;
  assert.equal(asked.data.days, 0.5);
  s.call(s.manager, 'leave.decide', { id: asked.record_id, decision: 'accept' });
  // Usual hours 10:00–18:00: the morning is off, so the day starts at 14:00.
  const day = dayOf(s, s.staff, monday);
  assert.deepEqual([day.kind, day.start, day.end, day.half_leave], ['work', '14:00', '18:00', 'first']);
  assert.equal(s.call(s.staff, 'leave.mine').data.balance.used, 0.5);
});

test('who may work a shift: places, positions, unavailable days and the person\'s own list', () => {
  const s = team();
  const d = nextWeekday(2, 2);
  // One place: Rafi takes it, so Sumi's choice is refused.
  const one = s.call(s.manager, 'rota.shift.save', { name: 'Opening', start: '10:00', end: '14:00', places: 1, status: 'active' }).data.record_id;
  s.call(s.owner, 'rota.set', { staff_id: s.ids.rafi, date: d, value: one });
  assert.equal(s.call(s.staff, 'rota.request', { kind: 'shift', date: d, shift_id: one }).data.error.fields.shift_id.code, 'val.shift_full');
  assert.equal(s.call(s.staff, 'rota.check', { date: d, value: one }).data.blocks.code, 'val.shift_full');
  // For the café only: Sumi (no position) can't be put on it.
  const cafe = s.call(s.manager, 'rota.shift.save', { name: 'Café', start: '12:00', end: '20:00', positions: 'Café', status: 'active' }).data.record_id;
  assert.equal(s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: d, value: cafe }).data.error.fields.value.code, 'val.shift_position');
  // Unavailable on that weekday, and Morning not on her list: allowed, with notes for the manager.
  s.call(s.staff, 'rota.unavailable.save', { weekday: new Date(`${d}T00:00:00Z`).getUTCDay(), note: 'Classes' });
  const sumi = s.call(s.owner, 'staff.list', {}).data.items.find((x) => x.name === 'Sumi');
  s.call(s.owner, 'staff.save', { ...sumi, days_off: sumi.days_off.map((day) => ({ day })), shift_ids: [{ id: s.ids.late }], pin: null });
  const asked = s.call(s.staff, 'rota.request', { kind: 'shift', date: d, shift_id: s.ids.morning }).data;
  assert.deepEqual(asked.data.notes.map((n) => n.code), ['rota.note.unavailable', 'rota.note.not_in_list']);
  assert.deepEqual(s.call(s.manager, 'rota.week', { from: d }).data.requests.find((r) => r.id === asked.record_id).notes.map((n) => n.params.note || ''), ['Classes', '']);
  const away = s.call(s.staff, 'rota.unavailable').data.items;
  assert.equal(away.length, 1);
  assert.equal(s.call(s.staff, 'rota.unavailable.remove', { id: away[0].id }).data.status, 'saved');
});
