// Someone leaving: a resignation (by the person, or recorded for them) or a
// termination; accepting it sets the last day; handing over their tasks;
// the final settlement; and completing it. Also the letters (offer,
// appointment, experience, release) from the templates in Settings.
//
// Final settlement = what the shop still owes them (their pay account)
//   + unused leave paid out (all, none, or the days a shareholder chooses)
//   − notice short of the expected notice (for a resignation, if set)
//   − the advance they still owe.
// It is confirmed only once every payslip up to the last day is issued; the
// leave paid out and the notice cut then join their pay account, and the
// money is paid with the usual staff pay kinds.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { LETTER_KINDS, fillLetter, letterDate, taka, unknownPlaceholders } from '../../shared/hr/letters.js';
import { saveSetting, setting } from '../kernel/settings.js';
import { balanceOf } from './leave.js';
import { payAccount } from './payroll.js';
import { joinedOn, mayDecideFor, staffOfUser } from './staff.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const today = (db) => dhakaDate(db.now.getTime());
const DAY_MS = 86400000;
const OPEN = ['requested', 'accepted', 'settled'];
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);

function openFor(db, staffId) {
  return db.all('Separations').find((x) => x.staff_id === staffId && OPEN.includes(x.status)) || null;
}

// Payslip months from the one after the latest issued (or the last day's
// month, if none was ever issued) to the last day's month.
function missingPayslips(db, staff, lastDay) {
  if (!staff.salary) return [];
  const issued = db.all('Payslips').filter((p) => p.staff_id === staff.id && p.status === 'issued').map((p) => p.month).sort();
  const lastMonth = lastDay.slice(0, 7);
  const out = [];
  let m = issued.length ? issued[issued.length - 1] : null;
  const next = (month) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 7);
  };
  m = m ? next(m) : lastMonth;
  for (; m <= lastMonth; m = next(m)) out.push(m);
  return out.filter((month) => month >= joinedOn(staff).slice(0, 7));
}

// The settlement as it would be now. leaveDays: the days of unused leave to
// pay out when the setting is 'ask' (default: all of them).
function settlementFor(db, sep, leaveDays) {
  const staff = db.get('Staff', sep.staff_id);
  const account = payAccount(db, staff);
  const unused = Math.max(0, balanceOf(db, staff).balance);
  const encash = setting(db, 'separation.leave_encash');
  const days = encash === 'never' ? 0 : encash === 'always' ? unused : Math.min(unused, leaveDays ?? unused);
  const monthDays = new Date(Date.UTC(Number(sep.last_day.slice(0, 4)), Number(sep.last_day.slice(5, 7)), 0)).getUTCDate();
  const rate = (staff.salary || 0) / (setting(db, 'payroll.unpaid_divisor') === 'fixed_30' ? 30 : monthDays);
  const expected = setting(db, 'separation.notice_days');
  const given = daysBetween(sep.notice_date, sep.last_day);
  const short = sep.kind === 'resignation' && setting(db, 'separation.notice_deduct') ? Math.max(0, expected - given) : 0;
  const leavePay = Math.round(days * rate);
  const noticeCut = Math.round(short * rate);
  return {
    owed: account.owed, advance: account.advance, unused_leave: unused, encash, leave_days: days, day_rate: Math.round(rate),
    leave_pay: leavePay, notice_expected: expected, notice_given: given, notice_short: short, notice_cut: noticeCut,
    final: account.owed + leavePay - noticeCut - account.advance,
    missing_payslips: missingPayslips(db, staff, sep.last_day),
  };
}

