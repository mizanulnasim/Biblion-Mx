// Tasks: when a repeating task falls, and the screens a task can open.

// repeat: daily, weekly (on `days`, 0 Sunday … 6 Saturday) or monthly (on
// `day_of_month`; a day the month doesn't have means its last day).
export function occursOn(template, date) {
  if (date < template.start_date || (template.end_date && date > template.end_date)) return false;
  if (template.repeat === 'daily') return true;
  const d = new Date(`${date}T00:00:00Z`);
  if (template.repeat === 'weekly') return (template.days || []).includes(d.getUTCDay());
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() === Math.min(template.day_of_month, last);
}

// What a task can open, and the record it needs before it can be done (a
// row of `table`, dated from the day the task was made, that `counts`). A
// money entry opens the money screen with the kind chosen; the person
// still needs the permission to use it.
const entry = (kind) => ({ table: 'Transactions', counts: (r) => r.kind === kind && r.status === 'active' });
const notCancelled = (table) => ({ table, counts: (r) => r.status !== 'cancelled' });
export const TASK_LINKS = Object.freeze({
  'money:expense': { path: '/money/new?kind=expense', perm: 'acc.entry', label: 'tasks.link.expense', record: entry('expense') },
  'money:vendor_payment': { path: '/money/new?kind=vendor_payment', perm: 'acc.entry', label: 'tasks.link.vendor_payment', record: entry('vendor_payment') },
  'money:vendor_purchase_credit': { path: '/money/new?kind=vendor_purchase_credit', perm: 'acc.entry', label: 'tasks.link.vendor_purchase', record: entry('vendor_purchase_credit') },
  'money:publisher_payment': { path: '/money/new?kind=publisher_payment', perm: 'acc.entry', label: 'tasks.link.publisher_payment', record: entry('publisher_payment') },
  'page:daily': { path: '/daily', perm: 'acc.daily', label: 'tasks.link.daily', record: entry('daily_shift') },
  'page:cafe_count': { path: '/cafe/count', perm: 'cafe.count', label: 'tasks.link.cafe_count', record: { table: 'Cafe_Counts', counts: () => true } },
  'page:cafe_orders': { path: '/cafe/orders', perm: 'cafe.view', label: 'tasks.link.cafe_orders', record: notCancelled('Cafe_Orders') },
  'page:requisitions': { path: '/books/reqs', perm: 'books.requisition', label: 'tasks.link.requisitions', record: notCancelled('Requisitions') },
  'page:stocktake': { path: '/books/stocktake', perm: 'books.adjust', label: 'tasks.link.stocktake', record: notCancelled('Stock_Takes') },
  'page:closing': { path: '/closing', perm: 'closing.day', label: 'tasks.link.closing', record: { table: 'Day_Closings', counts: (r) => r.status === 'closed' } },
});

// The roles a task can be given to (anyone with that role may do it).
export const TASK_ROLES = Object.freeze(['manager', 'staff']);
