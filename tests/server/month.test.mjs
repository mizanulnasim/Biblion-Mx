// Month closing and shareholders on the real server bundle: the month's
// profit as v1 works it out, loss carried, shares, loan interest, locking.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop, setSettings } from './shop.mjs';

const DAY = 86400000;
const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const lastMonth = () => {
  const d = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

function books() {
  const s = shop();
  // Calendar months, records from 200 days ago; no food allowance.
  setSettings(s, 'payroll', { 'payroll.unpaid_divisor': 'period_days', 'food.unpaid_rule': 'every_day', 'food.rates': [{ from: '2000-01-01', amount: 0 }], 'accounting.month_start_day': 1 });
  s.call(s.owner, 'start.date.save', { start_date: plus(today(), -200) });
  s.ids.cat = s.call(s.owner, 'setup.category.save', { name: 'Hall hire costs', area: 'shared', status: 'active' }).data.record_id;
  s.ids.nadia = s.call(s.owner, 'setup.shareholder.save', { name: 'Nadia', status: 'active', salary: 5000 }).data.record_id;
  return s;
}

const save = (s, fields) => s.call(s.owner, 'money.save', { account_id: s.ids.cash, ...fields }).data;

test('the month\'s profit: sales and income less costs, salaries, owner salaries; split by shares', () => {
  const s = books();
  const month = lastMonth();
  const day = `${month}-05`;
  save(s, { kind: 'income', date: day, amount: 20000, note: 'Event hall hire' });
  save(s, { kind: 'expense', date: day, amount: 6000, category_id: s.ids.cat });
  const view = s.call(s.owner, 'month.view', { month }).data;
  // 20,000 − 6,000 − owner salaries (Karim has none, Nadia 5,000).
  assert.equal(view.figures.profit, 9000);
  assert.equal(view.figures.categories[0].amount, 6000);
  assert.equal(s.call(s.manager, 'month.view', { month }).error.code, 'FORBIDDEN');
  // Shares must add up to 100.
  assert.equal(s.call(s.owner, 'shareholders.shares.save', { from: `${month}-01`, shares: [{ shareholder_id: s.ids.karim, percent: 60 }] }).data.error.fields.shares.code, 'val.shares_total');
  s.call(s.owner, 'shareholders.shares.save', { from: `${month}-01`, shares: [{ shareholder_id: s.ids.karim, percent: 60 }, { shareholder_id: s.ids.nadia, percent: 40 }] });
  assert.deepEqual(s.call(s.owner, 'month.view', { month }).data.figures.shares.map((x) => x.amount), [5400, 3600]);
});

test('closing: the days must be closed; then figures are kept, entries locked, and statements owe the shares', () => {
  const s = books();
  const month = lastMonth();
  s.call(s.owner, 'shareholders.shares.save', { from: '2000-01-01', shares: [{ shareholder_id: s.ids.karim, percent: 50 }, { shareholder_id: s.ids.nadia, percent: 50 }] });
  save(s, { kind: 'income', date: `${month}-03`, amount: 15000 });
  assert.equal(s.call(s.owner, 'month.close', { month }).data.error.code, 'MONTH_NOT_READY');
  // Records start on the 1st of the month; nothing else to close before it.
  s.call(s.owner, 'start.date.save', { start_date: plus(today(), 1) });
  const closed = s.call(s.owner, 'month.close', { month }).data;
  assert.equal(closed.data.profit, 10000);
  // Locked: a manager can't add to it, and the shares can't reach back.
  assert.equal(save(s, { kind: 'income', date: `${month}-04`, amount: 1 }).status, 'rejected');
  assert.equal(s.call(s.owner, 'shareholders.shares.save', { from: `${month}-15`, shares: [{ shareholder_id: s.ids.karim, percent: 100 }] }).data.error.fields.from.code, 'val.month_closed');
  const nadia = s.call(s.owner, 'shareholders.view').data.statements.find((x) => x.name === 'Nadia');
  assert.deepEqual([nadia.salary, nadia.profit, nadia.owed_to_them], [5000, 5000, 10000]);
  // Overdue days after the month ends (0 here: the month has ended), less what was paid.
  setSettings(s, 'payroll', { 'payroll.overdue_days': 0 });
  const overdue = () => s.call(s.owner, 'shareholders.view').data.statements.find((x) => x.name === 'Nadia').profit_overdue;
  assert.equal(overdue(), 5000);
  save(s, { kind: 'profit_share', date: today(), amount: 3000, party_id: s.ids.nadia });
  assert.equal(overdue(), 2000);
  // Home shows everyone's: Karim's 5,000 and Nadia's 2,000.
  assert.equal(s.call(s.owner, 'people.waiting').data.profit_overdue, 7000);
  assert.equal(s.call(s.manager, 'people.waiting').data.profit_overdue, 0);
  // Reopened with a reason, the figures follow the entries again.
  assert.equal(s.call(s.owner, 'month.reopen', { month, reason: 'Missed a bill' }).data.status, 'saved');
  assert.equal(s.call(s.owner, 'month.view', { month }).data.closed, false);
});

test('a loss is made up from later profit before anything is shared', () => {
  const s = books();
  s.call(s.owner, 'shareholders.shares.save', { from: '2000-01-01', shares: [{ shareholder_id: s.ids.karim, percent: 50 }, { shareholder_id: s.ids.nadia, percent: 50 }] });
  s.call(s.owner, 'start.date.save', { start_date: plus(today(), 1) });
  const month = lastMonth();
  const before = (() => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  // The month before: only Nadia's salary, a 5,000 loss.
  assert.equal(s.call(s.owner, 'month.close', { month: before }).data.data.profit, -5000);
  save(s, { kind: 'income', date: `${month}-03`, amount: 12000 });
  const next = s.call(s.owner, 'month.view', { month }).data.figures;
  assert.deepEqual([next.profit, next.loss_before, next.shareable, next.loss_after], [7000, 5000, 2000, 0]);
});

test('loan interest: day by day on the balance, at the loan\'s yearly rate', () => {
  const s = books();
  const month = lastMonth();
  const loan = s.call(s.owner, 'shareholders.loan.save', { shareholder_id: s.ids.nadia, direction: 'given', rate: 36.5, opened: `${month}-01`, status: 'open' }).data.record_id;
  // Nadia lends 10,000 on the 1st: 10,000 × 36.5% ÷ 365 = 10 a day.
  save(s, { kind: 'loan_from_shareholder', date: `${month}-01`, amount: 10000, party_id: s.ids.nadia, loan_id: loan });
  const f = s.call(s.owner, 'month.view', { month }).data.figures;
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  assert.equal(f.interest_owed, days * 10);
  assert.equal(s.call(s.owner, 'shareholders.view').data.loans[0].number, 'L001');
});

test('profit by area: each area\'s own sales and costs, the rest shared, adding up to the profit', () => {
  const s = books();
  const month = lastMonth();
  const day = `${month}-05`;
  const cafeVendor = s.call(s.owner, 'setup.supplier.save', { kind: 'vendor', name: 'Milk Vita', area: 'cafe', status: 'active' }).data.record_id;
  save(s, { kind: 'expense', date: day, amount: 700, category_id: s.ids.milk });
  save(s, { kind: 'expense', date: day, amount: 6000, category_id: s.ids.cat });
  save(s, { kind: 'vendor_purchase_paid', date: day, amount: 1200, party_id: cafeVendor });
  save(s, { kind: 'income', date: day, amount: 2000, note: 'Hall hire' });
  const f = s.call(s.owner, 'month.view', { month }).data.figures;
  // Café: Milk 700 and Milk Vita 1,200 of its own; Hall hire costs are shared.
  assert.deepEqual(f.areas.cafe, { sales: 0, costs: 1900, profit: -1900 });
  assert.equal(f.areas.shared.income, 2000);
  // Shared costs: 6,000 and Nadia's owner salary of 5,000.
  assert.equal(f.areas.shared.costs, 11000);
  assert.equal(Math.round(f.areas.books.profit + f.areas.cafe.profit + f.areas.shared.income - f.areas.shared.costs), f.profit);
});

test('closing keeps the month\'s reports as PDF and Excel, listed on the closing and emailed to shareholders with an address', () => {
  const s = books();
  const month = lastMonth();
  s.call(s.owner, 'shareholders.shares.save', { from: '2000-01-01', shares: [{ shareholder_id: s.ids.karim, percent: 100 }] });
  s.call(s.owner, 'start.date.save', { start_date: plus(today(), 1) });
  s.call(s.owner, 'me.notify', { email: 'owner@example.com', daily: false });
  setSettings(s, 'shop', { 'shop.address': 'House 1, Sample Road' });
  s.call(s.owner, 'month.close', { month });
  const { files } = s.call(s.owner, 'month.view', { month }).data;
  assert.deepEqual(files.map((f) => f.name), [
    `Monthly report ${month}.pdf`, `Monthly report ${month}.xlsx`, `Shareholders' monthly report ${month}.pdf`,
    `Shareholders' monthly report ${month}.xlsx`, `Monthly salary report ${month}.pdf`, `Monthly salary report ${month}.xlsx`,
  ]);
  // The PDF is the report on the letterhead, with the tokens' colours put in.
  const pdf = Buffer.from(s.call(s.owner, 'files.get', { id: files[0].id }).data.data, 'base64').toString('utf8');
  assert.match(pdf, /House 1, Sample Road/);
  assert.match(pdf, /Profit for the month/);
  assert.doesNotMatch(pdf, /var\(--/);
  // Emailed with all six attached (the daily email being off doesn't matter).
  const mail = s.state.mails.find((m) => m.subject.includes('closed'));
  assert.equal(mail.to, 'owner@example.com');
  assert.equal(mail.attachments.length, 6);
});
