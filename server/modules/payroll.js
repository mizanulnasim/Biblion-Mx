// Payroll: each accounting month's payslip per person, each person's
// salary history and pay account.
//
// A payslip is worked out from the salary in force on each day (its
// history, in parts, from dates), the days employed, and the unpaid leave
// and absent days a shareholder chooses to cut when paying
// (shared/hr/pay.js). Until it is issued it is a draft that follows
// attendance and leave; once issued its figures stay as they were. A
// month's salary not fully paid some days after the month ends is overdue,
// issued or not (owner decision).
// Advances may be repaid in instalments: the month's instalment is
// suggested as a deduction. Food allowance is shown by week from Saturday.
//
// The pay account: what the shop owes the person (starting balance +
// issued payslips + food allowance earned − salary and food paid −
// deductions) and the advance they owe back (starting advance + advances −
// deductions). Payments are money entries (Salary paid, Food allowance
// paid, Advance given, Salary deduction); Bonus paid is paid as it is given.
//
// Everyone sees their own payslips and pay account without a permission.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { leaveDays } from '../../shared/hr/leave.js';
import { addDays, datesBetween } from '../../shared/hr/plan.js';
import { employedDates, foodEarned, foodWeeks, instalmentDue, payslipFigures, periodKey, periodOf, salaryOn, salaryTotal } from '../../shared/hr/pay.js';
import { payEffect } from '../../shared/money/kinds.js';
import { saveSetting, setting } from '../kernel/settings.js';
import { attendanceMonth } from './attendance.js';
import { planner } from './rota.js';
import { joinedOn, staffOfUser } from './staff.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
// The weeks of food allowance shown on a pay account.
const FOOD_WEEKS_SHOWN = 6;
const counts = (e) => e.status === 'active';
const today = (db) => dhakaDate(db.now.getTime());

const period = (db, key) => periodOf(key, setting(db, 'accounting.month_start_day'));
const thisPeriod = (db) => periodKey(today(db), setting(db, 'accounting.month_start_day'));

// A person's salary history, oldest first. Before any change was recorded,
// the staff record's salary, in one part.
function salaryChanges(db, staff) {
  const rows = db.all('Salary_Changes').filter((c) => c.staff_id === staff.id).sort((a, b) => (a.from < b.from ? -1 : 1));
  if (rows.length || !staff.salary) return rows;
  return [{ from: joinedOn(staff), parts: [{ name: '', amount: staff.salary }], total: staff.salary }];
}

function partsOn(changes, date) {
  let found = changes[0] || null;
  for (const c of changes) if (c.from <= date) found = c;
  return found ? found.parts : [];
}

// The figures a payslip for this person and month would have now; the
// unpaid leave and absent days found, all cut unless `cut` says otherwise.
function draft(db, staff, month, p = planner(db), cut = {}) {
  const per = period(db, month);
  const employed = employedDates(per, joinedOn(staff), staff.left_on);
  const changes = salaryChanges(db, staff);
  const unpaid = employed.filter((d) => {
    const plan = p.plan(staff, d);
    return plan.kind === 'leave' && plan.leave_kind === 'unpaid';
  });
  const absent = attendanceMonth(db, staff, { from: per.from, to: per.to }).days.filter((d) => d.state === 'absent').length;
  const leaveTaken = leaveDays(unpaid.map((d) => p.base(staff, d)), setting(db, 'leave.day_counting'));
  const leaveCut = cut.leave ?? leaveTaken;
  const absentCut = cut.absent ?? 0;
  return {
    month, period_from: per.from, period_to: per.to, parts: partsOn(changes, employed.length ? employed[employed.length - 1] : per.to),
    leave_days: leaveTaken, absent_days: absent, unpaid_leave_days: leaveCut, unpaid_absent_days: absentCut,
    ...payslipFigures({
      period_days: per.days, day_salaries: employed.map((d) => salaryOn(changes, d)),
      divisor_rule: setting(db, 'payroll.unpaid_divisor'), unpaid_leave_days: leaveCut, unpaid_absent_days: absentCut,
    }),
  };
}

