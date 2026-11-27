// The printable reports (shared/reports/reports.js), each built as one model
// the screen, print and Excel all show:
//   {title, sub: [text], blocks: [block]}
// A block is a section heading {kind: 'section', title}, a list of figures
// {kind: 'kv', rows: [{label, value, total}]}, a table {kind: 'table',
// columns: [{label, type}], rows: [[cell]], total: [cell]}, a note
// {kind: 'note', text}, or signature lines {kind: 'sign', labels}.
// A text is a plain string, {s: plain string}, {t: message id, p: params}
// or {d: date}; a cell is a text or a number (money unless its column says
// 'percent'), and {n: a count} is a number that isn't money. Titles, headings and labels are given here as message ids,
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
import { loanRegister, salaried, statements, withShares } from './month.js';
import { salaryReport, staffPayFigures } from './payroll.js';
import { bookCosts, supplierLines } from './suppliers.js';
import { planner } from './rota.js';

const r2 = (n) => Math.round(n * 100) / 100;
const counts = (e) => e.status === 'active';
const t = (id, p = {}) => ({ t: id, p });
const n = (count) => ({ n: count });
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

// ---- Books, publishers and vendors ---------------------------------------------------------

const LINE_KINDS = { book_receive: 'suppliers.line.receive', book_returned: 'suppliers.line.returned', book_sale: 'suppliers.line.sale' };
const kindText = (kind) => t(LINE_KINDS[kind] || KINDS[kind].label);
const suppliersOf = (db, kind) => db.all('Suppliers').filter((x) => x.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
// What was owed a supplier at the end of a date.
const owedOn = (supplier, lines, date) => r2((supplier.opening_due || 0) + sum(lines.filter((l) => l.date <= date), (l) => l.amount));
const between = (lines, from, to) => lines.filter((l) => l.date >= from && l.date <= to);

function booksMonthly(db, { month }) {
  const per = period(db, month);
  const costs = bookCosts(db);
  const books = new Map(db.all('Books').map((b) => [b.id, b]));
  const moves = db.all('Stock_Movements').filter((m) => m.status === 'active' && m.date >= per.from && m.date <= per.to);
  const sold = moves.filter((m) => m.kind === 'sale');
  const lost = moves.filter((m) => m.kind === 'damaged' || m.kind === 'lost');
  const cost = (rows) => sum(rows, (m) => -m.qty * (costs.get(m.book_id) || 0));
  const sales = sum(sold, (m) => m.sale_amount);
  const writeoffs = sum(db.all('Transactions').filter((e) => counts(e) && e.kind === 'publisher_writeoff' && e.date >= per.from && e.date <= per.to), (e) => e.amount);
  const rows = suppliersOf(db, 'publisher').map((p) => {
    const lines = supplierLines(db, p.id);
    const inP = between(lines, per.from, per.to);
    const mine = sold.filter((m) => (books.get(m.book_id) || {}).publisher_id === p.id);
    return [p.name, owedOn(p, lines, addDays(per.from, -1)), n(sum(mine, (m) => -m.qty)), sum(inP.filter((l) => l.kind.startsWith('book_')), (l) => l.amount),
      sum(inP.filter((l) => !l.kind.startsWith('book_')), (l) => -l.amount), owedOn(p, lines, per.to), sum(mine, (m) => m.sale_amount), r2(sum(mine, (m) => m.sale_amount) - cost(mine))];
  }).filter((r) => r.slice(1).some((v) => (typeof v === 'number' ? v : v.n)));
  const col = (i) => sum(rows, (r) => (typeof r[i] === 'number' ? r[i] : r[i].n));
  return {
    title: 'rep.title.books_monthly',
    sub: [rangeText(per.from, per.to)],
    blocks: [
      section('rep.books_sales'),
      kv([['rep.copies_sold', n(sum(sold, (m) => -m.qty))], ['rep.book_sales', sales], ['rep.cost_sold', cost(sold)], ['rep.gross_profit', r2(sales - cost(sold)), true],
        ['rep.copies_lost', n(sum(lost, (m) => -m.qty))], ['rep.cost_lost', cost(lost)], ['rep.writeoffs', writeoffs]]),
      section('rep.by_publisher'),
      table([['rep.col.publisher'], ['rep.col.before', 'money'], ['rep.col.copies', 'count'], ['rep.col.due_added', 'money'], ['rep.col.paid', 'money'], ['rep.col.after', 'money'],
        ['rep.col.sales', 'money'], ['rep.col.gross_profit', 'money']], rows,
      rows.length ? [t('rep.col.total'), col(1), n(col(2)), col(3), col(4), col(5), col(6), col(7)] : null),
      note(t('rep.books_note')),
    ],
  };
}

// A publisher's statement for a range: books that added to what is owed,
// title by title, and money paid, refunded or written off.
function publisherStatement(db, { party_id: id, from, to }) {
  const p = db.get('Suppliers', id);
  const lines = supplierLines(db, id);
  const inP = between(lines, from, to);
  const books = new Map();
  for (const l of inP.filter((x) => x.kind.startsWith('book_'))) {
    const key = `${l.book_id}|${l.kind}`;
    const row = books.get(key) || { title: l.book, kind: l.kind, qty: 0, amount: 0 };
    row.qty += l.qty;
    row.amount = r2(row.amount + l.amount);
    books.set(key, row);
  }
  const titles = [...books.values()].sort((a, b) => a.title.localeCompare(b.title));
  const money = inP.filter((x) => !x.kind.startsWith('book_'));
  const names = lookups(db);
  return {
    title: 'rep.title.publisher_statement',
    sub: [t('rep.to_party', { name: p.name }), rangeText(from, to)],
    blocks: [
      section('rep.books_in_period'),
      table([['rep.col.title'], ['rep.col.kind'], ['rep.col.copies', 'count'], ['rep.col.amount', 'money']], titles.map((x) => [x.title, kindText(x.kind), n(x.qty), x.amount]),
        titles.length ? [t('rep.col.total'), '', n(sum(titles, (x) => x.qty)), sum(titles, (x) => x.amount)] : null),
      section('rep.account'),
      kv([['rep.owed_start', owedOn(p, lines, addDays(from, -1))], ['rep.add_books', sum(titles, (x) => x.amount)],
        ['rep.less_paid', sum(money.filter((l) => l.amount < 0), (l) => l.amount)], ['rep.add_back', sum(money.filter((l) => l.amount > 0), (l) => l.amount)],
        ['rep.owed_end', owedOn(p, lines, to), true]]),
      section('rep.money_in_period'),
      table([['rep.col.date'], ['rep.col.kind'], ['rep.col.account'], ['rep.col.note'], ['rep.col.amount', 'money']],
        money.map((l) => [d(l.date), kindText(l.kind), (names.get(l.account_id) || {}).name || '', [l.ref, l.note].filter(Boolean).join(' · '), Math.abs(l.amount)])),
      sign('rep.sign_for_shop', 'rep.sign_publisher'),
    ],
  };
}

// Each publisher on a date: what is owed, the last payment and what the
// sales are paid up to.
function tracker(db, { date }) {
  const rows = suppliersOf(db, 'publisher').filter((p) => p.status === 'active').map((p) => {
    const lines = supplierLines(db, p.id).filter((l) => l.date <= date);
    const payments = lines.filter((l) => l.kind === 'publisher_payment');
    const last = payments.length ? payments[payments.length - 1].date : '';
    const settled = payments.map((l) => l.covers_up_to).filter(Boolean).sort().pop() || '';
    const days = last ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) / 86400000) : null;
    return [p.name, t(p.pays_on === 'delivery' ? 'rep.pays_delivery' : 'rep.pays_sale'), owedOn(p, lines, date), last ? d(last) : t('rep.never'), days === null ? '' : n(days), settled ? d(settled) : ''];
  });
  return {
    title: 'rep.title.tracker',
    sub: [t('rep.as_of', { date: d(date) })],
    blocks: [table([['rep.col.publisher'], ['rep.col.pays_on'], ['rep.col.owed', 'money'], ['rep.col.last_payment'], ['rep.col.days_since', 'count'], ['rep.col.settled_to']], rows)],
  };
}

