// Full stock-take: start one (all titles, or one publisher's), enter counts
// over several sittings, then apply. Each counted title whose count differs
// from the stock gets a stock change ("count") naming the stock-take.
// Titles not counted are left as they are. One stock-take is open at a time.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { nextNumber } from '../store/db.js';
import { dhakaDate } from './requisitions.js';

const fieldError = (fields) => new AppError('VALIDATION', {}, fields);

function openTake(db) {
  return db.all('Stock_Takes').find((s) => s.status === 'open') || null;
}

function onHand(db) {
  const map = new Map();
  for (const m of db.all('Stock_Movements')) if (m.status === 'active') map.set(m.book_id, (map.get(m.book_id) || 0) + m.qty);
  return map;
}

function current(ctx) {
  const { db } = ctx;
  const take = openTake(db);
  const recent = db.all('Stock_Takes').filter((s) => s.status === 'applied')
    .sort((a, b) => (a.applied_at < b.applied_at ? 1 : -1)).slice(0, 5)
    .map((s) => ({ id: s.id, number: s.number, date: s.date, result: s.result }));
  if (!take) return { take: null, recent };
  const stock = onHand(db);
  const pubs = new Map(db.all('Suppliers').map((s) => [s.id, s.name]));
  const lines = db.all('Books')
    .filter((b) => b.status === 'active' && (!take.publisher_id || b.publisher_id === take.publisher_id))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((b) => ({ book_id: b.id, title: b.title, author: b.author, publisher: pubs.get(b.publisher_id) || '', expected: stock.get(b.id) || 0, counted: take.counts[b.id] ?? null }));
  return { take: { id: take.id, number: take.number, date: take.date, publisher: pubs.get(take.publisher_id) || '', lines }, recent };
}

function start(ctx, { publisher_id: publisherId }) {
  const { db } = ctx;
  const open = openTake(db);
  if (open) throw fieldError({ publisher_id: { code: 'val.stocktake_open', params: { number: open.number } } });
  if (publisherId && !db.get('Suppliers', publisherId)) throw fieldError({ publisher_id: { code: 'val.not_found', params: {} } });
  const row = db.insert('Stock_Takes', {
    number: nextNumber(db.all('Stock_Takes'), 'ST'), date: dhakaDate(db.now), publisher_id: publisherId || '', status: 'open',
    counts: {}, started_by: ctx.user.id, applied_by: '', applied_at: '', result: null, cancel_reason: '',
  });
  return saved(row.id);
}

function openById(db, id) {
  const take = db.get('Stock_Takes', id);
  if (!take) throw new AppError('NOT_FOUND');
  if (take.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  return take;
}

function saveCounts(ctx, { id, counts }) {
  const { db } = ctx;
  const take = openById(db, id);
  const next = { ...take.counts };
  for (const c of counts) {
    if (c.counted === null) delete next[c.book_id];
    else next[c.book_id] = c.counted;
  }
  db.update('Stock_Takes', take, { counts: next });
  return saved(take.id, { counted: Object.keys(next).length });
}

function apply(ctx, { id }) {
  const { db } = ctx;
  const take = openById(db, id);
  const stock = onHand(db);
  const result = { counted: 0, changed: 0, more: 0, fewer: 0 };
  db.setReason(take.number);
  for (const [bookId, counted] of Object.entries(take.counts)) {
    result.counted++;
    const diff = counted - (stock.get(bookId) || 0);
    if (!diff) continue;
    result.changed++;
    if (diff > 0) result.more += diff;
    else result.fewer -= diff;
    db.insert('Stock_Movements', {
      date: take.date, book_id: bookId, kind: 'count', qty: diff, unit_cost: 0, sale_amount: 0, ref_type: 'stocktake', ref_id: take.id,
      reason: take.number, status: 'active', cancel_reason: '', cancelled_by: '', cancelled_at: '', entered_by: ctx.user.id,
    });
  }
  db.update('Stock_Takes', take, { status: 'applied', applied_by: ctx.user.id, applied_at: db.nowIso, result });
  return saved(take.id, result);
}

function cancel(ctx, { id, reason }) {
  const { db } = ctx;
  const take = openById(db, id);
  db.setReason(reason);
  db.update('Stock_Takes', take, { status: 'cancelled', cancel_reason: reason });
  return saved(take.id);
}

export const STOCKTAKE_HANDLERS = {
  'books.stocktake': current,
  'books.stocktake.start': start,
  'books.stocktake.save': saveCounts,
  'books.stocktake.apply': apply,
  'books.stocktake.cancel': cancel,
};