function view(db, sep) {
  const staff = db.get('Staff', sep.staff_id);
  const tasks = db.all('Tasks').filter((t) => t.staff_id === staff.id && t.status === 'open').length;
  const templates = db.all('Task_Templates').filter((t) => t.staff_id === staff.id && t.status === 'active').length;
  return {
    id: sep.id, version: sep.version, staff: { id: staff.id, name: staff.name, position: staff.position, salary: staff.salary || 0, joined_on: joinedOn(staff) },
    kind: sep.kind, notice_date: sep.notice_date, last_day: sep.last_day, reason: sep.reason, status: sep.status,
    settlement: sep.settlement, handover: { tasks, templates },
    letters: db.all('Letters').filter((l) => l.staff_id === staff.id).map((l) => ({ id: l.id, kind: l.kind, issued_at: l.issued_at })),
  };
}

// The person resigns (asked), or a manager records a resignation or a
// termination for someone (accepted at once when they may decide it).
function submit(ctx, input) {
  const { db } = ctx;
  const own = staffOfUser(db, ctx.user.id);
  const staff = input.staff_id ? db.get('Staff', input.staff_id) : own;
  if (!staff || staff.status !== 'active') throw new AppError(input.staff_id ? 'NOT_FOUND' : 'NO_STAFF');
  const forSelf = Boolean(own && own.id === staff.id);
  if (!forSelf && !ctx.can('separation.manage')) throw new AppError('FORBIDDEN');
  if (forSelf && input.kind !== 'resignation') throw fieldError('kind', 'val.choice');
  if (openFor(db, staff.id)) throw new AppError('OVERLAP');
  const noticeDate = input.notice_date || today(db);
  if (input.last_day < noticeDate) throw fieldError('last_day', 'val.date_order');
  const accept = !forSelf && mayDecideFor(ctx, staff, 'separation.manage');
  const row = db.insert('Separations', {
    staff_id: staff.id, kind: input.kind, notice_date: noticeDate, last_day: input.last_day, reason: input.reason,
    status: accept ? 'accepted' : 'requested', settlement: null, accepted_by: accept ? ctx.user.id : '', accepted_at: accept ? db.nowIso : '',
    settled_by: '', settled_at: '', completed_by: '', completed_at: '', asked_by: ctx.user.id,
  });
  if (accept) db.update('Staff', staff, { left_on: input.last_day });
  return saved(row.id, { accepted: accept });
}

function managed(ctx, id) {
  const { db } = ctx;
  const sep = db.get('Separations', id);
  if (!sep) throw new AppError('NOT_FOUND');
  const staff = db.get('Staff', sep.staff_id);
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!mayDecideFor(ctx, staff, 'separation.manage')) throw new AppError('FORBIDDEN');
  return { sep, staff };
}

// Accepting sets the last day; their pay from then on counts days to it.
function accept(ctx, { id, last_day: lastDay }) {
  const { db } = ctx;
  const { sep, staff } = managed(ctx, id);
  if (sep.status !== 'requested') throw new AppError('CONFLICT', { by: '' });
  const day = lastDay || sep.last_day;
  if (day < sep.notice_date) throw fieldError('last_day', 'val.date_order');
  db.update('Separations', sep, { status: 'accepted', last_day: day, accepted_by: ctx.user.id, accepted_at: db.nowIso });
  db.update('Staff', staff, { left_on: day });
  return saved(sep.id);
}

function withdraw(ctx, { id, reason }) {
  const { db } = ctx;
  const sep = db.get('Separations', id);
  if (!sep) throw new AppError('NOT_FOUND');
  const staff = db.get('Staff', sep.staff_id);
  const own = staff.user_id === ctx.user.id;
  if (!own && !mayDecideFor(ctx, staff, 'separation.manage')) throw new AppError('FORBIDDEN');
  if (!['requested', 'accepted'].includes(sep.status) || sep.last_day < today(db)) throw new AppError('CONFLICT', { by: '' });
  db.setReason(reason);
  db.update('Separations', sep, { status: 'withdrawn' });
  db.update('Staff', staff, { left_on: '' });
  return saved(sep.id);
}

