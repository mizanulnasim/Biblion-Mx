// Staff records. Everyone with staff.view sees the basic record; the private
// parts (identity, emergency contacts, family, salary) are sent and saved
// only with their own permission, so a reply never holds what the person
// may not see. The punch PIN is set here by staff.edit, or by the person
// themselves on My attendance, and is kept only as a hash. Each record gets
// a staff number. People may change their own phone, email and address; the
// change waits for someone who may decide for them.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { roleById } from '../../shared/schema/permissions.js';
import { page } from '../kernel/paging.js';
import { KDF_ITERATIONS, hashPassword, newSalt } from '../kernel/crypto.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { salaryOn } from '../../shared/hr/pay.js';
import { setting } from '../kernel/settings.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });

// Which private parts each permission opens.
const PRIVATE = Object.freeze({
  'staff.identity': ['nid', 'birth_date', 'address'],
  'staff.emergency': ['emergency'],
  'staff.family': ['family'],
  'salary.view': ['salary', 'overtime_rate'],
});

function pinFields(pin) {
  const salt = newSalt();
  return { pin_hash: hashPassword(pin, salt, KDF_ITERATIONS), pin_salt: salt, pin_iter: KDF_ITERATIONS, pin_failed: 0, pin_locked_until: '' };
}

// The first day that counts for a person: when they joined, or else when
// their record was made.
export function joinedOn(s) {
  return s.joined_on || dhakaDate(Date.parse(s.created_at));
}

// The staff record linked to a sign-in, if any.
export function staffOfUser(db, userId) {
  return db.all('Staff').find((s) => s.user_id === userId && s.status === 'active') || null;
}

// Whether the signed-in person may decide something (a check, a correction,
// leave, a rota request) for `staff` with permission `perm`: never their
// own, and a manager's only as a shareholder.
export function mayDecideFor(ctx, staff, perm) {
  if (!ctx.can(perm) || staff.user_id === ctx.user.id) return false;
  return staffLevel(ctx.db, staff) < 2 || ctx.level === 3;
}

// Role level of the person a staff record belongs to (1 when they have no sign-in).
function staffLevel(db, staff) {
  const user = staff.user_id ? db.get('Users', staff.user_id) : null;
  const role = user ? roleById(user.role_id) : null;
  return role ? role.level : 1;
}

function staffView(ctx, s, users) {
  const user = s.user_id ? users.get(s.user_id) : null;
  const out = {
    id: s.id, version: s.version, number: s.number, name: s.name, name_bn: s.name_bn, phone: s.phone, email: s.email, position: s.position,
    user_id: s.user_id, user_name: user ? user.display_name : '', joined_on: s.joined_on, left_on: s.left_on, status: s.status,
    work_start: s.work_start, work_end: s.work_end, days_off: s.days_off || [], shift_ids: s.shift_ids || [], pin_set: Boolean(s.pin_hash),
  };
  for (const [perm, cols] of Object.entries(PRIVATE)) {
    if (ctx.can(perm)) for (const c of cols) out[c] = c === 'emergency' ? s[c] || [] : s[c];
  }
  return out;
}

function list(ctx, query) {
  const users = new Map(ctx.db.all('Users').map((u) => [u.id, u]));
  let rows = ctx.db.all('Staff');
  if (query.status) rows = rows.filter((s) => s.status === query.status);
  const items = rows.map((s) => ({ ...staffView(ctx, s, users), _row: s._row, created_at: s.created_at }));
  const result = page(items, query, (s) => `${s.number} ${s.name} ${s.name_bn} ${s.phone} ${s.position}`, (s) => s.name.toLowerCase(), true);
  const linked = new Set(ctx.db.all('Staff').filter((s) => s.user_id).map((s) => s.user_id));
  return {
    ...result,
    items: result.items.map(({ _row, created_at, ...s }) => s),
    // The shifts a person's own list can hold.
    shifts: ctx.db.all('Shifts').filter((s) => s.status === 'active').map((s) => ({ id: s.id, name: s.name })),
    // Sign-ins that are not yet linked to a staff record, to pick from.
    users: [...users.values()].filter((u) => u.status === 'active').map((u) => ({ id: u.id, name: u.display_name, linked: linked.has(u.id) })),
  };
}

