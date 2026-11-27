// Attendance: punching in and out from the person's own phone (checked
// against the shop's position) or on a shop punch device (the person types
// their PIN and the device signs the punch), punches kept on a phone while
// offline, manager checks, and corrections.
//
// Everyone works with their own punches and corrections without a
// permission. attendance.view shows everyone's; attendance.manage decides
// checks and corrections. Nobody decides their own, and a manager's are
// decided by a shareholder.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import {
  COUNTED, OFFLINE_AFTER_MS, daySummary, dhakaDate, dhakaIso, dhakaMinutes, distanceM, nextType, punchMoment, punchText,
} from '../../shared/hr/attendance.js';
import { BUSINESS_DEFAULTS } from '../../shared/schema/settings.js';
import { setting } from '../kernel/settings.js';
import { newToken, sameHex, signHex } from '../kernel/crypto.js';
import { joinedOn, mayDecideFor, staffOfUser } from './staff.js';
import { planner, rotaWaiting } from './rota.js';
import { leaveWaiting } from './leave.js';

const DAY_MS = 86400000;
const MINUTE_MS = 60000;
// A shop device's request for its staff list is good for this long.
const DEVICE_READ_MS = 10 * MINUTE_MS;

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const hhmm = (ms) => {
  const m = dhakaMinutes(ms);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

function attendanceRules(db) {
  const get = (key) => setting(db, key);
  return {
    lat: get('gps.lat'), lng: get('gps.lng'), radius_m: get('gps.radius_m'), max_accuracy_m: get('gps.max_accuracy_m'),
    exception: get('gps.exception'), late_grace: get('attendance.late_grace_min'), early_grace: get('attendance.early_grace_min'),
    incomplete_after: get('attendance.incomplete_after_min'), duplicate_window_sec: get('attendance.duplicate_window_sec'),
    clock_skew_flag_min: get('attendance.clock_skew_flag_min'), offline_max_age_days: get('attendance.offline_max_age_days'),
    offline_auto_validate: get('attendance.offline_auto_validate'),
  };
}

const counted = (p) => COUNTED.includes(p.status);
const asMoment = (p) => ({ type: p.type, at: Date.parse(p.at), status: p.status });

// Saves one punch after every check. p: {type, device_ts, lat, lng,
// accuracy, reason}; source: phone or device.
function recordPunch(ctx, staff, p, source, deviceId) {
  const { db } = ctx;
  const rules = attendanceRules(db);
  const now = db.now.getTime();
  const { at, skewMs } = punchMoment(Date.parse(p.device_ts), ctx.clientNow ? Date.parse(ctx.clientNow) : null, now);
  const offline = now - at > OFFLINE_AFTER_MS;
  if (now - at > rules.offline_max_age_days * DAY_MS) throw new AppError('TOO_OLD', { days: rules.offline_max_age_days });
  const date = dhakaDate(at);
  const mine = db.all('Punches').filter((x) => x.staff_id === staff.id && counted(x));

  // The same punch sent twice (a double tap, or two phones) is one punch:
  // the person's latest punch, of the same kind, moments apart.
  const twin = mine.reduce((latest, x) => (!latest || x.at > latest.at ? x : latest), null);
  if (twin && twin.type === p.type && Math.abs(Date.parse(twin.at) - at) <= rules.duplicate_window_sec * 1000) {
    return saved(twin.id, { duplicate: true, type: twin.type, at: twin.at, status: twin.status });
  }

  // In, out, in, out. A punch kept on a phone is checked instead.
  if (!offline) {
    const day = mine.filter((x) => x.date === date).map(asMoment);
    if (nextType(day) !== p.type) {
      if (p.type === 'out') throw new AppError('NOT_IN');
      throw new AppError('SEQUENCE', { time: hhmm(day.sort((a, b) => a.at - b.at)[day.length - 1].at) });
    }
  }

  const flags = [];
  let distance = null;
  if (source === 'phone' && rules.lat !== null && rules.lng !== null) {
    if (p.lat === null || p.lng === null) {
      if (!offline) throw new AppError('LOCATION_REQUIRED');
      flags.push('no_location');
    } else {
      distance = distanceM({ lat: rules.lat, lng: rules.lng }, { lat: p.lat, lng: p.lng });
      const vague = p.accuracy !== null && p.accuracy > rules.max_accuracy_m;
      if (distance > rules.radius_m || vague) {
        flags.push('outside');
        if (!offline && rules.exception === 'block') throw new AppError('OUTSIDE', { distance });
        if (!offline && !p.reason) throw fieldError('reason', vague ? 'val.vague_location' : 'val.outside', { distance, accuracy: p.accuracy || 0 });
      }
    }
  }
  if (offline) flags.push('offline');
  if (Math.abs(skewMs) > rules.clock_skew_flag_min * MINUTE_MS) flags.push('skew');
  const check = flags.includes('outside') || flags.includes('no_location') || (offline && !rules.offline_auto_validate);
  const row = db.insert('Punches', {
    staff_id: staff.id, date, type: p.type, at: new Date(at).toISOString(), device_ts: p.device_ts, source, device_id: deviceId || '',
    lat: p.lat, lng: p.lng, accuracy: p.accuracy, distance_m: distance, flags, reason: p.reason || '', status: check ? 'check' : 'ok',
    decided_by: '', decided_at: '', decide_note: '', fix_id: '', entered_by: ctx.user ? ctx.user.id : deviceId,
  });
  return saved(row.id, { duplicate: false, type: row.type, at: row.at, status: row.status });
}

function ownStaff(ctx) {
  const mine = staffOfUser(ctx.db, ctx.user.id);
  if (!mine) throw new AppError('NO_STAFF');
  return mine;
}

const mayDecide = (ctx, staff) => mayDecideFor(ctx, staff, 'attendance.manage');

function punchView(p) {
  return {
    id: p.id, type: p.type, at: p.at, source: p.source, status: p.status, flags: p.flags || [], reason: p.reason,
    distance_m: p.distance_m, decide_note: p.decide_note,
  };
}

// Day summaries of one person for the dates given.
function daysFor(db, staff, dates, p = planner(db)) {
  const rules = attendanceRules(db);
  const now = db.now.getTime();
  const byDate = new Map(dates.map((d) => [d, []]));
  for (const p of db.all('Punches')) if (p.staff_id === staff.id && byDate.has(p.date)) byDate.get(p.date).push(p);
  return dates.map((date) => {
    const punches = byDate.get(date).sort((a, b) => (a.at < b.at ? -1 : 1));
    const summary = daySummary({ date, plan: p.plan(staff, date), punches: punches.filter(counted).map(asMoment), nowMs: now, rules });
    return { ...summary, first_in: summary.first_in && new Date(summary.first_in).toISOString(), last_out: summary.last_out && new Date(summary.last_out).toISOString(), punches: punches.map(punchView) };
  });
}

function monthDates(month, today) {
  const out = [];
  for (let d = new Date(`${month}-01T00:00:00Z`); d.toISOString().slice(0, 7) === month; d = new Date(d.getTime() + DAY_MS)) {
    const date = d.toISOString().slice(0, 10);
    if (date > today) break;
    out.push(date);
  }
  return out.reverse();
}

function staffHeader(s) {
  return { id: s.id, name: s.name, name_bn: s.name_bn, work_start: s.work_start, work_end: s.work_end, days_off: s.days_off || [], pin_set: Boolean(s.pin_hash) };
}

function fixView(db, f) {
  const replaced = f.replaces ? db.get('Punches', f.replaces) : null;
  return {
    id: f.id, staff_id: f.staff_id, date: f.date, type: f.type, time: f.time, reason: f.reason, status: f.status,
    decide_note: f.decide_note, replaces_at: replaced ? replaced.at : '', created_at: f.created_at,
  };
}

function month(db, staff, input) {
  const today = dhakaDate(db.now.getTime());
  const m = input.month || today.slice(0, 7);
  const days = daysFor(db, staff, monthDates(m, today).filter((d) => d >= joinedOn(staff)));
  const totals = { worked_min: 0, late_days: 0, absent_days: 0, incomplete_days: 0, leave_days: 0 };
  for (const d of days) {
    totals.worked_min += d.worked_min;
    if (d.late_min) totals.late_days++;
    if (d.state === 'absent') totals.absent_days++;
    if (d.state === 'incomplete') totals.incomplete_days++;
    if (d.state === 'leave') totals.leave_days++;
  }
  const fixes = db.all('Attendance_Fixes').filter((f) => f.staff_id === staff.id && f.date.slice(0, 7) === m).map((f) => fixView(db, f));
  return { staff: staffHeader(staff), month: m, days, totals, fixes };
}

function today(ctx) {
  const { db } = ctx;
  const mine = staffOfUser(db, ctx.user.id);
  const checks = ctx.can('attendance.manage') ? waitingChecks(ctx) : null;
  // What waits for this person: attendance checks, rota requests (to agree
  // to or decide) and leave to decide.
  const waiting = { checks: checks ? checks.punches.length + checks.fixes.length : 0, rota: rotaWaiting(ctx), leave: leaveWaiting(ctx) };
  if (!mine) return { staff: null, ...waiting };
  const [day] = daysFor(db, mine, [dhakaDate(db.now.getTime())]);
  const todays = day.punches.filter(counted).map((p) => ({ type: p.type, at: Date.parse(p.at) }));
  return { staff: staffHeader(mine), day, next: nextType(todays), ...waiting };
}

function board(ctx, { date }) {
  const { db } = ctx;
  const day = date || dhakaDate(db.now.getTime());
  const p = planner(db);
  const rows = db.all('Staff').filter((s) => s.status === 'active' && joinedOn(s) <= day)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ staff: staffHeader(s), ...daysFor(db, s, [day], p)[0] }));
  return { date: day, rows };
}

