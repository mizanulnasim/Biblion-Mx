// Pay worked out the same way everywhere: a month's payslip, and food
// allowance earned. Amounts are whole taka.
//
// Payslip for one person and month:
//   divisor        days in the month ('period_days') or 30 ('fixed_30')
//   employed days  the month's days from joining to leaving
//   base           the salary for a whole month employed; otherwise
//                  salary ÷ divisor × employed days
//   unpaid cut     salary ÷ divisor × (unpaid leave days + absent days a
//                  shareholder chose to cut)
//   net            base − unpaid cut, never below zero
// Payments, deductions and bonuses are not on the payslip's net: they move
// the person's pay account (shared/money/kinds.js, payEffect).

import { datesBetween } from './plan.js';

const daysInMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// The month's dates the person was employed.
export function employedDates(month, joinedOn, leftOn) {
  return datesBetween(`${month}-01`, `${month}-${String(daysInMonth(month)).padStart(2, '0')}`)
    .filter((d) => d >= joinedOn && (!leftOn || d <= leftOn));
}

export function payslipFigures({ month, salary, employed_days: employed, divisor_rule: rule, unpaid_leave_days: leaveDays, unpaid_absent_days: absentDays }) {
  const monthDays = daysInMonth(month);
  const divisor = rule === 'fixed_30' ? 30 : monthDays;
  const base = employed >= monthDays ? salary : Math.round((salary * employed) / divisor);
  const cut = Math.round((salary * (leaveDays + absentDays)) / divisor);
  return { month_days: monthDays, divisor, employed_days: employed, base, unpaid_cut: Math.min(cut, base), net: Math.max(0, base - cut) };
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
