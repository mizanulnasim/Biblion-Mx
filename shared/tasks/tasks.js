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

// What a task can open. A money entry opens the money screen with the kind
// chosen; the person still needs the permission to use it.
export const TASK_LINKS = Object.freeze({
  'money:expense': { path: '/money/new?kind=expense', perm: 'acc.entry', label: 'tasks.link.expense' },
  'money:vendor_payment': { path: '/money/new?kind=vendor_payment', perm: 'acc.entry', label: 'tasks.link.vendor_payment' },
  'money:vendor_purchase_credit': { path: '/money/new?kind=vendor_purchase_credit', perm: 'acc.entry', label: 'tasks.link.vendor_purchase' },
  'money:publisher_payment': { path: '/money/new?kind=publisher_payment', perm: 'acc.entry', label: 'tasks.link.publisher_payment' },
  'page:daily': { path: '/daily', perm: 'acc.daily', label: 'tasks.link.daily' },
  'page:cafe_count': { path: '/cafe/count', perm: 'cafe.count', label: 'tasks.link.cafe_count' },
  'page:cafe_orders': { path: '/cafe/orders', perm: 'cafe.view', label: 'tasks.link.cafe_orders' },
  'page:requisitions': { path: '/books/reqs', perm: 'books.requisition', label: 'tasks.link.requisitions' },
  'page:stocktake': { path: '/books/stocktake', perm: 'books.adjust', label: 'tasks.link.stocktake' },
  'page:closing': { path: '/closing', perm: 'closing.day', label: 'tasks.link.closing' },
});
