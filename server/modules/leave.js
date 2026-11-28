// Leave: what each person has earned and used, asking for leave, and
// deciding it. Paid leave comes from the balance; unpaid leave doesn't; a
// kind a shareholder adds says for itself (server/modules/leave-types.js).
// A half day is the first or second half of one day and counts 0.5.
// A balance is worked out when asked (shared/hr/leave.js), never stored:
// earned since probation + a shareholder's adjustments − approved leave
// taken from the balance.
//
// Everyone asks for their own leave without a permission. A manager decides
// staff leave, a shareholder decides a manager's, nobody their own; a
// shareholder's own leave is final. Leave that has started can be cancelled
// only by someone who may decide it. Approved leave moves the person's tasks
// (server/modules/tasks.js).

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { earnedLeave, earningFrom, leaveDays } from '../../shared/hr/leave.js';
import { datesBetween } from '../../shared/hr/plan.js';
import { setting } from '../kernel/settings.js';
import { joinedOn, mayDecideFor, staffOfUser } from './staff.js';
import { planner } from './rota.js';
import { moveTasksForLeave } from './tasks.js';
import { tell } from './messages.js';
import { leaveType, leaveTypes } from './leave-types.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const round2 = (n) => Math.round(n * 100) / 100;
const OPEN = ['waiting', 'approved'];

function leaveRules(db) {
  return {
    probation_months: setting(db, 'leave.probation_months'), rate: setting(db, 'leave.rate'), timing: setting(db, 'leave.timing'),
    partial: setting(db, 'leave.partial'), day_counting: setting(db, 'leave.day_counting'), allow_negative: setting(db, 'leave.allow_negative'),
  };
}

export function balanceOf(db, staff) {
  const rules = leaveRules(db);
  const joined = joinedOn(staff);
  const earned = earnedLeave({ joined_on: joined, as_of: dhakaDate(db.now.getTime()), ...rules });
  const adjusted = db.all('Leave_Adjustments').filter((a) => a.staff_id === staff.id).reduce((t, a) => t + a.days, 0);
  const fromBalance = new Set(leaveTypes(db).filter((t) => t.from_balance).map((t) => t.id));
  const taken = db.all('Leaves').filter((l) => l.staff_id === staff.id && fromBalance.has(l.kind));
  const used = taken.filter((l) => l.status === 'approved').reduce((t, l) => t + l.days, 0);
  const waiting = taken.filter((l) => l.status === 'waiting').reduce((t, l) => t + l.days, 0);
  return {
    earning_from: earningFrom(joined, rules.probation_months), earned, adjusted: round2(adjusted), used,
    balance: round2(earned + adjusted - used), waiting,
  };
}

// Days a leave would take for this person (half: a half day).
function countDays(db, staff, from, to, half) {
  const p = planner(db);
  return leaveDays(datesBetween(from, to).map((d) => ({ ...p.base(staff, d), half: half || '' })), setting(db, 'leave.day_counting'));
}

function leaveView(l, names) {
  return {
    id: l.id, staff_id: l.staff_id, staff_name: names.get(l.staff_id) || '', kind: l.kind, half: l.half || '', from: l.from, to: l.to, days: l.days,
    reason: l.reason, status: l.status, decide_note: l.decide_note, cancel_reason: l.cancel_reason, created_at: l.created_at,
  };
}

const names = (db) => new Map(db.all('Staff').map((s) => [s.id, s.name]));

function mine(ctx) {
  const { db } = ctx;
  const me = staffOfUser(db, ctx.user.id);
  if (!me) throw new AppError('NO_STAFF');
  const items = db.all('Leaves').filter((l) => l.staff_id === me.id).sort((a, b) => (a.from < b.from ? 1 : -1));
  return {
    staff: { id: me.id, name: me.name }, balance: balanceOf(db, me), items: items.map((l) => leaveView(l, names(db))), rules: leaveRules(db),
    types: leaveTypes(db),
  };
}