function save(ctx, input) {
  const { db } = ctx;
  const all = db.all('Staff');
  const current = input.id ? all.find((s) => s.id === input.id) : null;
  if (input.id && !current) throw new AppError('NOT_FOUND');
  if (current && !input.version) throw fieldError('version', 'val.required');
  if (input.user_id) {
    if (!db.get('Users', input.user_id)) throw fieldError('user_id', 'val.not_found');
    if (all.some((s) => s.user_id === input.user_id && s.id !== input.id)) throw fieldError('user_id', 'val.taken');
  }
  if ((input.work_start && !input.work_end) || (!input.work_start && input.work_end)) {
    throw fieldError(input.work_start ? 'work_end' : 'work_start', 'val.required');
  }
  if (input.work_start && input.work_end <= input.work_start) throw fieldError('work_end', 'val.time_after');
  if (input.status === 'left' && !input.left_on) throw fieldError('left_on', 'val.required');
  if (input.left_on && input.joined_on && input.left_on < input.joined_on) throw fieldError('left_on', 'val.date_order');
  const patch = {
    name: input.name, name_bn: input.name_bn || '', phone: cleanPhone(input.phone), email: input.email || '', position: input.position || '',
    user_id: input.user_id || '', joined_on: input.joined_on || '', left_on: input.left_on || '', status: input.status,
    work_start: input.work_start || '', work_end: input.work_end || '', days_off: [...new Set(input.days_off.map((d) => d.day))].sort(),
    shift_ids: [...new Set((input.shift_ids || []).map((x) => x.id))],
  };
  // Private parts change only with their permission; salary needs salary.edit.
  if (ctx.can('staff.identity')) Object.assign(patch, { nid: input.nid || '', birth_date: input.birth_date || '', address: input.address || '' });
  if (ctx.can('staff.emergency')) patch.emergency = input.emergency.filter((e) => e.name || e.phone);
  if (ctx.can('staff.family')) patch.family = input.family || '';
  if (ctx.can('salary.edit')) Object.assign(patch, { salary: input.salary || 0, overtime_rate: input.overtime_rate || 0 });
  if (input.pin) Object.assign(patch, pinFields(input.pin));
  let row;
  if (!current) {
    const base = { nid: '', birth_date: '', address: '', emergency: [], family: '', salary: 0, overtime_rate: 0, pin_hash: '', pin_salt: '', pin_iter: 0, pin_failed: 0, pin_locked_until: '' };
    row = db.insert('Staff', { ...base, ...patch, number: nextNumber(db) });
  } else {
    row = db.update('Staff', current, patch, input.version);
  }
  if (ctx.can('salary.edit')) recordSalary(db, row, input.salary || 0, ctx.user.id);
  return saved(row.id);
}

const cleanPhone = (phone) => (phone || '').replace(/[^\d+]/g, '');

