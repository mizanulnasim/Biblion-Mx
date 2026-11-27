// The printable reports (shared/reports/reports.js), each built as one model
// the screen, print and Excel all show:
//   {title, sub: [text], blocks: [block]}
// A block is a section heading {kind: 'section', title}, a list of figures
// {kind: 'kv', rows: [{label, value, total}]}, a table {kind: 'table',
// columns: [{label, type}], rows: [[cell]], total: [cell]}, a note
// {kind: 'note', text}, or signature lines {kind: 'sign', labels}.
// A text is a plain string, {s: plain string}, {t: message id, p: params}
// or {d: date}; a cell is a text or a number (money unless its column says
// 'percent'). Titles, headings and labels are given here as message ids,
// or as {s: a name}. Figures follow the same rules as the screens they
// come from.

import { AppError } from '../../shared/contract/errors.js';
import { REPORTS } from '../../shared/reports/reports.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { periodKey, periodOf } from '../../shared/hr/pay.js';
import { addDays } from '../../shared/hr/plan.js';
import { KINDS, cashEffect, dueEffect, payEffect } from '../../shared/money/kinds.js';
import { setting } from '../kernel/settings.js';
import { lookups } from './money.js';
import { loanRegister, statements, withShares } from './month.js';
import { salaryReport } from './payroll.js';

const r2 = (n) => Math.round(n * 100) / 100;
const counts = (e) => e.status === 'active';
const t = (id, p = {}) => ({ t: id, p });
const d = (date) => ({ d: date });
const s = (text) => ({ s: text });
// A label: a message id, or already a text.
const label = (x) => (typeof x === 'string' ? t(x) : x);
const section = (title) => ({ kind: 'section', title: t(title) });
const kv = (rows) => ({ kind: 'kv', rows: rows.filter(Boolean).map(([l, value, total]) => ({ label: label(l), value, total: Boolean(total) })) });
const table = (columns, rows, total = null) => ({ kind: 'table', columns: columns.map(([l, type]) => ({ label: label(l), type: type || 'text' })), rows, total });
const note = (text) => ({ kind: 'note', text });
const sign = (...labels) => ({ kind: 'sign', labels: labels.map(t) });
const sum = (rows, f) => r2(rows.reduce((acc, x) => acc + f(x), 0));
const AREAS = { books: 'setup.area.books', cafe: 'setup.area.cafe', shared: 'setup.area.shared', sales: 'rep.area.sales', other: 'rep.area.other' };
const DIRECTIONS = { taken: 'sh.taken', given: 'sh.given' };
const period = (db, month) => periodOf(month, setting(db, 'accounting.month_start_day'));
const rangeText = (from, to) => t('rep.range', { from: d(from), to: d(to) });

// Each account's balance at the end of a date.
function balancesOn(db, date) {
  const entries = db.all('Transactions').filter((e) => counts(e) && e.date <= date);
  return db.all('Money_Accounts').filter((a) => a.status === 'active')
    .map((a) => ({ name: a.name, balance: r2(entries.reduce((acc, e) => acc + cashEffect(e, a.id), a.opening || 0)) }));
}

function balanceBlocks(db, date) {
  const rows = balancesOn(db, date);
  return [section('rep.balances'), kv([...rows.map((b) => [s(b.name), b.balance]), ['rep.balances_total', sum(rows, (b) => b.balance), true]])];
}

// What an entry is about: its category or party, else its note.
function detailOf(e, names) {
  const row = names.get(e.category_id) || names.get(e.party_id);
  return row ? row.name || row.display_name : e.note || '';
}

// ---- The day -------------------------------------------------------------------------