// Days that earn food allowance, from joining to today (or leaving).
function foodDates(db, staff, p) {
  const last = staff.left_on && staff.left_on < today(db) ? staff.left_on : today(db);
  const all = joinedOn(staff) <= last ? datesBetween(joinedOn(staff), last) : [];
  const rule = setting(db, 'food.unpaid_rule');
  if (rule === 'every_day') return all;
  if (rule === 'skip_unpaid') return all.filter((d) => !(p.plan(staff, d).kind === 'leave' && p.plan(staff, d).leave_kind === 'unpaid'));
  const worked = new Set(db.all('Punches').filter((x) => x.staff_id === staff.id && x.type === 'in' && (x.status === 'ok' || x.status === 'check')).map((x) => x.date));
  return all.filter((d) => worked.has(d));
}

export function payAccount(db, staff, p = planner(db)) {
  const opening = db.all('Pay_Openings').find((o) => o.staff_id === staff.id) || { owed: 0, advance: 0 };
  const slips = db.all('Payslips').filter((s) => s.staff_id === staff.id && s.status === 'issued');
  const entries = db.all('Transactions').filter((e) => counts(e) && e.party_id === staff.id);
  const food = foodEarned(setting(db, 'food.rates'), foodDates(db, staff, p));
  // A confirmed final settlement adds unused leave paid out and takes off
  // notice short (server/modules/separation.js).
  const settled = db.all('Separations').filter((x) => x.staff_id === staff.id && (x.status === 'settled' || x.status === 'completed'))
    .reduce((t, x) => t + x.settlement.leave_pay - x.settlement.notice_cut, 0);
  let owed = (opening.owed || 0) + slips.reduce((t, s) => t + s.net, 0) + food + settled;
  let advance = opening.advance || 0;
  for (const e of entries) {
    const effect = payEffect(e);
    owed += effect.owed;
    advance += effect.advance;
  }
  const sum = (kind) => entries.filter((e) => e.kind === kind).reduce((t, e) => t + e.amount, 0);
  // The advance instalment due this month, less deductions already made in it.
  const per = period(db, thisPeriod(db));
  const deductedNow = entries.filter((e) => e.kind === 'staff_deduction' && e.date >= per.from && e.date <= per.to).reduce((t, e) => t + e.amount, 0);
  const advances = [
    ...(opening.advance ? [{ date: '', amount: opening.advance, instalment: 0 }] : []),
    ...entries.filter((e) => e.kind === 'staff_advance').map((e) => ({ date: e.date, amount: e.amount, instalment: (e.details && e.details.instalment) || 0 })),
  ];
  const due = Math.max(0, instalmentDue(advances, sum('staff_deduction') - deductedNow) - deductedNow);
  return {
    opening_owed: opening.owed || 0, opening_advance: opening.advance || 0, payslips: slips.reduce((t, s) => t + s.net, 0), food_earned: food, settlement: settled,
    salary_paid: sum('salary_paid'), food_paid: sum('food_paid'), deductions: sum('staff_deduction'), advances: sum('staff_advance'), bonuses: sum('bonus_paid'),
    owed: Math.round(owed), advance: Math.round(advance), instalment_due: Math.min(due, Math.round(advance)),
    food_weeks: foodWeeks(setting(db, 'food.rates'), foodDates(db, staff, p)).slice(-FOOD_WEEKS_SHOWN),
  };
}

const slipView = (s) => ({
  id: s.id, month: s.month, period_from: s.period_from, period_to: s.period_to, staff_id: s.staff_id, salary: s.salary, parts: s.parts || [],
  month_days: s.month_days, divisor: s.divisor, employed_days: s.employed_days, base: s.base, leave_days: s.leave_days,
  unpaid_leave_days: s.unpaid_leave_days, absent_days: s.absent_days, unpaid_absent_days: s.unpaid_absent_days,
  unpaid_cut: s.unpaid_cut, net: s.net, note: s.note, status: s.status, cancel_reason: s.cancel_reason, issued_at: s.issued_at,
});