function waitingChecks(ctx) {
  const { db } = ctx;
  const staff = new Map(db.all('Staff').map((s) => [s.id, s]));
  const allowed = (id) => staff.has(id) && mayDecide(ctx, staff.get(id));
  const name = (id) => staff.get(id).name;
  const punches = db.all('Punches').filter((p) => p.status === 'check' && allowed(p.staff_id))
    .map((p) => ({ ...punchView(p), staff_id: p.staff_id, staff_name: name(p.staff_id), date: p.date }));
  const fixes = db.all('Attendance_Fixes').filter((f) => f.status === 'waiting' && allowed(f.staff_id))
    .map((f) => ({ ...fixView(db, f), staff_name: name(f.staff_id) }));
  return { punches, fixes };
}

function applyFix(ctx, fix) {
  const { db } = ctx;
  if (fix.replaces) {
    const old = db.get('Punches', fix.replaces);
    if (old && counted(old)) db.update('Punches', old, { status: 'replaced' });
  }
  db.insert('Punches', {
    staff_id: fix.staff_id, date: fix.date, type: fix.type, at: dhakaIso(fix.date, fix.time), device_ts: '', source: 'fix', device_id: '',
    lat: null, lng: null, accuracy: null, distance_m: null, flags: [], reason: fix.reason, status: 'ok',
    decided_by: ctx.user.id, decided_at: db.nowIso, decide_note: '', fix_id: fix.id, entered_by: fix.asked_by,
  });
  return db.update('Attendance_Fixes', fix, { status: 'approved', decided_by: ctx.user.id, decided_at: db.nowIso });
}