// Hands every open task and active repeating task of the person to someone else.
function handover(ctx, { id, to_staff_id: toId }) {
  const { db } = ctx;
  const { sep, staff } = managed(ctx, id);
  if (!OPEN.includes(sep.status)) throw new AppError('CONFLICT', { by: '' });
  const to = db.get('Staff', toId);
  if (!to || to.status !== 'active' || to.id === staff.id) throw fieldError('to_staff_id', 'val.not_found');
  let moved = 0;
  for (const t of db.all('Tasks').filter((x) => x.staff_id === staff.id && x.status === 'open')) {
    db.update('Tasks', t, { staff_id: to.id });
    moved++;
  }
  for (const t of db.all('Task_Templates').filter((x) => x.staff_id === staff.id && x.status === 'active')) {
    db.update('Task_Templates', t, { staff_id: to.id });
    moved++;
  }
  return saved(sep.id, { moved });
}

function settlement(ctx, { id, leave_days: leaveDays }) {
  const { db } = ctx;
  const sep = db.get('Separations', id);
  if (!sep) throw new AppError('NOT_FOUND');
  return { ...view(db, sep), figures: sep.settlement || settlementFor(db, sep, leaveDays), account: payAccount(db, db.get('Staff', sep.staff_id)) };
}

function confirm(ctx, { id, leave_days: leaveDays }) {
  const { db } = ctx;
  const sep = db.get('Separations', id);
  if (!sep) throw new AppError('NOT_FOUND');
  const staff = db.get('Staff', sep.staff_id);
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (sep.status !== 'accepted') throw new AppError('CONFLICT', { by: '' });
  const figures = settlementFor(db, sep, leaveDays);
  if (figures.missing_payslips.length) throw new AppError('PAYSLIPS_MISSING', { months: figures.missing_payslips.join(', ') });
  db.update('Separations', sep, { status: 'settled', settlement: figures, settled_by: ctx.user.id, settled_at: db.nowIso });
  return saved(sep.id, figures);
}

function reopen(ctx, { id, reason }) {
  const { db } = ctx;
  const sep = db.get('Separations', id);
  if (!sep) throw new AppError('NOT_FOUND');
  if (sep.status !== 'settled') throw new AppError('CONFLICT', { by: '' });
  db.setReason(reason);
  db.update('Separations', sep, { status: 'accepted', settlement: null, settled_by: '', settled_at: '' });
  return saved(sep.id);
}

// After the last day: the person is marked as left and can't sign in.
// Anything still open of theirs is skipped.
function complete(ctx, { id }) {
  const { db } = ctx;
  const { sep, staff } = managed(ctx, id);
  if (!(sep.status === 'settled' || (sep.status === 'accepted' && !staff.salary))) throw new AppError('CONFLICT', { by: '' });
  if (sep.last_day > today(db)) throw fieldError('last_day', 'val.not_yet', { date: sep.last_day });
  db.update('Separations', sep, { status: 'completed', completed_by: ctx.user.id, completed_at: db.nowIso });
  db.update('Staff', staff, { status: 'left', left_on: sep.last_day });
  const user = staff.user_id ? db.get('Users', staff.user_id) : null;
  if (user && user.status === 'active') db.update('Users', user, { status: 'inactive' });
  for (const t of db.all('Tasks').filter((x) => x.staff_id === staff.id && x.status === 'open')) db.update('Tasks', t, { status: 'skipped', skip_reason: 'left' });
  for (const t of db.all('Task_Templates').filter((x) => x.staff_id === staff.id && x.status === 'active')) db.update('Task_Templates', t, { status: 'ended' });
  return saved(sep.id);
}

function list(ctx) {
  const { db } = ctx;
  return { items: db.all('Separations').sort((a, b) => (a.last_day < b.last_day ? 1 : -1)).map((s) => view(db, s)) };
}

