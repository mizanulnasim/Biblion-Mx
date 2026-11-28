// Customers' special orders. Anyone with books.order (staff too) can take
// one; following them up shows names and phones, so it needs books.orders.
// An order joins the publisher's next requisition and is marked arrived
// when a delivery brings its title; the customer is then told (by WhatsApp,
// on the phone) and collects it, or it is cancelled with a reason.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { nextNumber } from '../store/db.js';
import { page } from '../kernel/paging.js';
import { dhakaDate } from './requisitions.js';

const fieldError = (fields) => new AppError('VALIDATION', {}, fields);
const FILTERS = {
  open: (o) => o.status === 'open' || o.status === 'requested',
  arrived: (o) => o.status === 'arrived' || o.status === 'told',
  done: (o) => o.status === 'collected' || o.status === 'cancelled',
};

function save(ctx, input) {
  const { db } = ctx;
  const book = input.book_id ? db.get('Books', input.book_id) : null;
  const fields = {};
  if (input.book_id && !book) fields.book_id = { code: 'val.not_found', params: {} };
  if (!book && !input.title) fields.title = { code: 'val.required', params: {} };
  const publisherId = book ? book.publisher_id : input.publisher_id;
  const publisher = publisherId ? db.get('Suppliers', publisherId) : null;
  if (!book && (!publisher || publisher.kind !== 'publisher')) fields.publisher_id = { code: 'val.required', params: {} };
  if (Object.keys(fields).length) throw fieldError(fields);
  const row = db.insert('Special_Orders', {
    number: nextNumber(db.all('Special_Orders'), 'SO'), date: dhakaDate(db.now), customer_name: input.customer_name,
    phone: input.phone.replace(/[^\d+]/g, ''), book_id: book ? book.id : '', title: book ? book.title : input.title,
    publisher_id: publisherId, qty: input.qty, advance: input.advance || 0, note: input.note || '',
    status: 'open', requisition_id: '', arrived_at: '', told_at: '', told_by: '', collected_at: '', cancel_reason: '', taken_by: ctx.user.id,
  });
  return saved(row.id, { number: row.number });
}

function list(ctx, query) {
  const { db } = ctx;
  const pubs = new Map(db.all('Suppliers').map((s) => [s.id, s.name]));
  const reqs = new Map(db.all('Requisitions').map((r) => [r.id, r.number]));
  let rows = db.all('Special_Orders');
  if (query.status) rows = rows.filter(FILTERS[query.status]);
  const items = rows.map((o) => ({
    id: o.id, number: o.number, date: o.date, customer_name: o.customer_name, phone: o.phone, title: o.title, qty: o.qty,
    advance: o.advance, note: o.note, status: o.status, publisher: pubs.get(o.publisher_id) || '', requisition: reqs.get(o.requisition_id) || '',
    arrived_at: o.arrived_at, told_at: o.told_at, cancel_reason: o.cancel_reason, _row: o._row, created_at: o.created_at,
  }));
  const result = page(items, query, (o) => `${o.number} ${o.customer_name} ${o.phone} ${o.title} ${o.publisher}`);
  return { ...result, items: result.items.map(({ _row, ...o }) => o) };
}

const NEXT = { told: ['arrived'], collected: ['arrived', 'told'], cancel: ['open', 'requested', 'arrived', 'told'] };

function act(ctx, { id, act: action, reason }) {
  const { db } = ctx;
  const o = db.get('Special_Orders', id);
  if (!o) throw new AppError('NOT_FOUND');
  if (!NEXT[action].includes(o.status)) throw new AppError('CONFLICT', { by: '' });
  if (action === 'cancel' && !reason) throw fieldError({ reason: { code: 'val.required', params: {} } });
  if (action === 'told') db.update('Special_Orders', o, { status: 'told', told_at: db.nowIso, told_by: ctx.user.id });
  if (action === 'collected') db.update('Special_Orders', o, { status: 'collected', collected_at: db.nowIso });
  if (action === 'cancel') {
    db.setReason(reason);
    db.update('Special_Orders', o, { status: 'cancelled', cancel_reason: reason });
  }
  return saved(o.id);
}

// Marks waiting orders for a title arrived, oldest first, up to `copies`.
// An order typed as a free title is matched by name and linked to the book.
export function ordersArrived(db, book, copies) {
  let left = copies;
  const waiting = db.all('Special_Orders')
    .filter((o) => (o.status === 'open' || o.status === 'requested')
      && (o.book_id === book.id || (!o.book_id && o.title.toLowerCase() === book.title.toLowerCase())))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (const o of waiting) {
    if (left < o.qty) break;
    left -= o.qty;
    db.update('Special_Orders', o, { status: 'arrived', arrived_at: db.nowIso, book_id: book.id });
  }
}

export const SPECIAL_ORDER_HANDLERS = {
  'books.order.save': save,
  'books.orders': list,
  'books.order.act': act,
};
