// Payroll: each month's payslip per person, and each person's pay account.
//
// A payslip is worked out from the salary on the staff record, the days
// employed, approved unpaid leave, and absent days a shareholder chooses to
// cut (shared/hr/pay.js). Until it is issued it is a draft that follows
// attendance and leave; once issued its figures stay as they were.
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
import { datesBetween } from '../../shared/hr/plan.js';
import { employedDates, foodEarned, payslipFigures } from '../../shared/hr/pay.js';
import { payEffect } from '../../shared/money/kinds.js';
import { saveSetting, setting } from '../kernel/settings.js';
import { attendanceMonth } from './attendance.js';
import { planner } from './rota.js';
import { joinedOn, staffOfUser } from './staff.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const counts = (e) => e.status === 'active';
const today = (db) => dhakaDate(db.now.getTime());

// The figures a payslip for this person and month would have now.
function draft(db, staff, month, p = planner(db)) {
  const employed = employedDates(month, joinedOn(staff), staff.left_on);
  const unpaid = employed.filter((d) => {
    const plan = p.plan(staff, d);
    return plan.kind === 'leave' && plan.leave_kind === 'unpaid';
  });
  const absent = attendanceMonth(db, staff, { month }).days.filter((d) => d.state === 'absent').length;
  const unpaidLeaveDays = leaveDays(unpaid.map((d) => p.base(staff, d)), setting(db, 'leave.day_counting'));
  return {
    month, salary: staff.salary || 0, absent_days: absent, unpaid_leave_days: unpaidLeaveDays,
    ...payslipFigures({
      month, salary: staff.salary || 0, employed_days: employed.length,
      divisor_rule: setting(db, 'payroll.unpaid_divisor'), unpaid_leave_days: unpaidLeaveDays, unpaid_absent_days: 0,
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
  return {
    opening_owed: opening.owed || 0, opening_advance: opening.advance || 0, payslips: slips.reduce((t, s) => t + s.net, 0), food_earned: food, settlement: settled,
    salary_paid: sum('salary_paid'), food_paid: sum('food_paid'), deductions: sum('staff_deduction'), advances: sum('staff_advance'), bonuses: sum('bonus_paid'),
    owed: Math.round(owed), advance: Math.round(advance),
  };
}

const slipView = (s) => ({
  id: s.id, month: s.month, staff_id: s.staff_id, salary: s.salary, month_days: s.month_days, divisor: s.divisor, employed_days: s.employed_days,
  base: s.base, unpaid_leave_days: s.unpaid_leave_days, absent_days: s.absent_days, unpaid_absent_days: s.unpaid_absent_days,
  unpaid_cut: s.unpaid_cut, net: s.net, note: s.note, status: s.status, cancel_reason: s.cancel_reason, issued_at: s.issued_at,
});

const paidFor = (db, staffId, month) => db.all('Transactions')
  .filter((e) => counts(e) && e.kind === 'salary_paid' && e.party_id === staffId && e.period === month).reduce((t, e) => t + e.amount, 0);

// The month's payroll: everyone employed in it, with their draft or issued
// payslip, what has been paid for the month, and their pay account.
function monthView(ctx, input) {
  const { db } = ctx;
  const month = input.month || today(db).slice(0, 7);
  const p = planner(db);
  const slips = db.all('Payslips').filter((s) => s.month === month && s.status === 'issued');
  const rows = db.all('Staff')
    .filter((s) => employedDates(month, joinedOn(s), s.left_on).length && (s.status === 'active' || (s.left_on && s.left_on.slice(0, 7) >= month)))
    .filter((s) => s.salary || slips.some((x) => x.staff_id === s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const slip = slips.find((x) => x.staff_id === s.id);
      const figures = slip ? slipView(slip) : draft(db, s, month, p);
      const paid = paidFor(db, s.id, month);
      return {
        staff: { id: s.id, name: s.name, position: s.position, status: s.status }, issued: Boolean(slip), slip: figures,
        paid, to_pay: Math.max(0, figures.net - paid), account: payAccount(db, s, p),
      };
    });
  return { month, rows };
}

function issue(ctx, input) {
  const { db } = ctx;
  const staff = db.get('Staff', input.staff_id);
  if (!staff) throw new AppError('NOT_FOUND');
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (input.month > today(db).slice(0, 7)) throw fieldError('month', 'val.not_future');
  if (!staff.salary) throw fieldError('staff_id', 'val.no_salary');
  if (db.all('Payslips').some((s) => s.staff_id === staff.id && s.month === input.month && s.status === 'issued')) throw new AppError('CONFLICT', { by: '' });
  const d = draft(db, staff, input.month);
  if (input.unpaid_absent_days > d.absent_days) throw fieldError('unpaid_absent_days', 'val.max', { max: d.absent_days });
  const figures = payslipFigures({
    month: input.month, salary: d.salary, employed_days: d.employed_days, divisor_rule: setting(db, 'payroll.unpaid_divisor'),
    unpaid_leave_days: d.unpaid_leave_days, unpaid_absent_days: input.unpaid_absent_days,
  });
  const row = db.insert('Payslips', {
    month: input.month, staff_id: staff.id, salary: d.salary, ...figures, unpaid_leave_days: d.unpaid_leave_days, absent_days: d.absent_days,
    unpaid_absent_days: input.unpaid_absent_days, note: input.note || '', status: 'issued', cancel_reason: '', issued_by: ctx.user.id, issued_at: db.nowIso,
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
  const inMonth = db.all('Transactions').filter((e) => counts(e) && e.party_id === staff.id
    && (e.kind === 'salary_paid' ? e.period === slip.month : e.date.slice(0, 7) === slip.month && ['staff_deduction', 'bonus_paid', 'food_paid', 'staff_advance'].includes(e.kind)));
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
  return { staff: { id: me.id, name: me.name }, account: payAccount(db, me), payslips: slips.map(slipView) };
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

// ---- Settings → Payroll --------------------------------------------------------

function payrollSettings(db) {
  return { divisor: setting(db, 'payroll.unpaid_divisor'), food_rule: setting(db, 'food.unpaid_rule'), food_rates: setting(db, 'food.rates') };
}

function savePayrollSettings(ctx, input) {
  const rates = input.food_rates.filter((r) => r.from);
  const dates = rates.map((r) => r.from);
  if (new Set(dates).size !== dates.length) throw fieldError('food_rates', 'val.taken');
  saveSetting(ctx.db, 'payroll.unpaid_divisor', input.divisor);
  saveSetting(ctx.db, 'food.unpaid_rule', input.food_rule);
  saveSetting(ctx.db, 'food.rates', rates.sort((a, b) => (a.from < b.from ? -1 : 1)));
  return saved(null, payrollSettings(ctx.db));
}

export const PAYROLL_HANDLERS = {
  'payroll.month': monthView,
  'payroll.issue': issue,
  'payroll.cancel': cancel,
  'payroll.payslip': payslip,
  'payroll.mine': mine,
  'payroll.opening.save': saveOpening,
  'settings.payroll': (ctx) => payrollSettings(ctx.db),
  'settings.payroll.save': savePayrollSettings,
};