// A correction: the person's own (waits for a manager, or a shareholder for
// a manager; a shareholder's own is final), or one a manager adds for
// someone else (final when they may decide it).
function askFix(ctx, input) {
  const { db } = ctx;
  const own = staffOfUser(db, ctx.user.id);
  const staff = input.staff_id ? db.get('Staff', input.staff_id) : own;
  if (!staff) throw new AppError(input.staff_id ? 'NOT_FOUND' : 'NO_STAFF');
  const forSelf = own && staff.id === own.id;
  if (!forSelf && !ctx.can('attendance.manage')) throw new AppError('FORBIDDEN');
  if (input.date > dhakaDate(db.now.getTime())) throw fieldError('date', 'val.not_future');
  if (input.replaces) {
    const old = db.get('Punches', input.replaces);
    if (!old || old.staff_id !== staff.id || old.date !== input.date || !counted(old)) throw fieldError('replaces', 'val.not_found');
  }
  const fix = db.insert('Attendance_Fixes', {
    staff_id: staff.id, date: input.date, type: input.type, time: input.time, replaces: input.replaces || '', reason: input.reason,
    status: 'waiting', decided_by: '', decided_at: '', decide_note: '', asked_by: ctx.user.id,
  });
  const final = forSelf ? ctx.level === 3 : mayDecide(ctx, staff);
  if (final) applyFix(ctx, fix);
  return saved(fix.id, { final });
}

function decide(ctx, { kind, id, decision, note }) {
  const { db } = ctx;
  const row = db.get(kind === 'punch' ? 'Punches' : 'Attendance_Fixes', id);
  if (!row) throw new AppError('NOT_FOUND');
  if (row.status !== (kind === 'punch' ? 'check' : 'waiting')) throw new AppError('CONFLICT', { by: '' });
  const staff = db.get('Staff', row.staff_id);
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!mayDecide(ctx, staff)) throw new AppError('FORBIDDEN');
  if (decision === 'reject' && !note) throw fieldError('note', 'val.required');
  if (note) db.setReason(note);
  const stamp = { decided_by: ctx.user.id, decided_at: db.nowIso, decide_note: note || '' };
  if (kind === 'punch') db.update('Punches', row, { ...stamp, status: decision === 'accept' ? 'ok' : 'rejected' });
  else if (decision === 'accept') applyFix(ctx, db.update('Attendance_Fixes', row, stamp));
  else db.update('Attendance_Fixes', row, { ...stamp, status: 'declined' });
  return saved(row.id);
}

function withdrawFix(ctx, { id }) {
  const { db } = ctx;
  const fix = db.get('Attendance_Fixes', id);
  if (!fix || fix.asked_by !== ctx.user.id) throw new AppError('NOT_FOUND');
  if (fix.status !== 'waiting') throw new AppError('CONFLICT', { by: '' });
  db.update('Attendance_Fixes', fix, { status: 'withdrawn' });
  return saved(fix.id);
}