function whose(ctx, staffId) {
  const own = staffOfUser(ctx.db, ctx.user.id);
  const staff = staffId ? ctx.db.get('Staff', staffId) : own;
  if (!staff) throw new AppError(staffId ? 'NOT_FOUND' : 'NO_STAFF');
  const forSelf = Boolean(own && own.id === staff.id);
  if (!forSelf && !ctx.can('leave.approve')) throw new AppError('FORBIDDEN');
  return { staff, forSelf };
}

function preview(ctx, input) {
  const { staff } = whose(ctx, input.staff_id);
  if (input.to < input.from) throw fieldError('to', 'val.date_order');
  return { days: countDays(ctx.db, staff, input.from, input.to, input.half), balance: balanceOf(ctx.db, staff) };
}

// Leave from the balance must fit in what is left after waiting requests,
// unless a setting allows going below zero.
function checkBalance(db, staff, days, ignoreId) {
  if (setting(db, 'leave.allow_negative')) return;
  const b = balanceOf(db, staff);
  const fromBalance = new Set(leaveTypes(db).filter((t) => t.from_balance).map((t) => t.id));
  const waitingOthers = db.all('Leaves').filter((l) => l.staff_id === staff.id && fromBalance.has(l.kind) && l.status === 'waiting' && l.id !== ignoreId)
    .reduce((t, l) => t + l.days, 0);
  const left = round2(b.balance - waitingOthers);
  if (days > left) throw new AppError('LEAVE_BALANCE', { balance: left, days });
}

function apply(ctx, input) {
  const { db } = ctx;
  const { staff, forSelf } = whose(ctx, input.staff_id);
  if (input.to < input.from) throw fieldError('to', 'val.date_order');
  const type = leaveType(db, input.kind);
  if (!type || type.status !== 'active') throw fieldError('kind', 'val.not_found');
  const half = input.half || '';
  if (half && !type.half_days) throw fieldError('half', 'val.no_half_days');
  if (half && input.to !== input.from) throw fieldError('to', 'val.half_one_day');
  const overlap = db.all('Leaves').some((l) => l.staff_id === staff.id && OPEN.includes(l.status) && l.from <= input.to && l.to >= input.from);
  if (overlap) throw new AppError('OVERLAP');
  const days = countDays(db, staff, input.from, input.to, half);
  if (!days) throw new AppError('NO_DAYS');
  if (type.from_balance) checkBalance(db, staff, days, null);
  const final = forSelf ? ctx.level === 3 : mayDecideFor(ctx, staff, 'leave.approve');
  const row = db.insert('Leaves', {
    staff_id: staff.id, kind: type.id, half, from: input.from, to: input.to, days, reason: input.reason, status: final ? 'approved' : 'waiting',
    decided_by: final ? ctx.user.id : '', decided_at: final ? db.nowIso : '', decide_note: '', cancel_reason: '', asked_by: ctx.user.id,
  });
  if (final) moveTasksForLeave(ctx, row);
  return saved(row.id, { final, days });
}

function decide(ctx, { id, decision, note }) {
  const { db } = ctx;
  const l = db.get('Leaves', id);
  if (!l) throw new AppError('NOT_FOUND');
  if (l.status !== 'waiting') throw new AppError('CONFLICT', { by: '' });
  const staff = db.get('Staff', l.staff_id);
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!mayDecideFor(ctx, staff, 'leave.approve')) throw new AppError('FORBIDDEN');
  if (decision === 'reject' && !note) throw fieldError('note', 'val.required');
  if (decision === 'accept' && (leaveType(db, l.kind) || {}).from_balance) checkBalance(db, staff, l.days, l.id);
  if (note) db.setReason(note);
  const row = db.update('Leaves', l, { status: decision === 'accept' ? 'approved' : 'declined', decided_by: ctx.user.id, decided_at: db.nowIso, decide_note: note || '' });
  if (decision === 'accept') moveTasksForLeave(ctx, row);
  tell(ctx, staff.user_id, decision === 'accept' ? 'msg.leave_approved' : 'msg.leave_declined', { from: { d: l.from }, to: { d: l.to }, note: note || '' }, '/leave');
  return saved(l.id);
}

