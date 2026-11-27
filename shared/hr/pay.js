// Pay worked out the same way everywhere: the accounting month, a person's
// salary on a date, a month's payslip, food allowance earned (by week), and
// the advance instalment due. Amounts are whole taka.
//
// The accounting month starts on a set day (Settings → Payroll; 1 is the
// calendar month). A month is named by the month it starts in: with the
// 11th, "2026-11" is 11 November to 10 December.
//
// Payslip for one person and month:
//   divisor        days in the period ('period_days') or 30 ('fixed_30')
//   employed days  the period's days from joining to leaving
//   base           the salary for a whole period employed (by the days of
//                  each salary when it changed in the period); otherwise
//                  the salary of each day employed ÷ divisor
//   unpaid cut     salary ÷ divisor × (unpaid leave days and absent days a
//                  shareholder chose to cut), at the period's last salary
//   overtime pay   overtime hours chosen × the person's hourly rate
//   net            base − unpaid cut (never below zero) + overtime pay
// Payments, deductions and bonuses are not on the payslip's net: they move
// the person's pay account (shared/money/kinds.js, payEffect).

import { addDays, datesBetween } from './plan.js';

const pad = (n) => String(n).padStart(2, '0');
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// The dates of accounting month `key` ("YYYY-MM") starting on `startDay`
// (a day the month doesn't have means its last day).
export function periodOf(key, startDay) {
  const [y, m] = key.split('-').map(Number);
  const from = `${key}-${pad(Math.min(startDay, daysInMonth(y, m)))}`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const to = addDays(`${ny}-${pad(nm)}-${pad(Math.min(startDay, daysInMonth(ny, nm)))}`, -1);
  return { key, from, to, days: datesBetween(from, to).length };
}

// The accounting month a date falls in.
export function periodKey(date, startDay) {
  const key = date.slice(0, 7);
  if (date >= periodOf(key, startDay).from) return key;
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

// The period's dates the person was employed.
export function employedDates(period, joinedOn, leftOn) {
  return datesBetween(period.from, period.to).filter((d) => d >= joinedOn && (!leftOn || d <= leftOn));
}

// A salary is made of parts [{name, amount}]; its total is what counts.
export const salaryTotal = (parts) => Math.round(parts.reduce((s, p) => s + p.amount, 0));

// The salary on a date: the latest change from on or before it
// ({from, total}); before the first change, the first one.
export function salaryOn(changes, date) {
  const sorted = changes.slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  let found = sorted[0] || null;
  for (const c of sorted) if (c.from <= date) found = c;
  return found ? found.total : 0;
}

// day_salaries: the salary on each employed day of the period, in order.
export function payslipFigures({ period_days: periodDays, day_salaries: daySalaries, divisor_rule: rule, unpaid_leave_days: leaveDays, unpaid_absent_days: absentDays, overtime_pay: overtime = 0 }) {
  const divisor = rule === 'fixed_30' ? 30 : periodDays;
  const salary = daySalaries.length ? daySalaries[daySalaries.length - 1] : 0;
  const sum = daySalaries.reduce((s, x) => s + x, 0);
  let base;
  if (daySalaries.length < periodDays) base = Math.round(sum / divisor);
  else base = daySalaries.every((x) => x === salary) ? salary : Math.round(sum / periodDays);
  const cut = Math.round((salary * (leaveDays + absentDays)) / divisor);
  return { salary, month_days: periodDays, divisor, employed_days: daySalaries.length, base, unpaid_cut: Math.min(cut, base), overtime_pay: overtime, net: Math.max(0, base - cut) + overtime };
}

// The allowance a day on `date`: the latest rate starting on or before it.
function rateOn(rates, date) {
  let amount = 0;
  for (const r of rates.slice().sort((a, b) => (a.from < b.from ? -1 : 1))) if (r.from <= date) amount = r.amount;
  return amount;
}

// Food allowance earned on the given dates.
export function foodEarned(rates, dates) {
  return Math.round(dates.reduce((sum, d) => sum + rateOn(rates, d), 0));
}

// The Saturday a week (Saturday to Friday) starts on.
function weekStart(date) {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((wd + 1) % 7));
}

// Food allowance earned, by week from Saturday, oldest first:
// [{from, to, earned}].
export function foodWeeks(rates, dates) {
  const weeks = new Map();
  for (const d of dates) {
    const from = weekStart(d);
    if (!weeks.has(from)) weeks.set(from, []);
    weeks.get(from).push(d);
  }
  return [...weeks.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([from, ds]) => ({ from, to: addDays(from, 6), earned: foodEarned(rates, ds) }));
}

// The deduction to suggest this month for advances repaid in instalments.
// advances: [{date, amount, instalment}] (instalment 0: all at once);
// repaid: what deductions have taken back so far, set against the oldest
// advances first.
export function instalmentDue(advances, repaid) {
  let left = repaid;
  let due = 0;
  for (const a of advances.slice().sort((x, y) => (x.date < y.date ? -1 : 1))) {
    const taken = Math.min(left, a.amount);
    left -= taken;
    const owing = a.amount - taken;
    if (owing > 0) due += a.instalment ? Math.min(a.instalment, owing) : owing;
  }
  return Math.round(due);
}