const paidFor = (db, staffId, month) => db.all('Transactions')
  .filter((e) => counts(e) && e.kind === 'salary_paid' && e.party_id === staffId && e.period === month).reduce((t, e) => t + e.amount, 0);

// The last day a month's salary may be paid: this many days after the
// month ends (the 11 Nov – 10 Dec month is due by 17 Dec).
const dueBy = (db, per) => addDays(per.to, setting(db, 'payroll.overdue_days'));
// Whether a month's salary is overdue: some still to pay after it was due.
const overdue = (db, per, toPay) => toPay > 0 && today(db) > dueBy(db, per);
// How many accounting months back to look for overdue salaries.
const OVERDUE_MONTHS = 12;

// The month's payroll: everyone employed in it, with their draft or issued
// payslip, what has been paid for the month (and whether it is overdue),
// and their pay account.
function monthView(ctx, input) {
  const { db } = ctx;
  const month = input.month || thisPeriod(db);
  const per = period(db, month);
  const p = planner(db);
  const slips = db.all('Payslips').filter((s) => s.month === month && s.status === 'issued');
  const rows = db.all('Staff')
    .filter((s) => employedDates(per, joinedOn(s), s.left_on).length && (s.status === 'active' || (s.left_on && s.left_on >= per.from)))
    .filter((s) => s.salary || salaryChanges(db, s).length || slips.some((x) => x.staff_id === s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const slip = slips.find((x) => x.staff_id === s.id);
      const figures = slip ? slipView(slip) : draft(db, s, month, p);
      const paid = paidFor(db, s.id, month);
      const toPay = Math.max(0, figures.net - paid);
      return {
        staff: { id: s.id, name: s.name, position: s.position, status: s.status }, issued: Boolean(slip), slip: figures,
        paid, to_pay: toPay, overdue: overdue(db, per, toPay), account: payAccount(db, s, p),
      };
    });
  return { month, current: thisPeriod(db), period_from: per.from, period_to: per.to, due_by: dueBy(db, per), rows };
}

// The months before this one whose due date has passed, newest first.
function pastDue(db) {
  const startDay = setting(db, 'accounting.month_start_day');
  const out = [];
  let per = period(db, thisPeriod(db));
  for (let i = 0; i < OVERDUE_MONTHS; i++) {
    per = period(db, periodKey(addDays(per.from, -1), startDay));
    if (today(db) > dueBy(db, per)) out.push(per);
  }
  return out;
}

// A person's overdue salaries: [{month, due_by, left, issued}].
function overdueFor(db, staff, p) {
  return pastDue(db).filter((per) => employedDates(per, joinedOn(staff), staff.left_on).length).map((per) => {
    const slip = db.all('Payslips').find((s) => s.staff_id === staff.id && s.month === per.key && s.status === 'issued');
    const net = slip ? slip.net : salaryChanges(db, staff).length ? draft(db, staff, per.key, p).net : 0;
    return { month: per.key, due_by: dueBy(db, per), left: Math.max(0, net - paidFor(db, staff.id, per.key)), issued: Boolean(slip) };
  }).filter((x) => x.left > 0);
}

// For Home: how many months' salaries are overdue, across everyone.
export function salaryOverdue(ctx) {
  const { db } = ctx;
  if (!ctx.can('payroll.view')) return 0;
  const p = planner(db);
  return db.all('Staff').filter((s) => s.status === 'active' || s.left_on).reduce((n, s) => n + overdueFor(db, s, p).length, 0);
}

