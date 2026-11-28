// Full stock-take: start one (all titles, or one publisher's), enter counts
// over several sittings, then apply. Each counted title whose count differs
// from the stock gets a stock change ("count") naming the stock-take.
// Titles not counted are left as they are. One stock-take is open at a time.
//
// The opening stock (Getting started) is counted the same way, as of the
// start date. Instead of being applied it is sent for approval; a
// shareholder who didn't count or send it approves it (each counted title
// gets its copies, at the publisher's cost rule) or sends it back with a
// reason. It can be done once.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { nextNumber } from '../store/db.js';
import { dhakaDate } from './requisitions.js';
import { setting } from '../kernel/settings.js';
import { bookCosts } from './suppliers.js';

const fieldError = (fields) => new AppError('VALIDATION', {}, fields);

function openTake(db) {
  return db.all('Stock_Takes').find((s) => s.status === 'open' || s.status === 'waiting') || null;
}

// The opening stock once approved, or null.
export function openingStock(db) {
  return db.all('Stock_Takes').find((s) => s.opening && s.status === 'applied') || null;
}

function onHand(db) {
  const map = new Map();
  for (const m of db.all('Stock_Movements')) if (m.status === 'active') map.set(m.book_id, (map.get(m.book_id) || 0) + m.qty);
  return map;
}

function current(ctx) {
  const { db } = ctx;
  const take = openTake(db);
  const users = new Map(db.all('Users').map((u) => [u.id, u.display_name]));
  const startDate = setting(db, 'accounting.start_date');
  const opening = { start_date: startDate, done: Boolean(openingStock(db)) };
  const recent = db.all('Stock_Takes').filter((s) => s.status === 'applied')
    .sort((a, b) => (a.applied_at < b.applied_at ? 1 : -1)).slice(0, 5)
    .map((s) => ({ id: s.id, number: s.number, date: s.date, result: s.result }));
  if (!take) return { take: null, recent, opening };
  const stock = onHand(db);
  const pubs = new Map(db.all('Suppliers').map((s) => [s.id, s.name]));
  const lines = db.all('Books')
    .filter((b) => b.status === 'active' && (!take.publisher_id || b.publisher_id === take.publisher_id))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((b) => ({ book_id: b.id, title: b.title, author: b.author, publisher: pubs.get(b.publisher_id) || '', expected: stock.get(b.id) || 0, counted: take.counts[b.id] ?? null }));
  return {
    take: {
      id: take.id, number: take.number, date: take.date, publisher: pubs.get(take.publisher_id) || '', lines,
      opening: Boolean(take.opening), status: take.status, sent_by: users.get(take.sent_by) || '', sent_back_reason: take.sent_back_reason || '',
      can_decide: take.status === 'waiting' && ctx.can('acc.approve') && !counters(take).includes(ctx.user.id),
    },
    recent,
    opening,
  };
}

// Who counted or sent a stock-take: they can't approve it.
const counters = (take) => [take.started_by, take.sent_by].filter(Boolean);

// The opening stock-take, when it waits for this person's approval.
export function openingWaiting(ctx) {
  if (!ctx.can('acc.approve')) return null;
  const take = ctx.db.all('Stock_Takes').find((s) => s.opening && s.status === 'waiting');
  return take && !counters(take).includes(ctx.user.id) ? take : null;
}

function start(ctx, { publisher_id: publisherId, opening }) {
  const { db } = ctx;
  const open = openTake(db);
  if (open) throw fieldError({ publisher_id: { code: 'val.stocktake_open', params: { number: open.number } } });
  if (publisherId && !db.get('Suppliers', publisherId)) throw fieldError({ publisher_id: { code: 'val.not_found', params: {} } });
  const startDate = setting(db, 'accounting.start_date');
  if (opening && !startDate) throw fieldError({ opening: { code: 'val.start_date_first', params: {} } });
  if (opening && openingStock(db)) throw fieldError({ opening: { code: 'val.opening_done', params: {} } });
  const row = db.insert('Stock_Takes', {
    number: nextNumber(db.all('Stock_Takes'), 'ST'), date: opening ? startDate : dhakaDate(db.now), publisher_id: publisherId || '', status: 'open',
    counts: {}, started_by: ctx.user.id, applied_by: '', applied_at: '', result: null, cancel_reason: '',
    opening: Boolean(opening), sent_by: '', sent_back_reason: '',
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
  if (take.opening) {
    if (!Object.keys(take.counts).length) throw fieldError({ id: { code: 'val.no_lines', params: {} } });
    db.update('Stock_Takes', take, { status: 'waiting', sent_by: ctx.user.id, sent_back_reason: '' });
    return saved(take.id, { waiting: true, counted: Object.keys(take.counts).length });
  }
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

function decideOpening(ctx, { id, decision, reason }) {
  const { db } = ctx;
  const take = db.get('Stock_Takes', id);
  if (!take || !take.opening) throw new AppError('NOT_FOUND');
  if (take.status !== 'waiting') throw new AppError('CONFLICT', { by: '' });
  if (counters(take).includes(ctx.user.id)) throw new AppError('OWN_ENTRY');
  if (decision === 'send_back') {
    if (!reason) throw fieldError({ reason: { code: 'val.required', params: {} } });
    db.setReason(reason);
    db.update('Stock_Takes', take, { status: 'open', sent_back_reason: reason });
    return saved(take.id);
  }
  const costs = bookCosts(db);
  const result = { counted: 0, changed: 0, more: 0, fewer: 0 };
  db.setReason(take.number);
  for (const [bookId, counted] of Object.entries(take.counts)) {
    result.counted++;
    if (!counted) continue;
    result.changed++;
    result.more += counted;
    db.insert('Stock_Movements', {
      date: take.date, book_id: bookId, kind: 'opening', qty: counted, unit_cost: costs.get(bookId) || 0, sale_amount: 0, ref_type: 'stocktake', ref_id: take.id,
      reason: take.number, status: 'active', cancel_reason: '', cancelled_by: '', cancelled_at: '', entered_by: take.sent_by,
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
  'books.opening.decide': decideOpening,
};
