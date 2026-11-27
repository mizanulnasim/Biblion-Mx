// Staff records. Everyone with staff.view sees the basic record; the private
// parts (identity, emergency contacts, family, salary) are sent and saved
// only with their own permission, so a reply never holds what the person
// may not see. The punch PIN is set here by staff.edit, or by the person
// themselves on My attendance, and is kept only as a hash.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { roleById } from '../../shared/schema/permissions.js';
import { page } from '../kernel/paging.js';
import { KDF_ITERATIONS, hashPassword, newSalt } from '../kernel/crypto.js';
import { dhakaDate } from '../../shared/hr/attendance.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });

// Which private parts each permission opens.
const PRIVATE = Object.freeze({
  'staff.identity': ['nid', 'birth_date', 'address'],
  'staff.emergency': ['emergency'],
  'staff.family': ['family'],
  'salary.view': ['salary'],
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
    id: s.id, version: s.version, name: s.name, name_bn: s.name_bn, phone: s.phone, position: s.position,
    user_id: s.user_id, user_name: user ? user.display_name : '', joined_on: s.joined_on, left_on: s.left_on, status: s.status,
    work_start: s.work_start, work_end: s.work_end, days_off: s.days_off || [], pin_set: Boolean(s.pin_hash),
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
  const result = page(items, query, (s) => `${s.name} ${s.name_bn} ${s.phone} ${s.position}`, (s) => s.name.toLowerCase(), true);
  const linked = new Set(ctx.db.all('Staff').filter((s) => s.user_id).map((s) => s.user_id));
  return {
    ...result,
    items: result.items.map(({ _row, created_at, ...s }) => s),
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
    name: input.name, name_bn: input.name_bn || '', phone: (input.phone || '').replace(/[^\d+]/g, ''), position: input.position || '',
    user_id: input.user_id || '', joined_on: input.joined_on || '', left_on: input.left_on || '', status: input.status,
    work_start: input.work_start || '', work_end: input.work_end || '', days_off: [...new Set(input.days_off.map((d) => d.day))].sort(),
  };
  // Private parts change only with their permission; salary needs salary.edit.
  if (ctx.can('staff.identity')) Object.assign(patch, { nid: input.nid || '', birth_date: input.birth_date || '', address: input.address || '' });
  if (ctx.can('staff.emergency')) patch.emergency = input.emergency.filter((e) => e.name || e.phone);
  if (ctx.can('staff.family')) patch.family = input.family || '';
  if (ctx.can('salary.edit')) patch.salary = input.salary || 0;
  if (input.pin) Object.assign(patch, pinFields(input.pin));
  if (!current) {
    const base = { nid: '', birth_date: '', address: '', emergency: [], family: '', salary: 0, pin_hash: '', pin_salt: '', pin_iter: 0, pin_failed: 0, pin_locked_until: '' };
    const row = db.insert('Staff', { ...base, ...patch });
    return saved(row.id);
  }
  const row = db.update('Staff', current, patch, input.version);
  return saved(row.id);
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
};