function issue(ctx, input) {
  const { db } = ctx;
  const staff = db.get('Staff', input.staff_id);
  if (!staff) throw new AppError('NOT_FOUND');
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (input.month > thisPeriod(db)) throw fieldError('month', 'val.not_future');
  if (!salaryChanges(db, staff).length) throw fieldError('staff_id', 'val.no_salary');
  if (db.all('Payslips').some((s) => s.staff_id === staff.id && s.month === input.month && s.status === 'issued')) throw new AppError('CONFLICT', { by: '' });
  const found = draft(db, staff, input.month);
  const leave = input.unpaid_leave_days ?? found.leave_days;
  if (leave > found.leave_days) throw fieldError('unpaid_leave_days', 'val.max', { max: found.leave_days });
  if (input.unpaid_absent_days > found.absent_days) throw fieldError('unpaid_absent_days', 'val.max', { max: found.absent_days });
  const d = draft(db, staff, input.month, planner(db), { leave, absent: input.unpaid_absent_days });
  const row = db.insert('Payslips', {
    ...d, staff_id: staff.id, note: input.note || '', status: 'issued', cancel_reason: '', issued_by: ctx.user.id, issued_at: db.nowIso,
  });
  return saved(row.id, { net: row.net });
}

function cancel(ctx, { id, reason }) {
  const { db } = ctx;
  const slip = db.get('Payslips', id);
  if (!slip) throw new AppError('NOT_FOUND');
  if (slip.status !== 'issued') throw new AppError('CONFLICT', { by: '' });
  db.setReason(reason);
  db.update('Payslips', slip, { status: 'cancelled', cancel_reason: reason });
  return saved(slip.id);
}

// One payslip, as a document: the person's own, or anyone's with payroll.view.
function payslip(ctx, { id }) {
  const { db } = ctx;
  const slip = db.get('Payslips', id);
  if (!slip) throw new AppError('NOT_FOUND');
  const staff = db.get('Staff', slip.staff_id);
  if (staff.user_id !== ctx.user.id && !ctx.can('payroll.view')) throw new AppError('FORBIDDEN');
  const inPeriod = (date) => date >= slip.period_from && date <= slip.period_to;
  const inMonth = db.all('Transactions').filter((e) => counts(e) && e.party_id === staff.id
    && (e.kind === 'salary_paid' ? e.period === slip.month : inPeriod(e.date) && ['staff_deduction', 'bonus_paid', 'food_paid', 'staff_advance'].includes(e.kind)));
  return {
    staff: { name: staff.name, name_bn: staff.name_bn, position: staff.position, joined_on: joinedOn(staff) },
    slip: slipView(slip),
    entries: inMonth.sort((a, b) => (a.date < b.date ? -1 : 1)).map((e) => ({ date: e.date, kind: e.kind, amount: e.amount })),
  };
}

function mine(ctx) {
  const { db } = ctx;
  const me = staffOfUser(db, ctx.user.id);
  if (!me) throw new AppError('NO_STAFF');
  const slips = db.all('Payslips').filter((s) => s.staff_id === me.id && s.status === 'issued').sort((a, b) => (a.month < b.month ? 1 : -1));
  return { staff: { id: me.id, name: me.name }, account: payAccount(db, me), payslips: slips.map(slipView), overdue: overdueFor(db, me, planner(db)) };
}

function saveOpening(ctx, input) {
  const { db } = ctx;
  const staff = db.get('Staff', input.staff_id);
  if (!staff) throw new AppError('NOT_FOUND');
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  const row = db.all('Pay_Openings').find((o) => o.staff_id === staff.id);
  const fields = { owed: input.owed || 0, advance: input.advance || 0 };
  if (row) db.update('Pay_Openings', row, fields);
  else db.insert('Pay_Openings', { staff_id: staff.id, ...fields });
  return saved(staff.id, payAccount(db, staff));
}

// ---- Salary history ----------------------------------------------------------

// Keeps the staff record's salary to the one in force today (also run by
// the hourly job, for changes from a later date). Returns how many changed.
export function syncSalaries(db) {
  let changed = 0;
  for (const staff of db.all('Staff')) {
    const changes = db.all('Salary_Changes').filter((c) => c.staff_id === staff.id);
    if (!changes.length) continue;
    const now = salaryOn(changes, today(db));
    if (now !== staff.salary) {
      db.update('Staff', staff, { salary: now });
      changed++;
    }
  }
  return changed;
}