function mine(ctx) {
  const { db } = ctx;
  const me = staffOfUser(db, ctx.user.id);
  if (!me) throw new AppError('NO_STAFF');
  const sep = db.all('Separations').filter((s) => s.staff_id === me.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  return { notice_days: setting(db, 'separation.notice_days'), separation: sep ? view(db, sep) : null };
}

// ---- Letters ------------------------------------------------------------------

function letterValues(db, staff) {
  const hours = staff.work_start ? `${staff.work_start} to ${staff.work_end}` : '';
  return {
    today: letterDate(today(db)), name: staff.name, name_bn: staff.name_bn, position: staff.position, phone: staff.phone, address: staff.address,
    joined_on: letterDate(joinedOn(staff)), left_on: letterDate(staff.left_on), salary: staff.salary ? taka(staff.salary) : '', hours,
    conduct: setting(db, 'letters.experience_conduct'), shop_address: setting(db, 'shop.address'),
  };
}

// Offer and appointment letters need staff.edit; experience and release
// letters need separation.manage and a last day.
function issueLetter(ctx, { staff_id: staffId, kind }) {
  const { db } = ctx;
  const staff = db.get('Staff', staffId);
  if (!staff) throw new AppError('NOT_FOUND');
  const leaving = kind === 'experience' || kind === 'release';
  if (!ctx.can(leaving ? 'separation.manage' : 'staff.edit')) throw new AppError('FORBIDDEN');
  if (leaving && !staff.left_on) throw fieldError('kind', 'val.no_last_day');
  const { title, paragraphs } = fillLetter(setting(db, `letters.${kind}`), letterValues(db, staff));
  const row = db.insert('Letters', { staff_id: staff.id, kind, title, paragraphs, issued_by: ctx.user.id, issued_at: db.nowIso });
  return saved(row.id);
}

function getLetter(ctx, { id }) {
  const { db } = ctx;
  const l = db.get('Letters', id);
  if (!l) throw new AppError('NOT_FOUND');
  const staff = db.get('Staff', l.staff_id);
  if (staff.user_id !== ctx.user.id && !ctx.can('staff.view')) throw new AppError('FORBIDDEN');
  return { id: l.id, kind: l.kind, title: l.title, paragraphs: l.paragraphs, issued_at: l.issued_at, shop_address: setting(db, 'shop.address'), staff_name: staff.name };
}

function letters(ctx, { staff_id: staffId }) {
  const { db } = ctx;
  const staff = db.get('Staff', staffId);
  if (!staff) throw new AppError('NOT_FOUND');
  return {
    staff: { id: staff.id, name: staff.name, left_on: staff.left_on },
    items: db.all('Letters').filter((l) => l.staff_id === staff.id).sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1))
      .map((l) => ({ id: l.id, kind: l.kind, title: l.title, issued_at: l.issued_at })),
  };
}

const LETTER_SETTINGS = Object.freeze({
  offer: 'letters.offer', appointment: 'letters.appointment', experience: 'letters.experience', release: 'letters.release',
  conduct: 'letters.experience_conduct', shop_address: 'shop.address',
});

function letterSettings(db) {
  const out = {};
  for (const [name, key] of Object.entries(LETTER_SETTINGS)) out[name] = setting(db, key);
  return out;
}

function saveLetterSettings(ctx, input) {
  for (const kind of LETTER_KINDS) {
    const unknown = unknownPlaceholders(input[kind]);
    if (unknown.length) throw fieldError(kind, 'val.placeholder', { names: unknown.join(', ') });
  }
  for (const [name, key] of Object.entries(LETTER_SETTINGS)) saveSetting(ctx.db, key, input[name] || '');
  return saved(null, letterSettings(ctx.db));
}

export const SEPARATION_HANDLERS = {
  'separation.list': list,
  'separation.mine': mine,
  'separation.submit': submit,
  'separation.accept': accept,
  'separation.withdraw': withdraw,
  'separation.handover': handover,
  'separation.settlement': settlement,
  'separation.confirm': confirm,
  'separation.reopen': reopen,
  'separation.complete': complete,
  'letters.list': letters,
  'letters.issue': issueLetter,
  'letters.get': getLetter,
  'settings.letters': (ctx) => letterSettings(ctx.db),
  'settings.letters.save': saveLetterSettings,
};
