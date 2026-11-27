// The rota: who works when. Each person has usual hours and weekly days
// off (on their staff record); the rota changes single dates. Staff ask to
// choose a shift for a coming day, swap a day with a colleague (who agrees
// first), or move their weekly day off; a manager decides (a shareholder
// for a manager). Public holidays are kept here too.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { addDays, datesBetween, dayPlan, rotaPlan } from '../../shared/hr/plan.js';
import { COUNTED, dhakaDate, dhakaIso } from '../../shared/hr/attendance.js';
import { setting } from '../kernel/settings.js';
import { mayDecideFor, staffOfUser } from './staff.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const WEEK_DAYS = 7;

// Everything needed to know what a day was meant to be, read once.
export function planner(db) {
  const shifts = new Map(db.all('Shifts').map((s) => [s.id, s]));
  const rows = new Map(db.all('Rota').map((r) => [`${r.staff_id}|${r.date}`, r]));
  const holidays = new Map(db.all('Holidays').filter((h) => h.status === 'active').map((h) => [h.date, h]));
  const leaves = db.all('Leaves').filter((l) => l.status === 'approved');
  const closed = setting(db, 'holidays.treatment') === 'closed';
  const rota = (staff, date) => rotaPlan(staff, date, rows.get(`${staff.id}|${date}`), shifts);
  return {
    shifts,
    holidays,
    // Without leave: what leave counting and rota requests look at.
    base: (staff, date) => dayPlan(rota(staff, date), { holiday: holidays.get(date), closed }),
    plan: (staff, date) => dayPlan(rota(staff, date), {
      leave: leaves.find((l) => l.staff_id === staff.id && l.from <= date && l.to >= date),
      holiday: holidays.get(date),
      closed,
    }),
  };
}

const today = (db) => dhakaDate(db.now.getTime());

function ownStaff(ctx) {
  const mine = staffOfUser(ctx.db, ctx.user.id);
  if (!mine) throw new AppError('NO_STAFF');
  return mine;
}

function setRow(db, staffId, date, fields) {
  const row = db.all('Rota').find((r) => r.staff_id === staffId && r.date === date);
  const values = { start: '', end: '', shift_id: '', request_id: '', ...fields };
  if (row) db.update('Rota', row, values);
  else db.insert('Rota', { date, staff_id: staffId, ...values });
}

// A rota day as a row's fields, so it can be copied to someone else.
function asRow(plan) {
  if (plan.kind === 'off') return { mode: 'off' };
  return { mode: 'hours', start: plan.start, end: plan.end, shift_id: plan.shift_id || '' };
}

// Too little rest around working `start`–`end` on `date` (a warning, never a
// block: owner decision): after the day before ends (its last punch out, else
// its planned end) and before the day after starts (its first punch in, else
// its planned start). [{side: before|after, date, hours}]
const HOUR_MS = 3600000;
function shortRest(db, staff, date, start, end, p = planner(db)) {
  const rest = setting(db, 'selection.min_rest_hours');
  const punches = db.all('Punches').filter((x) => x.staff_id === staff.id && COUNTED.includes(x.status));
  const at = (d, type, pick) => {
    const times = punches.filter((x) => x.date === d && x.type === type).map((x) => Date.parse(x.at));
    return times.length ? pick(...times) : null;
  };
  const planned = (d, field) => {
    const plan = p.plan(staff, d);
    return plan.kind === 'work' && plan[field] ? Date.parse(dhakaIso(d, plan[field])) : null;
  };
  const out = [];
  const before = addDays(date, -1);
  const prevEnd = at(before, 'out', Math.max) ?? planned(before, 'end');
  if (prevEnd !== null) {
    const hours = (Date.parse(dhakaIso(date, start)) - prevEnd) / HOUR_MS;
    if (hours < rest) out.push({ side: 'before', date: before, hours: Math.round(hours * 10) / 10 });
  }
  const after = addDays(date, 1);
  const nextStart = at(after, 'in', Math.min) ?? planned(after, 'start');
  if (nextStart !== null) {
    const hours = (nextStart - Date.parse(dhakaIso(date, end))) / HOUR_MS;
    if (hours < rest) out.push({ side: 'after', date: after, hours: Math.round(hours * 10) / 10 });
  }
  return out;
}

