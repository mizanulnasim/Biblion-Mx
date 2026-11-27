// Month closing and shareholders (owner decisions; the same figures as v1).
//
// An accounting month's profit:
//     net sales + other income + interest on loans shareholders took
//   − expenses − vendor costs − the cost of books sold or written off
//   − staff salaries − food allowance − bonuses − owner salaries
//   − interest owed on loans shareholders gave
//   + the drawer's over/short
// A loss is made up from later months' profit before anything is shared;
// what is left is split by the shares in force at the month's start.
// Interest is worked out day by day on each loan's balance, at its yearly
// rate. Closing a month keeps its figures as they were and locks its
// entries; only the latest closed month can be reopened, with a reason.
//
// A shareholder's statement: what the business owes them (owner salary,
// profit shares and interest of closed months, less what was paid or
// withdrawn) against what they owe it (advances and loans taken, with
// interest), and where that leaves them.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { periodKey, periodOf } from '../../shared/hr/pay.js';
import { addDays, datesBetween } from '../../shared/hr/plan.js';
import { cashEffect, loanEffect, payEffect } from '../../shared/money/kinds.js';
import { roleById } from '../../shared/schema/permissions.js';
import { setting } from '../kernel/settings.js';
import { bookCosts } from './suppliers.js';
import { monthPay } from './payroll.js';
import { planner } from './rota.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const r2 = (n) => Math.round(n * 100) / 100;
const today = (db) => dhakaDate(db.now.getTime());
const counts = (e) => e.status === 'active';
const startDay = (db) => setting(db, 'accounting.month_start_day');
const period = (db, key) => periodOf(key, startDay(db));
const previous = (db, key) => periodKey(addDays(period(db, key).from, -1), startDay(db));

// ---- Loans and interest --------------------------------------------------------