function daily(db, { date }) {
  const names = lookups(db);
  const name = (id) => (names.get(id) ? names.get(id).name : '');
  const entries = db.all('Transactions').filter((e) => counts(e) && e.date === date);
  const shift = entries.find((e) => e.kind === 'daily_shift');
  const others = entries.filter((e) => e !== shift);
  const blocks = [];
  if (!shift) {
    blocks.push(note(t('rep.no_shift')));
  } else {
    const x = shift.details;
    const drawerEnd = balancesOn(db, date).find((b) => b.name === name(shift.account_id));
    const closing = drawerEnd ? drawerEnd.balance : 0;
    blocks.push(
      section('rep.sales'),
      kv([['month.net_sales', shift.amount, true], ['month.books', x.books_sales || 0], ['month.cafe', r2(shift.amount - (x.books_sales || 0))],
        ['rep.cash', x.cash], ['rep.bkash', x.bkash], ['rep.card', x.card], ['rep.dues', sum(x.dues, (u) => u.amount)]]),
      section('rep.drawer'),
      kv([['rep.drawer_opening', r2(closing - cashEffect(shift, shift.account_id))], ['rep.expected_cash', x.expected_cash], ['rep.actual_cash', x.actual_cash],
        ['month.drawer', x.short_over], ['rep.handed_to', name(x.handed_to) || '—'], ['rep.handed', x.handed], ['rep.drawer_closing', closing, true]]),
    );
  }
  const out = (kinds, f = () => true) => sum(others.filter((e) => kinds.includes(e.kind) && f(e)), (e) => e.amount);
  blocks.push(
    section('rep.day_entries'),
    table([['rep.col.kind'], ['rep.col.detail'], ['rep.col.account'], ['rep.col.amount', 'money'], ['rep.col.note']],
      others.map((e) => [t(KINDS[e.kind].label), detailOf(e, names), name(e.account_id), e.amount, e.note || ''])),
    kv([['rep.expenses_today', out(['expense']), true], ['rep.expenses_drawer', out(['expense'], (e) => shift && e.account_id === shift.account_id)],
      ['rep.publishers_paid', r2(out(['publisher_payment']) - out(['publisher_refund']))], ['rep.vendors_paid', out(['vendor_payment'])]]),
    ...balanceBlocks(db, date),
    sign('rep.sign_prepared', 'rep.sign_cash_received'),
  );
  return { title: 'rep.title.daily', sub: [d(date)], blocks };
}

// ---- The month -------------------------------------------------------------------------

function monthly(db, { month }) {
  const closed = db.all('Month_Closings').find((c) => c.month === month && c.status === 'closed');
  const f = closed ? closed.figures : withShares(db, month);
  return {
    title: 'month.report',
    sub: [rangeText(f.period_from, f.period_to), closed ? t('month.closed') : t('rep.not_closed')],
    blocks: [
      section('month.income'),
      kv([['month.net_sales', f.net], ['month.books', f.books], ['month.cafe', f.cafe], ['month.other_income', f.other_income],
        ['month.interest_from', f.interest_from], ['month.total_income', f.income, true]]),
      section('month.costs'),
      kv([...f.categories.map((c) => [s(c.name), c.amount]), ['month.vendor_costs', f.vendor_costs], ['month.book_cost', f.book_cost], ['month.opex', f.opex, true]]),
      section('month.pay'),
      kv([['month.staff_salaries', f.staff_salaries], ['month.food', f.food], ['month.bonuses', f.bonuses], ['month.owner_salaries', f.owner_salaries],
        ['month.interest_owed', f.interest_owed], ['month.drawer', f.drawer]]),
      kv([['month.profit', f.profit, true], ['month.loss_before', f.loss_before], ['month.shareable', f.shareable, true], ['month.loss_after', f.loss_after]]),
      section('month.shares'),
      f.shares.length ? table([['rep.col.shareholder'], ['rep.col.percent', 'percent'], ['rep.col.amount', 'money']], f.shares.map((x) => [x.name, x.percent, x.amount]))
        : note(t('month.no_shares')),
      ...balanceBlocks(db, f.period_to),
      sign('month.sign_prepared', 'month.sign_checked', 'month.sign_approved'),
    ],
  };
}

// Each shareholder's account over the month: owed at its start, what was
// added and paid in it, owed at its end, and settling up.
function shareholders(db, { month }) {
  const per = period(db, month);
  const start = statements(db, addDays(per.from, -1));
  const end = statements(db, per.to);
  const cols = [[s(''), 'text'], ...end.map((x) => [s(x.name), 'money']), ['rep.col.total', 'money']];
  const row = (rowLabel, f) => {
    const values = end.map((x, i) => r2(f(x, start[i])));
    return [rowLabel, ...values, sum(values, (v) => v)];
  };
  const moved = (field) => (x, b) => x[field] - b[field];
  return {
    title: 'rep.title.shareholders',
    sub: [rangeText(per.from, per.to)],
    blocks: [
      section('rep.owed_to_them'),
      table(cols, [
        row(t('rep.sh.start'), (x, b) => b.owed_to_them),
        row(t('rep.sh.salary'), moved('salary')), row(t('rep.sh.profit'), moved('profit')), row(t('rep.sh.interest'), moved('interest_earned')),
        row(t('rep.sh.salary_paid'), (x, b) => -(x.salary_paid - b.salary_paid)), row(t('rep.sh.profit_paid'), (x, b) => -(x.profit_paid - b.profit_paid)),
        row(t('rep.sh.withdrawn'), (x, b) => -(x.withdrawn - b.withdrawn)),
      ], row(t('rep.sh.end'), (x) => x.owed_to_them)),
      section('rep.owes_business'),
      table(cols, [
        row(t('rep.sh.advance'), (x) => x.advance), row(t('rep.sh.loans_taken'), (x) => x.loans_taken), row(t('rep.sh.interest_charged'), (x) => x.interest_charged),
        row(t('rep.sh.held'), (x) => x.held), row(t('rep.sh.opening_owes'), (x) => x.opening_owes),
      ], row(t('rep.sh.owes_end'), (x) => x.owes_business)),
      section('rep.settle'),
      table(cols, [row(t('rep.sh.loans_given'), (x) => x.loans_given), row(t('rep.sh.profit_overdue'), (x) => x.profit_overdue)], row(t('rep.sh.settle'), (x) => x.settle)),
      sign(...end.map(() => 'rep.sign_shareholder')),
    ],
  };
}