function requestView(db, r, names, p) {
  const shift = r.shift_id ? db.get('Shifts', r.shift_id) : null;
  return {
    id: r.id, kind: r.kind, staff_id: r.staff_id, staff_name: names.get(r.staff_id) || '', date: r.date, other_date: r.other_date,
    partner_id: r.partner_id, partner_name: names.get(r.partner_id) || '', shift: shift ? shift.name : '',
    reason: r.reason, status: r.status, decide_note: r.decide_note, created_at: r.created_at,
    rest: shift && r.status === 'waiting' ? shortRest(db, db.get('Staff', r.staff_id), r.date, shift.start, shift.end, p) : [],
  };
}

// The rest warnings a day's setting would bring, before it is saved. value:
// 'usual', 'off' or a shift's id. Staff may ask only about themselves.
function restPreview(ctx, { staff_id: staffId, date, value }) {
  const { db } = ctx;
  const mine = staffOfUser(db, ctx.user.id);
  const staff = staffId ? db.get('Staff', staffId) : mine;
  if (!staff || (staff !== mine && !ctx.can('schedule.manage'))) throw new AppError('NOT_FOUND');
  const hours = dayHours(db, staff, value);
  return { rest: hours ? shortRest(db, staff, date, hours.start, hours.end) : [] };
}

// The hours a value gives: a shift's, or the person's usual ones; none for a day off.
function dayHours(db, staff, value) {
  if (value === 'off') return null;
  if (value === 'usual') return staff.work_start ? { start: staff.work_start, end: staff.work_end } : null;
  const shift = db.get('Shifts', value);
  return shift ? { start: shift.start, end: shift.end } : null;
}

function week(ctx, input) {
  const { db } = ctx;
  const from = input.from || today(db);
  const dates = datesBetween(from, addDays(from, WEEK_DAYS - 1));
  const mine = staffOfUser(db, ctx.user.id);
  const everyone = ctx.can('schedule.view');
  if (!everyone && !mine) throw new AppError('NO_STAFF');
  const p = planner(db);
  const people = everyone ? db.all('Staff').filter((s) => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name)) : [mine];
  const names = new Map(db.all('Staff').map((s) => [s.id, s.name]));
  const requests = db.all('Rota_Requests').filter((r) => {
    const open = r.status === 'partner' || r.status === 'waiting';
    if (mine && (r.staff_id === mine.id || r.partner_id === mine.id)) return open || r.date >= today(db);
    return r.status === 'waiting' && mayDecideFor(ctx, db.get('Staff', r.staff_id), 'schedule.manage');
  }).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return {
    from, dates, me: mine ? mine.id : '',
    holidays: dates.filter((d) => p.holidays.has(d)).map((d) => ({ date: d, name: p.holidays.get(d).name, name_bn: p.holidays.get(d).name_bn })),
    shifts: db.all('Shifts').filter((s) => s.status === 'active').map((s) => ({ id: s.id, version: s.version, name: s.name, name_bn: s.name_bn, start: s.start, end: s.end })),
    // Colleagues to swap with: everyone working, by name only.
    colleagues: mine ? db.all('Staff').filter((s) => s.status === 'active' && s.id !== mine.id).map((s) => ({ id: s.id, name: s.name })) : [],
    rows: people.map((s) => ({ staff: { id: s.id, name: s.name, work_start: s.work_start, work_end: s.work_end }, days: dates.map((d) => ({ date: d, ...p.plan(s, d) })) })),
    requests: requests.map((r) => requestView(db, r, names, p)),
    rules: { self_select: setting(db, 'rota.self_select'), advance_days: setting(db, 'selection.advance_days'), min_notice_days: setting(db, 'exchange.min_notice_days') },
  };
}

// A manager sets one day: usual hours, a day off, or a shift.
function setDay(ctx, { staff_id: staffId, date, value }) {
  const { db } = ctx;
  if (!db.get('Staff', staffId)) throw new AppError('NOT_FOUND');
  if (value === 'usual' || value === 'off') {
    setRow(db, staffId, date, { mode: value, source: 'manager' });
  } else {
    const shift = db.get('Shifts', value);
    if (!shift || shift.status !== 'active') throw fieldError('value', 'val.not_found');
    setRow(db, staffId, date, { mode: 'hours', start: shift.start, end: shift.end, shift_id: shift.id, source: 'manager' });
  }
  const hours = dayHours(db, db.get('Staff', staffId), value);
  return saved(null, { rest: hours ? shortRest(db, db.get('Staff', staffId), date, hours.start, hours.end) : [] });
}