// A loan's balance (what is owed on it) after each entry, in date order.
function loanEntries(db, loan) {
  return db.all('Transactions').filter((e) => counts(e) && e.details && e.details.loan_id === loan.id)
    .map((e) => ({ date: e.date, amount: loan.direction === 'taken' ? loanEffect(e) : -loanEffect(e) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Interest on a loan for the days from `from` to `to`: each day's closing
// balance × the yearly rate ÷ 365.
function loanInterest(db, loan, from, to) {
  if (!loan.rate) return 0;
  const entries = loanEntries(db, loan);
  let balance = entries.filter((e) => e.date < from).reduce((t, e) => t + e.amount, 0);
  let interest = 0;
  for (const d of datesBetween(from, to)) {
    for (const e of entries) if (e.date === d) balance += e.amount;
    if (balance > 0) interest += (balance * loan.rate) / 100 / 365;
  }
  return r2(interest);
}

const loanBalance = (db, loan, asOf) => r2(loanEntries(db, loan).filter((e) => e.date <= asOf).reduce((t, e) => t + e.amount, 0));

// Each loan over a period: what was owed before it, lent and repaid in it,
// owed at its end, and its interest.
export function loanRegister(db, from, to) {
  const names = new Map(db.all('Shareholders').map((s) => [s.id, s.name]));
  return db.all('Loans').sort((a, b) => (a.number < b.number ? -1 : 1)).map((l) => {
    const inP = loanEntries(db, l).filter((e) => e.date >= from && e.date <= to);
    return {
      number: l.number, name: names.get(l.shareholder_id) || '', direction: l.direction, rate: l.rate || 0, opened: l.opened,
      before: loanBalance(db, l, addDays(from, -1)), lent: r2(inP.filter((e) => e.amount > 0).reduce((t, e) => t + e.amount, 0)),
      repaid: r2(-inP.filter((e) => e.amount < 0).reduce((t, e) => t + e.amount, 0)), closing: loanBalance(db, l, to), interest: loanInterest(db, l, from, to),
    };
  });
}

// ---- Shares ---------------------------------------------------------------------

// The shares in force on a date: {shareholder_id: percent}.
function sharesOn(db, date) {
  const rows = db.all('Share_History').filter((h) => h.from <= date).sort((a, b) => (a.from < b.from ? -1 : 1));
  const row = rows[rows.length - 1];
  return row ? Object.fromEntries(row.shares.map((s) => [s.shareholder_id, s.percent])) : {};
}

// ---- The month's figures ------------------------------------------------------------

// Staff whose pay is a salary (not shareholders, who have an owner salary).
export function salaried(db) {
  return db.all('Staff').filter((s) => {
    const user = s.user_id ? db.get('Users', s.user_id) : null;
    const role = user ? roleById(user.role_id) : null;
    return !(role && role.key === 'owner');
  });
}

function monthFigures(db, month) {
  const per = period(db, month);
  const inP = (e) => counts(e) && e.date >= per.from && e.date <= per.to;
  const entries = db.all('Transactions').filter(inP);
  const sum = (kinds, f = (e) => e.amount) => r2(entries.filter((e) => kinds.includes(e.kind)).reduce((t, e) => t + f(e), 0));
  const shifts = entries.filter((e) => e.kind === 'daily_shift');
  const net = r2(shifts.reduce((t, e) => t + e.amount, 0));
  const books = r2(shifts.reduce((t, e) => t + (e.details.books_sales || 0), 0));
  const loans = db.all('Loans');
  const interestFrom = r2(loans.filter((l) => l.direction === 'taken').reduce((t, l) => t + loanInterest(db, l, per.from, per.to), 0));
  const interestOwed = r2(loans.filter((l) => l.direction === 'given').reduce((t, l) => t + loanInterest(db, l, per.from, per.to), 0));
  // Expenses by category, and vendor costs.
  const categories = new Map(db.all('Expense_Categories').map((c) => [c.id, c]));
  const byCategory = new Map();
  for (const e of entries.filter((x) => x.kind === 'expense')) byCategory.set(e.category_id, r2((byCategory.get(e.category_id) || 0) + e.amount));
  const expenses = r2([...byCategory.values()].reduce((t, v) => t + v, 0));
  const vendorCosts = r2(sum(['vendor_purchase_credit', 'vendor_purchase_paid']) - sum(['vendor_credit_note']));
  // Books: copies sold and written off, at their cost.
  const costs = bookCosts(db);
  const bookCost = r2(db.all('Stock_Movements').filter((m) => m.status === 'active' && m.qty < 0 && m.kind !== 'returned' && m.date >= per.from && m.date <= per.to)
    .reduce((t, m) => t + -m.qty * (costs.get(m.book_id) || 0), 0));
  const p = planner(db);
  const pay = salaried(db).map((s) => monthPay(db, s, month, p));
  const staffSalaries = r2(pay.reduce((t, x) => t + x.net, 0));
  const food = r2(pay.reduce((t, x) => t + x.food, 0));
  const bonuses = sum(['bonus_paid']);
  const ownerSalaries = r2(db.all('Shareholders').filter((s) => s.status === 'active').reduce((t, s) => t + (s.salary || 0), 0));
  const drawer = r2(shifts.reduce((t, e) => t + (e.details.short_over || 0), 0));
  const otherIncome = sum(['income']);
  const income = r2(net + otherIncome + interestFrom);
  const opex = r2(expenses + vendorCosts + bookCost);
  const profit = r2(income - opex - staffSalaries - food - bonuses - ownerSalaries - interestOwed + drawer);
  return {
    month, period_from: per.from, period_to: per.to,
    net, books, cafe: r2(net - books), other_income: otherIncome, interest_from: interestFrom, income,
    categories: [...byCategory.entries()].map(([id, amount]) => ({ id, name: (categories.get(id) || {}).name || '', area: (categories.get(id) || {}).area || '', amount })),
    expenses, vendor_costs: vendorCosts, book_cost: bookCost, opex,
    staff_salaries: staffSalaries, food, bonuses, owner_salaries: ownerSalaries, interest_owed: interestOwed, drawer, profit,
    loans: loans.map((l) => ({ id: l.id, number: l.number, shareholder_id: l.shareholder_id, direction: l.direction, rate: l.rate, interest: loanInterest(db, l, per.from, per.to) })),
  };
}

// The loss carried into a month: from the latest closed month before it.
function lossBefore(db, month) {
  const closed = db.all('Month_Closings').filter((c) => c.status === 'closed' && c.month < month).sort((a, b) => (a.month < b.month ? 1 : -1))[0];
  return closed ? closed.figures.loss_after : 0;
}

// The month's figures with the share-out: a loss is made up first.
export function withShares(db, month) {
  const f = monthFigures(db, month);
  const before = lossBefore(db, month);
  const shareable = r2(Math.max(0, f.profit - before));
  const lossAfter = r2(Math.max(0, before - f.profit));
  const shares = sharesOn(db, f.period_from);
  const names = new Map(db.all('Shareholders').map((s) => [s.id, s.name]));
  return {
    ...f, loss_before: before, shareable, loss_after: lossAfter,
    shares: Object.entries(shares).map(([id, percent]) => ({ shareholder_id: id, name: names.get(id) || '', percent, amount: r2((shareable * percent) / 100) })),
  };
}

// What has to be done before a month closes: it has ended, and each of its
// days (from the day records start) is closed.
function steps(db, month) {
  const per = period(db, month);
  const start = setting(db, 'accounting.start_date') || '';
  const closedDays = new Set(db.all('Day_Closings').filter((d) => d.status === 'closed').map((d) => d.date));
  const open = per.to < today(db) ? datesBetween(per.from, per.to).filter((d) => d >= start && !closedDays.has(d)) : [];
  return [
    { id: 'ended', state: per.to < today(db) ? 'done' : 'todo', params: { date: per.to } },
    { id: 'days', state: per.to < today(db) && !open.length ? 'done' : 'todo', params: { count: open.length, first: open[0] || '' } },
  ];
}

function closingOf(db, month) {
  return db.all('Month_Closings').find((c) => c.month === month && c.status === 'closed') || null;
}

function view(ctx, input) {
  const { db } = ctx;
  const month = input.month || previous(db, periodKey(today(db), startDay(db)));
  const closed = closingOf(db, month);
  return {
    month, current: periodKey(today(db), startDay(db)), closed: Boolean(closed),
    closed_at: closed ? closed.closed_at : '', figures: closed ? closed.figures : withShares(db, month), steps: closed ? [] : steps(db, month),
  };
}

function close(ctx, { month, note }) {
  const { db } = ctx;
  if (closingOf(db, month)) throw new AppError('CONFLICT', { by: '' });
  if (steps(db, month).some((s) => s.state !== 'done')) throw new AppError('MONTH_NOT_READY');
  const shares = sharesOn(db, period(db, month).from);
  if (r2(Object.values(shares).reduce((t, v) => t + v, 0)) !== 100) throw new AppError('SHARES_MISSING');
  // Months close in order.
  const before = previous(db, month);
  const anyClosed = db.all('Month_Closings').some((c) => c.status === 'closed');
  if (anyClosed && !closingOf(db, before)) throw new AppError('MONTH_ORDER', { month: before });
  const row = db.insert('Month_Closings', {
    month, status: 'closed', figures: withShares(db, month), note: note || '', closed_by: ctx.user.id, closed_at: db.nowIso,
    reopened_by: '', reopened_at: '', reopen_reason: '',
  });
  return saved(row.id, { profit: row.figures.profit });
}

function reopen(ctx, { month, reason }) {
  const { db } = ctx;
  const row = closingOf(db, month);
  if (!row) throw new AppError('NOT_FOUND');
  if (db.all('Month_Closings').some((c) => c.status === 'closed' && c.month > month)) throw new AppError('MONTH_ORDER', { month });
  db.setReason(reason);
  db.update('Month_Closings', row, { status: 'reopened', reopened_by: ctx.user.id, reopened_at: db.nowIso, reopen_reason: reason });
  return saved(row.id);
}

// ---- Shareholders: shares, loans, statements ----------------------------------------

function shareholders(ctx) {
  const { db } = ctx;
  const names = new Map(db.all('Shareholders').map((s) => [s.id, s.name]));
  return {
    shareholders: db.all('Shareholders').map((s) => ({ id: s.id, name: s.name, salary: s.salary || 0, status: s.status })),
    history: db.all('Share_History').sort((a, b) => (a.from < b.from ? 1 : -1))
      .map((h) => ({ id: h.id, from: h.from, note: h.note, shares: h.shares.map((x) => ({ ...x, name: names.get(x.shareholder_id) || '' })) })),
    loans: db.all('Loans').sort((a, b) => (a.number < b.number ? -1 : 1)).map((l) => ({
      id: l.id, version: l.version, number: l.number, shareholder_id: l.shareholder_id, name: names.get(l.shareholder_id) || '', direction: l.direction,
      rate: l.rate, opened: l.opened, note: l.note, status: l.status, balance: loanBalance(db, l, today(db)),
    })),
    statements: statements(db),
  };
}

function saveShares(ctx, input) {
  const { db } = ctx;
  const ids = input.shares.map((s) => s.shareholder_id);
  if (new Set(ids).size !== ids.length) throw fieldError('shares', 'val.taken');
  for (const id of ids) if (!db.get('Shareholders', id)) throw fieldError('shares', 'val.not_found');
  const total = r2(input.shares.reduce((t, s) => t + s.percent, 0));
  if (total !== 100) throw fieldError('shares', 'val.shares_total', { total });
  // A change can't reach back into a closed month.
  const closedTo = db.all('Month_Closings').filter((c) => c.status === 'closed').reduce((m, c) => (c.figures.period_to > m ? c.figures.period_to : m), '');
  if (input.from <= closedTo) throw fieldError('from', 'val.month_closed', { date: closedTo });
  const same = db.all('Share_History').find((h) => h.from === input.from);
  const fields = { shares: input.shares.filter((s) => s.percent > 0), note: input.note || '', entered_by: ctx.user.id };
  const row = same ? db.update('Share_History', same, fields) : db.insert('Share_History', { from: input.from, ...fields });
  return saved(row.id);
}

function saveLoan(ctx, input) {
  const { db } = ctx;
  const holder = db.get('Shareholders', input.shareholder_id);
  if (!holder) throw fieldError('shareholder_id', 'val.not_found');
  const fields = { shareholder_id: holder.id, direction: input.direction, rate: input.rate || 0, opened: input.opened, note: input.note || '', status: input.status };
  if (!input.id) {
    const number = `L${String(db.all('Loans').length + 1).padStart(3, '0')}`;
    return saved(db.insert('Loans', { number, ...fields }).id);
  }
  const row = db.get('Loans', input.id);
  if (!row) throw new AppError('NOT_FOUND');
  db.update('Loans', row, fields, input.version);
  return saved(row.id);
}

// For Home: profit shares overdue, in all.
export function profitOverdue(ctx) {
  if (!ctx.can('acc.shareholders')) return 0;
  return r2(statements(ctx.db).reduce((t, s) => t + s.profit_overdue, 0));
}

// Each shareholder's account: what the business owes them and what they owe
// it, from their opening figures (Getting started) on, as of a date (today
// unless given): months closed by then and entries up to it.
export function statements(db, asOf = today(db)) {
  const closed = db.all('Month_Closings').filter((c) => c.status === 'closed' && c.figures.period_to <= asOf);
  const entries = db.all('Transactions').filter((e) => counts(e) && e.date <= asOf);
  const overdueDays = setting(db, 'payroll.overdue_days');
  return db.all('Shareholders').map((s) => {
    const mine = entries.filter((e) => e.party_id === s.id);
    const paid = (kind) => r2(mine.filter((e) => e.kind === kind).reduce((t, e) => t + e.amount, 0));
    const salary = r2(closed.length * (s.salary || 0));
    const profit = r2(closed.reduce((t, c) => t + (c.figures.shares.find((x) => x.shareholder_id === s.id) || { amount: 0 }).amount, 0));
    const loanInt = (dir) => r2(closed.reduce((t, c) => t + c.figures.loans.filter((l) => l.shareholder_id === s.id && l.direction === dir).reduce((u, l) => u + l.interest, 0), 0));
    const interestEarned = loanInt('given');
    const interestCharged = loanInt('taken');
    const advance = r2(mine.reduce((t, e) => t + payEffect(e).advance, 0));
    const loansTaken = r2(db.all('Loans').filter((l) => l.shareholder_id === s.id && l.direction === 'taken').reduce((t, l) => t + loanBalance(db, l, asOf), 0));
    const loansGiven = r2(db.all('Loans').filter((l) => l.shareholder_id === s.id && l.direction === 'given').reduce((t, l) => t + loanBalance(db, l, asOf), 0));
    // Profit shares are due the payroll overdue days after their month
    // ends; what is paid is set against the oldest first.
    const dueShares = closed.filter((c) => addDays(c.figures.period_to, overdueDays) < asOf)
      .reduce((t, c) => t + (c.figures.shares.find((x) => x.shareholder_id === s.id) || { amount: 0 }).amount, 0);
    const profitOverdue = r2(Math.max(0, dueShares - paid('profit_share')));
    const owedToThem = r2((s.opening_owed || 0) + salary + profit + interestEarned - paid('owner_salary') - paid('profit_share') - paid('owner_withdrawal'));
    // The shop's money they hold now, in accounts held by them.
    const held = r2(db.all('Money_Accounts').filter((a) => a.kind === 'owner' && a.shareholder_id === s.id)
      .reduce((t, a) => t + entries.reduce((u, e) => u + cashEffect(e, a.id), a.opening || 0), 0));
    const owesBusiness = r2((s.opening_owes || 0) + held + advance + loansTaken + interestCharged);
    return {
      id: s.id, name: s.name, salary, profit, interest_earned: interestEarned, salary_paid: paid('owner_salary'), profit_paid: paid('profit_share'),
      withdrawn: paid('owner_withdrawal'), owed_to_them: owedToThem, advance, loans_taken: loansTaken, interest_charged: interestCharged,
      owes_business: owesBusiness, loans_given: loansGiven, settle: r2(owedToThem - owesBusiness),
      opening_owed: s.opening_owed || 0, opening_owes: s.opening_owes || 0, held, profit_overdue: profitOverdue,
    };
  });
}

export const MONTH_HANDLERS = {
  'month.view': view,
  'month.close': close,
  'month.reopen': reopen,
  'shareholders.view': shareholders,
  'shareholders.shares.save': saveShares,
  'shareholders.loan.save': saveLoan,
};