// Each vendor over a range: owed before, bought on credit or paid on the
// spot, credit notes, paid, owed after, and the cost in the range.
function vendors(db, { from, to }) {
  const entries = db.all('Transactions').filter((e) => counts(e) && e.date >= from && e.date <= to);
  const rows = suppliersOf(db, 'vendor').map((v) => {
    const lines = supplierLines(db, v.id);
    const k = (kind) => sum(entries.filter((e) => e.party_id === v.id && e.kind === kind), (e) => e.amount);
    const credit = k('vendor_purchase_credit');
    const spot = k('vendor_purchase_paid');
    const notes = k('vendor_credit_note');
    return [v.name, owedOn(v, lines, addDays(from, -1)), credit, spot, notes, k('vendor_payment'), owedOn(v, lines, to), r2(credit + spot - notes)];
  }).filter((r) => r.slice(1).some(Boolean));
  const col = (i) => sum(rows, (r) => r[i]);
  return {
    title: 'rep.title.vendors',
    sub: [rangeText(from, to)],
    blocks: [table([['rep.col.vendor'], ['rep.col.before', 'money'], ['rep.col.on_credit', 'money'], ['rep.col.on_spot', 'money'], ['rep.col.credit_notes', 'money'],
      ['rep.col.paid', 'money'], ['rep.col.after', 'money'], ['rep.col.cost', 'money']], rows, rows.length ? [t('rep.col.total'), ...[1, 2, 3, 4, 5, 6, 7].map(col)] : null)],
  };
}