function saveShift(ctx, input) {
  const { db } = ctx;
  if (input.end <= input.start) throw fieldError('end', 'val.time_after');
  const fields = { name: input.name, name_bn: input.name_bn || '', start: input.start, end: input.end, status: input.status };
  if (!input.id) return saved(db.insert('Shifts', fields).id);
  const row = db.get('Shifts', input.id);
  if (!row) throw new AppError('NOT_FOUND');
  db.update('Shifts', row, fields, input.version);
  return saved(row.id);
}

// Puts an approved request on the rota.
function apply(ctx, r) {
  const { db } = ctx;
  const p = planner(db);
  const tag = { request_id: r.id };
  if (r.kind === 'shift') {
    const shift = db.get('Shifts', r.shift_id);
    setRow(db, r.staff_id, r.date, { mode: 'hours', start: shift.start, end: shift.end, shift_id: shift.id, source: 'choice', ...tag });
  } else if (r.kind === 'swap') {
    const me = db.get('Staff', r.staff_id);
    const partner = db.get('Staff', r.partner_id);
    const mine = p.base(me, r.date);
    const theirs = p.base(partner, r.date);
    setRow(db, me.id, r.date, { ...asRow(theirs), source: 'swap', ...tag });
    setRow(db, partner.id, r.date, { ...asRow(mine), source: 'swap', ...tag });
  } else {
    const me = db.get('Staff', r.staff_id);
    const workDay = p.base(me, r.other_date);
    setRow(db, me.id, r.date, { ...asRow(workDay), source: 'dayoff', ...tag });
    setRow(db, me.id, r.other_date, { mode: 'off', source: 'dayoff', ...tag });
  }
  return db.update('Rota_Requests', r, { status: 'approved', decided_by: ctx.user.id, decided_at: db.nowIso });
}

function ask(ctx, input) {
  const { db } = ctx;
  const me = ownStaff(ctx);
  const now = today(db);
  const p = planner(db);
  if (input.date < now) throw fieldError('date', 'val.not_past');
  const base = { kind: input.kind, staff_id: me.id, date: input.date, other_date: '', partner_id: '', shift_id: '', reason: input.reason || '', partner_at: '', decided_by: '', decided_at: '', decide_note: '', asked_by: ctx.user.id };
  const open = db.all('Rota_Requests').some((r) => r.staff_id === me.id && r.date === input.date && (r.status === 'partner' || r.status === 'waiting'));
  if (open) throw new AppError('OVERLAP');

  if (input.kind === 'shift') {
    if (!setting(db, 'rota.self_select')) throw new AppError('FORBIDDEN');
    const ahead = setting(db, 'selection.advance_days');
    if (input.date <= now || input.date > addDays(now, ahead)) throw fieldError('date', 'val.days_ahead', { days: ahead });
    const shift = input.shift_id ? db.get('Shifts', input.shift_id) : null;
    if (!shift || shift.status !== 'active') throw fieldError('shift_id', 'val.required');
    // Every choice waits for a manager or a shareholder (owner decision);
    // too little rest is only a warning, shown to both.
    const row = db.insert('Rota_Requests', { ...base, shift_id: shift.id, status: 'waiting' });
    return saved(row.id, { final: false, rest: shortRest(db, me, input.date, shift.start, shift.end, p) });
  }

  if (input.kind === 'swap') {
    const partner = input.partner_id ? db.get('Staff', input.partner_id) : null;
    if (!partner || partner.status !== 'active' || partner.id === me.id) throw fieldError('partner_id', 'val.required');
    const mine = p.plan(me, input.date);
    const theirs = p.plan(partner, input.date);
    if (mine.kind === 'leave' || theirs.kind === 'leave' || (mine.kind !== 'work' && theirs.kind !== 'work')) throw new AppError('NO_DAYS');
    if (mine.kind === theirs.kind && mine.start === theirs.start && mine.end === theirs.end) throw new AppError('NO_DAYS');
    const row = db.insert('Rota_Requests', { ...base, partner_id: partner.id, status: 'partner' });
    return saved(row.id, { final: false });
  }

  // Moving the weekly day off: from a day off to a working day, within a week.
  const notice = setting(db, 'exchange.min_notice_days');
  const other = input.other_date;
  if (!other) throw fieldError('other_date', 'val.required');
  const first = other < input.date ? other : input.date;
  if (first < addDays(now, notice)) throw new AppError('NOTICE', { days: notice });
  if (Math.abs(Date.parse(other) - Date.parse(input.date)) > 6 * 86400000) throw fieldError('other_date', 'val.same_week');
  if (p.plan(me, input.date).kind !== 'off') throw fieldError('date', 'val.not_day_off');
  if (p.plan(me, other).kind !== 'work') throw fieldError('other_date', 'val.not_work_day');
  const row = db.insert('Rota_Requests', { ...base, other_date: other, status: 'waiting' });
  return saved(row.id, { final: false });
}