// ---- Staff, loans and dues -------------------------------------------------------------

function salary(db, { month }) {
  const r = salaryReport(db, month);
  const total = (f) => sum(r.rows, f);
  return {
    title: 'rep.title.salary',
    sub: [rangeText(r.period_from, r.period_to)],
    blocks: [
      section('rep.salaries'),
      table([['rep.col.name'], ['rep.col.position'], ['rep.col.salary', 'money'], ['rep.col.net', 'money'], ['rep.col.paid', 'money'], ['rep.col.to_pay', 'money'], ['rep.col.signature']],
        r.rows.map((x) => [x.name, x.position, x.salary, x.net, x.paid, x.to_pay, '']),
        [t('rep.col.total'), '', total((x) => x.salary), total((x) => x.net), total((x) => x.paid), total((x) => x.to_pay), '']),
      section('rep.food'),
      table([['rep.col.name'], ['rep.col.earned', 'money'], ['rep.col.paid', 'money']], r.rows.map((x) => [x.name, x.food_earned, x.food_paid]),
        [t('rep.col.total'), total((x) => x.food_earned), total((x) => x.food_paid)]),
      section('rep.advances'),
      table([['rep.col.name'], ['rep.col.before', 'money'], ['rep.col.given', 'money'], ['rep.col.deducted', 'money'], ['rep.col.after', 'money']],
        r.rows.map((x) => [x.name, x.advance_before, x.advance_given, x.deducted, x.advance_after]),
        [t('rep.col.total'), total((x) => x.advance_before), total((x) => x.advance_given), total((x) => x.deducted), total((x) => x.advance_after)]),
      note(t('rep.salary_due', { date: d(r.due_by) })),
    ],
  };
}

function loans(db, { month }) {
  const per = period(db, month);
  const rows = loanRegister(db, per.from, per.to);
  return {
    title: 'rep.title.loans',
    sub: [rangeText(per.from, per.to)],
    blocks: [table(
      [['rep.col.loan'], ['rep.col.shareholder'], ['rep.col.direction'], ['rep.col.rate', 'percent'], ['rep.col.opened'], ['rep.col.before', 'money'],
        ['rep.col.lent', 'money'], ['rep.col.repaid', 'money'], ['rep.col.closing', 'money'], ['rep.col.interest', 'money']],
      rows.map((l) => [l.number, l.name, t(DIRECTIONS[l.direction]), l.rate, d(l.opened), l.before, l.lent, l.repaid, l.closing, l.interest]),
    )],
  };
}

// Who owes the business on a date: people with dues, staff advances, and
// shareholders (their advances, loans, interest and the cash they hold).
function dues(db, { date }) {
  const entries = db.all('Transactions').filter((e) => counts(e) && e.date <= date);
  const rows = [];
  for (const c of db.all('Due_Contacts')) rows.push([c.name, t('rep.group.due'), r2(entries.reduce((acc, e) => acc + dueEffect(e, c.id), c.opening_due || 0))]);
  for (const p of db.all('Staff')) {
    const opening = (db.all('Pay_Openings').find((o) => o.staff_id === p.id) || { advance: 0 }).advance || 0;
    rows.push([p.name, t('rep.group.staff'), r2(entries.filter((e) => e.party_id === p.id).reduce((acc, e) => acc + payEffect(e).advance, opening))]);
  }
  for (const x of statements(db, date)) rows.push([x.name, t('rep.group.shareholder'), x.owes_business]);
  const owing = rows.filter((x) => Math.abs(x[2]) > 0.005);
  return {
    title: 'rep.title.dues',
    sub: [t('rep.as_of', { date: d(date) })],
    blocks: [
      table([['rep.col.name'], ['rep.col.group'], ['rep.col.owes', 'money']], owing, [t('rep.col.total'), '', sum(owing, (x) => x[2])]),
      note(t('rep.dues_note')),
    ],
  };
}