function cancel(ctx, { id, reason }) {
  const { db } = ctx;
  const l = db.get('Leaves', id);
  if (!l) throw new AppError('NOT_FOUND');
  if (!OPEN.includes(l.status)) throw new AppError('CONFLICT', { by: '' });
  const staff = db.get('Staff', l.staff_id);
  const own = staff.user_id === ctx.user.id;
  const started = l.from <= dhakaDate(db.now.getTime());
  const allowed = mayDecideFor(ctx, staff, 'leave.approve') || (own && (l.status === 'waiting' || !started));
  if (!allowed) throw new AppError('FORBIDDEN');
  db.setReason(reason);
  db.update('Leaves', l, { status: 'cancelled', cancel_reason: reason });
  return saved(l.id);
}

// For managers: leave waiting for them, leave coming up, and everyone's balance.
function overview(ctx) {
  const { db } = ctx;
  const today = dhakaDate(db.now.getTime());
  const n = names(db);
  const all = db.all('Leaves');
  const decidable = (l) => mayDecideFor(ctx, db.get('Staff', l.staff_id), 'leave.approve');
  return {
    types: leaveTypes(db),
    waiting: all.filter((l) => l.status === 'waiting' && decidable(l)).sort((a, b) => (a.from < b.from ? -1 : 1)).map((l) => leaveView(l, n)),
    upcoming: all.filter((l) => l.status === 'approved' && l.to >= today).sort((a, b) => (a.from < b.from ? -1 : 1)).map((l) => leaveView(l, n)),
    balances: db.all('Staff').filter((s) => s.status === 'active').sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({ staff: { id: s.id, name: s.name }, ...balanceOf(db, s) })),
  };
}

export function leaveWaiting(ctx) {
  if (!ctx.can('leave.approve')) return 0;
  return ctx.db.all('Leaves').filter((l) => l.status === 'waiting' && mayDecideFor(ctx, ctx.db.get('Staff', l.staff_id), 'leave.approve')).length;
}

function adjust(ctx, input) {
  const { db } = ctx;
  const staff = db.get('Staff', input.staff_id);
  if (!staff) throw new AppError('NOT_FOUND');
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!input.days) throw fieldError('days', 'val.not_zero');
  db.setReason(input.reason);
  const row = db.insert('Leave_Adjustments', { staff_id: staff.id, date: dhakaDate(db.now.getTime()), days: input.days, reason: input.reason });
  return saved(row.id, balanceOf(db, staff));
}

// ---- Settings → Leave and rota -------------------------------------------------

// A kind of leave a shareholder adds or changes.
function saveType(ctx, input) {
  const { db } = ctx;
  const clash = db.all('Leave_Types').some((t) => t.name.toLowerCase() === input.name.toLowerCase() && t.id !== input.id);
  if (clash) throw fieldError('name', 'val.taken');
  const fields = { name: input.name, name_bn: input.name_bn || '', paid: Boolean(input.paid), from_balance: Boolean(input.from_balance), half_days: Boolean(input.half_days), status: input.status };
  if (!input.id) return saved(db.insert('Leave_Types', fields).id);
  const row = db.get('Leave_Types', input.id);
  if (!row) throw new AppError('NOT_FOUND');
  db.update('Leave_Types', row, fields, input.version);
  return saved(row.id);
}

export const LEAVE_HANDLERS = {
  'leave.mine': mine,
  'leave.preview': preview,
  'leave.apply': apply,
  'leave.decide': decide,
  'leave.cancel': cancel,
  'leave.overview': overview,
  'leave.adjust': adjust,
  'leave.types': (ctx) => ({ types: leaveTypes(ctx.db) }),
  'leave.type.save': saveType,
};
