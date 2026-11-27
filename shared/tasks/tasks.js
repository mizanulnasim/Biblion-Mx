// Tasks: when a repeating task falls, and the screens a task can open.

import { REPORTS } from '../reports/reports.js';

const DAY_MS = 86400000;
const daysApart = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

// How a task repeats (counted from its start date):
//   daily; every_n_days (`every` days); weekly or fortnightly (on `days`, 0
//   Sunday … 6 Saturday; fortnightly in the start date's week and every
//   other week after); monthly (on `day_of_month`; a day the month doesn't
//   have means its last day) or every_n_months (the same, every `every`
//   months); monthly_last (the last day of each month); dates (on `dates`).
export const REPEATS = Object.freeze(['daily', 'every_n_days', 'weekly', 'fortnightly', 'monthly', 'every_n_months', 'monthly_last', 'dates']);

export function occursOn(template, date) {
  if (date < template.start_date || (template.end_date && date > template.end_date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const start = new Date(`${template.start_date}T00:00:00Z`);
  switch (template.repeat) {
    case 'daily': return true;
    case 'every_n_days': return daysApart(template.start_date, date) % template.every === 0;
    case 'weekly': return (template.days || []).includes(d.getUTCDay());
    case 'fortnightly': {
      const weekOf = (x) => Math.floor((Date.parse(`${x}T00:00:00Z`) / DAY_MS + 4) / 7);
      return (template.days || []).includes(d.getUTCDay()) && (weekOf(date) - weekOf(template.start_date)) % 2 === 0;
    }
    case 'monthly': return d.getUTCDate() === Math.min(template.day_of_month, last);
    case 'every_n_months': {
      const months = (d.getUTCFullYear() - start.getUTCFullYear()) * 12 + d.getUTCMonth() - start.getUTCMonth();
      return months % template.every === 0 && d.getUTCDate() === Math.min(template.day_of_month, last);
    }
    case 'monthly_last': return d.getUTCDate() === last;
    default: return (template.dates || []).includes(date);
  }
}

export const PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);

// What a task can open, and the record it is done with (a row of `table`,
// made after the task, that `counts`); receipt: the record needs its
// receipt or bill. A money entry opens the money screen with the kind
// chosen; the person still needs the permission to use it.
const PRINT_LABELS = {
  daily: 'rep.print.daily', monthly: 'rep.print.monthly', shareholders: 'rep.print.shareholders', salary: 'rep.print.salary',
  loans: 'rep.print.loans', dues: 'rep.print.dues', all_money: 'rep.print.all_money',
};
const entry = (kind) => ({ table: 'Transactions', counts: (r) => r.kind === kind && r.status === 'active' });
const notCancelled = (table) => ({ table, counts: (r) => r.status !== 'cancelled' });
export const TASK_LINKS = Object.freeze({
  'money:expense': { path: '/money/new?kind=expense', perm: 'acc.entry', label: 'tasks.link.expense', record: entry('expense'), receipt: true },
  'money:vendor_payment': { path: '/money/new?kind=vendor_payment', perm: 'acc.entry', label: 'tasks.link.vendor_payment', record: entry('vendor_payment'), receipt: true },
  'money:vendor_purchase_credit': { path: '/money/new?kind=vendor_purchase_credit', perm: 'acc.entry', label: 'tasks.link.vendor_purchase', record: entry('vendor_purchase_credit'), receipt: true },
  'money:publisher_payment': { path: '/money/new?kind=publisher_payment', perm: 'acc.entry', label: 'tasks.link.publisher_payment', record: entry('publisher_payment'), receipt: true },
  'page:daily': { path: '/daily', perm: 'acc.daily', label: 'tasks.link.daily', record: entry('daily_shift') },
  'page:cafe_count': { path: '/cafe/count', perm: 'cafe.count', label: 'tasks.link.cafe_count', record: { table: 'Cafe_Counts', counts: () => true } },
  'page:cafe_orders': { path: '/cafe/orders', perm: 'cafe.view', label: 'tasks.link.cafe_orders', record: notCancelled('Cafe_Orders') },
  'page:requisitions': { path: '/books/reqs', perm: 'books.requisition', label: 'tasks.link.requisitions', record: notCancelled('Requisitions') },
  'page:stocktake': { path: '/books/stocktake', perm: 'books.adjust', label: 'tasks.link.stocktake', record: notCancelled('Stock_Takes') },
  'page:closing': { path: '/closing', perm: 'closing.day', label: 'tasks.link.closing', record: { table: 'Day_Closings', counts: (r) => r.status === 'closed' } },
  'page:month_closing': { path: '/closing/month', perm: 'closing.month', label: 'tasks.link.month_closing', record: { table: 'Month_Closings', counts: (r) => r.status === 'closed' } },
  // Printing a report (owner decision: scheduled report printing): done once
  // it is printed or saved as PDF from the task.
  ...Object.fromEntries(Object.entries(PRINT_LABELS).map(([id, label]) => [`report:${id}`, {
    path: `/reports?report=${id}`, perm: REPORTS[id].perm, label, record: { table: 'Report_Prints', counts: (r) => r.report === id },
  }])),
});

// The roles a task can be given to (anyone with that role may do it).
export const TASK_ROLES = Object.freeze(['manager', 'staff']);