// ---- Shop punch devices -----------------------------------------------------

function register(ctx, { name }) {
  const secret = newToken();
  const row = ctx.db.insert('Punch_Devices', { name, secret, status: 'active' });
  // The only time the secret leaves the server. This reply is never stored.
  return saved(row.id, { device_id: row.id, name, secret });
}

// Each device with the time of the last punch made on it.
function devices(ctx) {
  const last = new Map();
  for (const p of ctx.db.all('Punches')) if (p.device_id && (!last.has(p.device_id) || p.at > last.get(p.device_id))) last.set(p.device_id, p.at);
  return { items: ctx.db.all('Punch_Devices').map((d) => ({ id: d.id, version: d.version, name: d.name, status: d.status, last_punch_at: last.get(d.id) || '', created_at: d.created_at })) };
}

function saveDevice(ctx, input) {
  const row = ctx.db.get('Punch_Devices', input.id);
  if (!row) throw new AppError('NOT_FOUND');
  ctx.db.update('Punch_Devices', row, { name: input.name, status: input.status }, input.version);
  return saved(row.id);
}

function activeDevice(db, id) {
  const dev = db.get('Punch_Devices', id);
  if (!dev || dev.status !== 'active') throw new AppError('DEVICE');
  return dev;
}

// What a shop device shows: everyone with a PIN, and each one's next punch.
// The salt lets the device turn a typed PIN into the signing key; the PIN
// itself, and its hash, never leave the server.
function deviceStaff(ctx, { device_id, ts, sig }) {
  const { db } = ctx;
  const dev = activeDevice(db, device_id);
  if (Math.abs(Date.parse(ts) - db.now.getTime()) > DEVICE_READ_MS || !sameHex(sig, signHex(`${device_id}|${ts}`, dev.secret))) throw new AppError('DEVICE');
  const today = dhakaDate(db.now.getTime());
  const punches = db.all('Punches').filter((p) => p.date === today && counted(p));
  const staff = db.all('Staff').filter((s) => s.status === 'active' && s.pin_hash).sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({
    id: s.id, name: s.name, name_bn: s.name_bn, pin_salt: s.pin_salt, pin_iter: s.pin_iter,
    next: nextType(punches.filter((p) => p.staff_id === s.id).map((p) => ({ type: p.type, at: Date.parse(p.at) }))),
  }));
  return { device: { id: dev.id, name: dev.name }, staff };
}

function devicePunch(ctx, input) {
  const { db } = ctx;
  const dev = activeDevice(db, input.device_id);
  db.setActor({ id: dev.id, display_name: dev.name });
  const staff = db.get('Staff', input.staff_id);
  if (!staff || staff.status !== 'active' || !staff.pin_hash) throw new AppError('NOT_FOUND');
  if (staff.pin_locked_until && staff.pin_locked_until > db.nowIso) {
    throw new AppError('PIN_LOCKED', { minutes: Math.ceil((Date.parse(staff.pin_locked_until) - db.now.getTime()) / MINUTE_MS) });
  }
  // Signed with the device's secret and the key made from the person's PIN.
  const expected = signHex(punchText(input), `${dev.secret}${staff.pin_hash}`);
  if (!sameHex(input.sig, expected)) {
    const failed = (staff.pin_failed || 0) + 1;
    const lock = failed >= BUSINESS_DEFAULTS['auth.max_failed'];
    db.update('Staff', staff, {
      pin_failed: lock ? 0 : failed,
      pin_locked_until: lock ? new Date(db.now.getTime() + BUSINESS_DEFAULTS['auth.lock_minutes'] * MINUTE_MS).toISOString() : '',
    });
    throw new AppError('PIN_WRONG');
  }
  if (staff.pin_failed) db.update('Staff', staff, { pin_failed: 0 });
  return recordPunch(ctx, staff, { ...input, reason: '' }, 'device', dev.id);
}

export const ATTENDANCE_HANDLERS = {
  'attendance.punch': (ctx, input) => recordPunch(ctx, ownStaff(ctx), input, 'phone', ''),
  'attendance.today': today,
  'attendance.mine': (ctx, input) => month(ctx.db, ownStaff(ctx), input),
  'attendance.staff': (ctx, input) => {
    const staff = ctx.db.get('Staff', input.staff_id);
    if (!staff) throw new AppError('NOT_FOUND');
    return month(ctx.db, staff, input);
  },
  'attendance.board': board,
  'attendance.checks': waitingChecks,
  'attendance.fix': askFix,
  'attendance.fix.withdraw': withdrawFix,
  'attendance.decide': decide,
  'attendance.device.register': register,
  'attendance.devices': devices,
  'attendance.device.save': saveDevice,
  'attendance.device.staff': deviceStaff,
  'attendance.device.punch': devicePunch,
};