// ---- All money in and out ---------------------------------------------------------------

// Every movement of money in the range, account by account (a transfer is
// out of one and into the other; dues and deductions move none). Entries
// still waiting for a shareholder are counted and marked.
function allMoney(db, { from, to }) {
  const names = lookups(db);
  const accounts = db.all('Money_Accounts');
  const lines = [];
  for (const e of db.all('Transactions').filter((x) => counts(x) && x.date >= from && x.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const area = e.kind === 'daily_shift' ? 'sales' : e.kind === 'expense' ? (names.get(e.category_id) || {}).area || 'shared' : 'other';
    for (const a of accounts) {
      const amount = cashEffect(e, a.id);
      if (amount) lines.push({ date: e.date, kind: e.kind, account: a.name, detail: detailOf(e, names), area, in: amount > 0 ? amount : 0, out: amount < 0 ? -amount : 0, waiting: e.approval === 'waiting' });
    }
  }
  const by = (key, label) => {
    const groups = new Map();
    for (const l of lines) {
      const g = groups.get(l[key]) || { in: 0, out: 0 };
      g.in += l.in;
      g.out += l.out;
      groups.set(l[key], g);
    }
    return table([[label], ['rep.col.in', 'money'], ['rep.col.out', 'money'], ['rep.col.net', 'money']],
      [...groups.entries()].map(([k, g]) => [key === 'kind' ? t(KINDS[k].label) : key === 'area' ? t(AREAS[k]) : k, r2(g.in), r2(g.out), r2(g.in - g.out)]));
  };
  const totalIn = sum(lines, (l) => l.in);
  const totalOut = sum(lines, (l) => l.out);
  const waiting = lines.filter((l) => l.waiting);
  return {
    title: 'rep.title.all_money',
    sub: [rangeText(from, to), ...(waiting.length ? [t('rep.waiting_marked', { count: waiting.length })] : [])],
    blocks: [
      kv([['rep.money_in', totalIn], ['rep.money_out', -totalOut], ['rep.col.net', r2(totalIn - totalOut), true],
        waiting.length && ['rep.waiting_in', sum(waiting, (l) => l.in)], waiting.length && ['rep.waiting_out', -sum(waiting, (l) => l.out)]]),
      section('rep.by_account'), by('account', 'rep.col.account'),
      section('rep.by_kind'), by('kind', 'rep.col.kind'),
      section('rep.by_area'), by('area', 'rep.col.area'),
      section('rep.every_movement'),
      table([['rep.col.date'], ['rep.col.kind'], ['rep.col.account'], ['rep.col.detail'], ['rep.col.in', 'money'], ['rep.col.out', 'money'], ['rep.col.state']],
        lines.map((l) => [d(l.date), t(KINDS[l.kind].label), l.account, l.detail, l.in, l.out, l.waiting ? t('money.state.waiting') : '']),
        [t('rep.col.total'), '', '', '', totalIn, totalOut, '']),
      note(t('rep.all_money_note')),
    ],
  };
}

const BUILD = { daily, monthly, shareholders, salary, loans, dues, all_money: allMoney };

// What each report is asked for; left out, a sensible default.
function inputs(db, report, input) {
  const today = dhakaDate(db.now.getTime());
  const kind = REPORTS[report].input;
  if (kind === 'date') return { date: input.date || today };
  if (kind === 'month') {
    if (input.month) return { month: input.month };
    // The last accounting month that has ended.
    const startDay = setting(db, 'accounting.month_start_day');
    return { month: periodKey(addDays(periodOf(periodKey(today, startDay), startDay).from, -1), startDay) };
  }
  const to = input.to || today;
  const from = input.from || `${to.slice(0, 7)}-01`;
  if (from > to) throw new AppError('VALIDATION', {}, { to: { code: 'val.date_order', params: {} } });
  return { from, to };
}

function get(ctx, input) {
  const spec = REPORTS[input.report];
  if (!ctx.can(spec.perm)) throw new AppError('FORBIDDEN');
  const asked = inputs(ctx.db, input.report, input);
  const model = BUILD[input.report](ctx.db, asked);
  return { report: input.report, input: asked, model: { ...model, title: label(model.title) } };
}

export const REPORT_HANDLERS = {
  'reports.get': get,
};