function vendorStatement(db, { party_id: id, from, to }) {
  const v = db.get('Suppliers', id);
  const names = lookups(db);
  const entries = db.all('Transactions').filter((e) => counts(e) && e.party_id === id && e.date >= from && e.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  const lines = supplierLines(db, id);
  const start = owedOn(v, lines, addDays(from, -1));
  let running = start;
  const rows = entries.map((e) => {
    running = r2(running + (lines.find((l) => l.id === e.id) || { amount: 0 }).amount);
    return [d(e.date), t(KINDS[e.kind].label), e.ref || '', e.note || '', (names.get(e.account_id) || {}).name || '', e.amount, running];
  });
  const k = (kind) => sum(entries.filter((e) => e.kind === kind), (e) => e.amount);
  return {
    title: 'rep.title.vendor_statement',
    sub: [t('rep.to_party', { name: v.name }), rangeText(from, to)],
    blocks: [
      table([['rep.col.date'], ['rep.col.kind'], ['rep.col.bill'], ['rep.col.note'], ['rep.col.account'], ['rep.col.amount', 'money'], ['rep.col.owed', 'money']],
        [['', t('rep.owed_start'), '', '', '', '', start], ...rows]),
      section('rep.account'),
      kv([['rep.owed_start', start], ['rep.on_credit', k('vendor_purchase_credit')], ['rep.credit_notes', -k('vendor_credit_note')], ['rep.less_paid', -k('vendor_payment')],
        ['rep.owed_end', owedOn(v, lines, to), true], ['rep.on_spot', k('vendor_purchase_paid')]]),
      sign('rep.sign_for_shop', 'rep.sign_vendor'),
    ],
  };
}

// What the shop owes, group by group: owed at the start + new − paid −
// other = owed at the end, each worked out on its own so a line that
// doesn't add up shows.
function payables(db, { from, to }) {
  const before = addDays(from, -1);
  const groups = [];
  const p = planner(db);
  // Shareholders' own staff records are in their group, as in the month's figures.
  groups.push(['rep.pay.staff', salaried(db).map((x) => {
    const f = staffPayFigures(db, x, from, to, p);
    return [x.name, f.start, f.earned, f.paid, f.other, f.end];
  })]);
  const startS = statements(db, before);
  groups.push(['rep.pay.shareholders', statements(db, to).map((x, i) => {
    const b = startS[i];
    return [x.name, b.owed_to_them, r2(x.salary + x.profit + x.interest_earned - b.salary - b.profit - b.interest_earned),
      r2(x.salary_paid + x.profit_paid + x.withdrawn - b.salary_paid - b.profit_paid - b.withdrawn), 0, x.owed_to_them];
  })]);
  for (const [kind, title, paidKind] of [['vendor', 'rep.pay.vendors', 'vendor_payment'], ['publisher', 'rep.pay.publishers', 'publisher_payment']]) {
    groups.push([title, suppliersOf(db, kind).map((x) => {
      const lines = supplierLines(db, x.id);
      const inP = between(lines, from, to);
      const paid = -sum(inP.filter((l) => l.kind === paidKind), (l) => l.amount);
      return [x.name, owedOn(x, lines, before), sum(inP.filter((l) => l.amount > 0), (l) => l.amount), paid,
        r2(-sum(inP.filter((l) => l.amount < 0), (l) => l.amount) - paid), owedOn(x, lines, to)];
    })]);
  }
  const off = [];
  const blocks = [note(t('rep.payables_note'))];
  for (const [title, all] of groups) {
    const rows = all.filter((r) => r.slice(1).some(Boolean));
    if (!rows.length) continue;
    for (const r of rows) if (Math.abs(r[1] + r[2] - r[3] - r[4] - r[5]) > 0.5) off.push(r[0]);
    const col = (i) => sum(rows, (r) => r[i]);
    blocks.push(section(title), table([['rep.col.name'], ['rep.col.before', 'money'], ['rep.col.new', 'money'], ['rep.col.paid', 'money'], ['rep.col.other', 'money'], ['rep.col.after', 'money']],
      rows, [t('rep.col.total'), ...[1, 2, 3, 4, 5].map(col)]));
  }
  blocks.push(note(off.length ? t('rep.payables_off', { names: off.join(', ') }) : t('rep.payables_ok')));
  return { title: 'rep.title.payables', sub: [rangeText(from, to)], blocks };
}

const BUILD = {
  daily, monthly, shareholders, salary, loans, dues, all_money: allMoney, books_monthly: booksMonthly, publisher_statement: publisherStatement,
  tracker, vendors, vendor_statement: vendorStatement, payables,
};

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
  if (kind === 'range') return { from, to };
  // A publisher's or vendor's: the one asked for, else the first.
  const party = PARTY[kind];
  const chosen = input.party_id ? db.get('Suppliers', input.party_id) : suppliersOf(db, party).find((x) => x.status === 'active');
  if (chosen && chosen.kind !== party) throw new AppError('NOT_FOUND');
  return { party_id: chosen ? chosen.id : '', from, to };
}

const PARTY = { publisher: 'publisher', vendor: 'vendor' };
const TITLES_EMPTY = { publisher: 'rep.title.publisher_statement', vendor: 'rep.title.vendor_statement' };

function get(ctx, input) {
  const spec = REPORTS[input.report];
  if (!ctx.can(spec.perm)) throw new AppError('FORBIDDEN');
  const asked = inputs(ctx.db, input.report, input);
  const party = PARTY[spec.input];
  // A statement with no publisher or vendor yet says so.
  const model = party && !asked.party_id ? { title: TITLES_EMPTY[party], sub: [], blocks: [note(t('rep.no_party'))] } : BUILD[input.report](ctx.db, asked);
  return {
    report: input.report, input: asked, model: { ...model, title: label(model.title) },
    choices: party ? suppliersOf(ctx.db, party).map((x) => ({ id: x.id, name: x.name })) : [],
  };
}

export const REPORT_HANDLERS = {
  'reports.get': get,
};