function history(ctx, { staff_id: staffId }) {
  const { db } = ctx;
  const staff = db.get('Staff', staffId);
  if (!staff) throw new AppError('NOT_FOUND');
  return {
    staff: { id: staff.id, name: staff.name, salary: staff.salary || 0 },
    changes: salaryChanges(db, staff).slice().reverse().map((c) => ({ id: c.id || '', from: c.from, parts: c.parts, total: c.total, note: c.note || '' })),
  };
}

function changeSalary(ctx, input) {
  const { db } = ctx;
  const staff = db.get('Staff', input.staff_id);
  if (!staff) throw new AppError('NOT_FOUND');
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!input.parts.length) throw fieldError('parts', 'val.required');
  if (input.from < joinedOn(staff)) throw fieldError('from', 'val.before_joining');
  // A change before an issued payslip's month would leave that payslip wrong.
  const issued = db.all('Payslips').filter((s) => s.staff_id === staff.id && s.status === 'issued' && s.period_to >= input.from);
  if (issued.length) throw fieldError('from', 'val.payslip_issued', { month: issued[0].month });
  const fields = { parts: input.parts.map((x) => ({ name: x.name || '', amount: x.amount })), total: salaryTotal(input.parts), note: input.note || '', entered_by: ctx.user.id };
  const same = db.all('Salary_Changes').find((c) => c.staff_id === staff.id && c.from === input.from);
  // The first recorded change keeps the salary from joining until it.
  if (!db.all('Salary_Changes').some((c) => c.staff_id === staff.id) && staff.salary && input.from > joinedOn(staff)) {
    db.insert('Salary_Changes', { staff_id: staff.id, from: joinedOn(staff), parts: [{ name: '', amount: staff.salary }], total: staff.salary, note: '', entered_by: ctx.user.id });
  }
  const row = same ? db.update('Salary_Changes', same, fields) : db.insert('Salary_Changes', { staff_id: staff.id, from: input.from, ...fields });
  syncSalaries(db);
  return saved(row.id, { total: fields.total });
}

// ---- Settings → Payroll --------------------------------------------------------

function payrollSettings(db) {
  return {
    divisor: setting(db, 'payroll.unpaid_divisor'), food_rule: setting(db, 'food.unpaid_rule'), food_rates: setting(db, 'food.rates'),
    month_start_day: setting(db, 'accounting.month_start_day'), overdue_days: setting(db, 'payroll.overdue_days'),
  };
}

function savePayrollSettings(ctx, input) {
  const rates = input.food_rates.filter((r) => r.from);
  const dates = rates.map((r) => r.from);
  if (new Set(dates).size !== dates.length) throw fieldError('food_rates', 'val.taken');
  saveSetting(ctx.db, 'payroll.unpaid_divisor', input.divisor);
  saveSetting(ctx.db, 'food.unpaid_rule', input.food_rule);
  saveSetting(ctx.db, 'food.rates', rates.sort((a, b) => (a.from < b.from ? -1 : 1)));
  // Left out (null): kept as they are.
  if (input.month_start_day !== null) saveSetting(ctx.db, 'accounting.month_start_day', input.month_start_day);
  if (input.overdue_days !== null) saveSetting(ctx.db, 'payroll.overdue_days', input.overdue_days);
  return saved(null, payrollSettings(ctx.db));
}

export const PAYROLL_HANDLERS = {
  'payroll.month': monthView,
  'payroll.issue': issue,
  'payroll.cancel': cancel,
  'payroll.payslip': payslip,
  'payroll.mine': mine,
  'payroll.opening.save': saveOpening,
  'salary.history': history,
  'salary.change': changeSalary,
  'settings.payroll': (ctx) => payrollSettings(ctx.db),
  'settings.payroll.save': savePayrollSettings,
};