// The next staff number: the prefix and one more than the highest given.
function nextNumber(db) {
  const prefix = setting(db, 'staff.number_prefix');
  const used = db.all('Staff').map((s) => Number(String(s.number || '').replace(/\D/g, '')) || 0);
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(setting(db, 'staff.number_digits'), '0')}`;
}

// ---- The person's own contact details ----------------------------------------

const DETAILS = ['phone', 'email', 'address'];

function changeView(c, names) {
  return { id: c.id, staff_id: c.staff_id, staff_name: names ? names.get(c.staff_id) || '' : '', phone: c.phone, email: c.email, address: c.address, before: c.before, status: c.status, decide_note: c.decide_note, created_at: c.created_at };
}

function myDetails(ctx) {
  const { db } = ctx;
  const me = staffOfUser(db, ctx.user.id);
  if (!me) throw new AppError('NO_STAFF');
  const waiting = db.all('Detail_Changes').find((c) => c.staff_id === me.id && c.status === 'waiting');
  const last = db.all('Detail_Changes').filter((c) => c.staff_id === me.id && c.status === 'rejected').sort((a, b) => (a.decided_at < b.decided_at ? 1 : -1))[0];
  return {
    allowed: setting(db, 'staff.self_edit'), number: me.number, phone: me.phone, email: me.email, address: me.address,
    waiting: waiting ? changeView(waiting) : null, rejected: last && !waiting ? changeView(last) : null,
  };
}

// A new change replaces one still waiting.
function askDetails(ctx, input) {
  const { db } = ctx;
  if (!setting(db, 'staff.self_edit')) throw new AppError('FORBIDDEN');
  const me = staffOfUser(db, ctx.user.id);
  if (!me) throw new AppError('NO_STAFF');
  const next = { phone: cleanPhone(input.phone), email: input.email || '', address: input.address || '' };
  if (DETAILS.every((k) => next[k] === (me[k] || ''))) throw fieldError('phone', 'val.unchanged');
  for (const c of db.all('Detail_Changes').filter((x) => x.staff_id === me.id && x.status === 'waiting')) db.update('Detail_Changes', c, { status: 'withdrawn' });
  const row = db.insert('Detail_Changes', {
    staff_id: me.id, ...next, before: { phone: me.phone || '', email: me.email || '', address: me.address || '' }, status: 'waiting', decided_by: '', decided_at: '', decide_note: '',
  });
  return saved(row.id);
}

function decideDetails(ctx, { id, decision, note }) {
  const { db } = ctx;
  const c = db.get('Detail_Changes', id);
  if (!c) throw new AppError('NOT_FOUND');
  if (c.status !== 'waiting') throw new AppError('CONFLICT', { by: '' });
  const staff = db.get('Staff', c.staff_id);
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!mayDecideFor(ctx, staff, 'staff.edit')) throw new AppError('FORBIDDEN');
  if (decision === 'reject' && !note) throw fieldError('note', 'val.required');
  if (note) db.setReason(note);
  if (decision === 'accept') db.update('Staff', staff, { phone: c.phone, email: c.email, address: c.address });
  db.update('Detail_Changes', c, { status: decision === 'accept' ? 'approved' : 'rejected', decided_by: ctx.user.id, decided_at: db.nowIso, decide_note: note || '' });
  return saved(c.id);
}

// Changes waiting for this person to decide.
export function detailsWaiting(ctx) {
  const { db } = ctx;
  if (!ctx.can('staff.edit')) return [];
  return db.all('Detail_Changes').filter((c) => c.status === 'waiting' && mayDecideFor(ctx, db.get('Staff', c.staff_id), 'staff.edit'));
}

function waitingChanges(ctx) {
  const names = new Map(ctx.db.all('Staff').map((s) => [s.id, s.name]));
  return { items: detailsWaiting(ctx).map((c) => changeView(c, names)) };
}

// A salary set on the staff screen (one amount, no parts named) goes into
// the salary history: from joining when it is the first, else from today.
function recordSalary(db, staff, amount, actor) {
  const changes = db.all('Salary_Changes').filter((c) => c.staff_id === staff.id);
  const now = dhakaDate(db.now.getTime());
  if (!amount || (changes.length && salaryOn(changes, now) === amount)) return;
  const from = changes.length ? now : joinedOn(staff);
  const fields = { parts: [{ name: '', amount }], total: amount, food_rate: null, note: '', entered_by: actor };
  const same = changes.find((c) => c.from === from);
  if (same) db.update('Salary_Changes', same, fields);
  else db.insert('Salary_Changes', { staff_id: staff.id, from, ...fields });
}

// The person's own PIN, for punching on a shop device.
function ownPin(ctx, { pin }) {
  const mine = staffOfUser(ctx.db, ctx.user.id);
  if (!mine) throw new AppError('NO_STAFF');
  ctx.db.update('Staff', mine, pinFields(pin));
  return saved(mine.id);
}

export const STAFF_HANDLERS = {
  'staff.list': list,
  'staff.save': save,
  'attendance.pin': ownPin,
  'staff.my_details': myDetails,
  'staff.my_details.save': askDetails,
  'staff.details.waiting': waitingChanges,
  'staff.details.decide': decideDetails,
};