// The colleague in a swap agrees (it then waits for a manager) or not.
function answer(ctx, { id, answer: reply }) {
  const { db } = ctx;
  const me = ownStaff(ctx);
  const r = db.get('Rota_Requests', id);
  if (!r || r.partner_id !== me.id) throw new AppError('NOT_FOUND');
  if (r.status !== 'partner') throw new AppError('CONFLICT', { by: '' });
  db.update('Rota_Requests', r, { status: reply === 'accept' ? 'waiting' : 'declined', partner_at: db.nowIso });
  return saved(r.id);
}

function decide(ctx, { id, decision, note }) {
  const { db } = ctx;
  const r = db.get('Rota_Requests', id);
  if (!r) throw new AppError('NOT_FOUND');
  if (r.status !== 'waiting') throw new AppError('CONFLICT', { by: '' });
  const people = [db.get('Staff', r.staff_id), r.partner_id ? db.get('Staff', r.partner_id) : null].filter(Boolean);
  if (people.some((s) => s.user_id === ctx.user.id)) throw new AppError('OWN_ENTRY');
  if (!people.every((s) => mayDecideFor(ctx, s, 'schedule.manage'))) throw new AppError('FORBIDDEN');
  if (decision === 'reject' && !note) throw fieldError('note', 'val.required');
  if (note) db.setReason(note);
  if (decision === 'accept') apply(ctx, db.update('Rota_Requests', r, { decide_note: note || '' }));
  else db.update('Rota_Requests', r, { status: 'declined', decided_by: ctx.user.id, decided_at: db.nowIso, decide_note: note });
  return saved(r.id);
}

function withdraw(ctx, { id }) {
  const { db } = ctx;
  const r = db.get('Rota_Requests', id);
  if (!r || r.asked_by !== ctx.user.id) throw new AppError('NOT_FOUND');
  if (r.status !== 'partner' && r.status !== 'waiting') throw new AppError('CONFLICT', { by: '' });
  db.update('Rota_Requests', r, { status: 'withdrawn' });
  return saved(r.id);
}

// How many rota requests wait for this person (to agree to, or to decide).
export function rotaWaiting(ctx) {
  const { db } = ctx;
  const mine = staffOfUser(db, ctx.user.id);
  return db.all('Rota_Requests').filter((r) => (mine && r.status === 'partner' && r.partner_id === mine.id)
    || (r.status === 'waiting' && ctx.can('schedule.manage') && [r.staff_id, r.partner_id].filter(Boolean).every((id) => mayDecideFor(ctx, db.get('Staff', id), 'schedule.manage')))).length;
}

// ---- Public holidays ---------------------------------------------------------

function holidays(ctx, { year }) {
  const y = String(year || today(ctx.db).slice(0, 4));
  return {
    year: y,
    treatment: setting(ctx.db, 'holidays.treatment'),
    items: ctx.db.all('Holidays').filter((h) => h.date.startsWith(y)).sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((h) => ({ id: h.id, version: h.version, date: h.date, name: h.name, name_bn: h.name_bn, status: h.status })),
  };
}

function saveHoliday(ctx, input) {
  const { db } = ctx;
  const clash = db.all('Holidays').find((h) => h.date === input.date && h.status === 'active' && h.id !== input.id);
  if (clash && input.status === 'active') throw fieldError('date', 'val.taken');
  const fields = { date: input.date, name: input.name, name_bn: input.name_bn || '', status: input.status };
  if (!input.id) return saved(db.insert('Holidays', fields).id);
  const row = db.get('Holidays', input.id);
  if (!row) throw new AppError('NOT_FOUND');
  db.update('Holidays', row, fields, input.version);
  return saved(row.id);
}

export const ROTA_HANDLERS = {
  'rota.week': week,
  'rota.set': setDay,
  'rota.rest': restPreview,
  'rota.shift.save': saveShift,
  'rota.request': ask,
  'rota.answer': answer,
  'rota.decide': decide,
  'rota.withdraw': withdraw,
  'holidays.list': holidays,
  'holidays.save': saveHoliday,
};
