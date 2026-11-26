// Requisitions to publishers. A draft suggests replacing what sold since the
// last requisition (or the last N days for a first one) and adds customers'
// open special orders. A manager edits it, sends it, and later deliveries
// are matched against it title by title. What is left can be closed with a
// reason. Drafts can also be made automatically each week or month.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { nextNumber } from '../store/db.js';
import { page } from '../kernel/paging.js';
import { setting } from '../kernel/settings.js';
import { getProp, setProp } from '../platform.js';

const DAY_MS = 86400000;
const fieldError = (fields) => new AppError('VALIDATION', {}, fields);

export function dhakaDate(now) {
  return new Date(now.getTime() + 6 * 3600000).toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// What is still expected on a line.
export function remaining(line) {
  return Math.max(0, line.qty - (line.received || 0) - (line.cancelled || 0));
}

function nextKey(lines) {
  return `L${lines.reduce((max, l) => Math.max(max, Number(l.key.slice(1)) || 0), 0) + 1}`;
}

// Builds a draft for one publisher; null when it would be empty and `skipEmpty`.
export function buildDraft(db, userId, publisherId, skipEmpty) {
  const today = dhakaDate(db.now);
  const reqs = db.all('Requisitions').filter((r) => r.publisher_id === publisherId);
  const last = reqs.filter((r) => r.status !== 'draft').map((r) => r.sales_to).sort().pop();
  const from = last ? addDays(last, 1) : addDays(today, -setting(db, 'books.req_days'));
  const books = db.all('Books').filter((b) => b.publisher_id === publisherId && b.status === 'active');
  const ids = new Set(books.map((b) => b.id));
  const sold = new Map();
  for (const m of db.all('Stock_Movements')) {
    if (m.status === 'active' && m.kind === 'sale' && ids.has(m.book_id) && m.date >= from && m.date <= today) {
      sold.set(m.book_id, (sold.get(m.book_id) || 0) - m.qty);
    }
  }
  const lines = [];
  for (const b of books) {
    if (sold.get(b.id)) lines.push({ key: nextKey([{ key: 'L0' }, ...lines]), book_id: b.id, title: b.title, qty: sold.get(b.id), received: 0, cancelled: 0, special_order_ids: [] });
  }
  const orders = db.all('Special_Orders').filter((o) => o.status === 'open' && o.publisher_id === publisherId);
  for (const o of orders) {
    let line = lines.find((l) => (o.book_id ? l.book_id === o.book_id : l.title.toLowerCase() === o.title.toLowerCase()));
    if (!line) {
      line = { key: nextKey([{ key: 'L0' }, ...lines]), book_id: o.book_id || '', title: o.title, qty: 0, received: 0, cancelled: 0, special_order_ids: [] };
      lines.push(line);
    }
    line.qty += o.qty;
    line.special_order_ids.push(o.id);
  }
  if (!lines.length && skipEmpty) return null;
  const row = db.insert('Requisitions', {
    number: nextNumber(db.all('Requisitions'), 'RQ'), publisher_id: publisherId, date: today, status: 'draft', lines,
    sales_from: from, sales_to: today, note: '', sent_at: '', sent_by: '', closed_reason: '', closed_by: '', entered_by: userId,
  });
  for (const o of orders) db.update('Special_Orders', o, { status: 'requested', requisition_id: row.id });
  return row;
}

function openDraft(db, publisherId) {
  return db.all('Requisitions').find((r) => r.publisher_id === publisherId && r.status === 'draft') || null;
}

function build(ctx, { publisher_id: publisherId }) {
  const { db } = ctx;
  const publisher = db.get('Suppliers', publisherId);
  if (!publisher || publisher.kind !== 'publisher') throw fieldError({ publisher_id: { code: 'val.not_found', params: {} } });
  const draft = openDraft(db, publisherId);
  if (draft) throw fieldError({ publisher_id: { code: 'val.draft_exists', params: { number: draft.number } } });
  return saved(buildDraft(db, ctx.user.id, publisherId, false).id);
}

function view(r, db) {
  const publisher = db.get('Suppliers', r.publisher_id);
  const users = new Map(db.all('Users').map((u) => [u.id, u.display_name]));
  return {
    id: r.id, version: r.version, number: r.number, date: r.date, status: r.status, publisher_id: r.publisher_id,
    publisher: publisher ? publisher.name : '', lines: r.lines.map((l) => ({ ...l, remaining: remaining(l) })),
    sales_from: r.sales_from, sales_to: r.sales_to, note: r.note, sent_at: r.sent_at, sent_by: users.get(r.sent_by) || '',
    closed_reason: r.closed_reason, closed_by: users.get(r.closed_by) || '', entered_by: users.get(r.entered_by) || '',
  };
}

function list(ctx, query) {
  const { db } = ctx;
  let rows = db.all('Requisitions');
  if (query.status) rows = rows.filter((r) => r.status === query.status);
  const items = rows.map((r) => {
    const v = view(r, db);
    return {
      ...v, lines: undefined, titles: r.lines.filter((l) => l.qty > 0).length,
      copies: r.lines.reduce((s, l) => s + l.qty, 0), received: r.lines.reduce((s, l) => s + (l.received || 0), 0),
      _row: r._row, created_at: r.created_at,
    };
  });
  const result = page(items, query, (r) => `${r.number} ${r.publisher} ${r.status} ${r.date}`, (r) => `${r.date}|${r.created_at}`);
  return { ...result, items: result.items.map(({ _row, created_at: _created, ...r }) => r) };
}

function get(ctx, { id }) {
  const r = ctx.db.get('Requisitions', id);
  if (!r) throw new AppError('NOT_FOUND');
  return view(r, ctx.db);
}

function saveDraft(ctx, input) {
  const { db } = ctx;
  const r = db.get('Requisitions', input.id);
  if (!r) throw new AppError('NOT_FOUND');
  if (r.status !== 'draft') throw new AppError('CONFLICT', { by: '' });
  const fields = {};
  const lines = [];
  input.lines.forEach((l, i) => {
    const old = l.key ? r.lines.find((x) => x.key === l.key) : null;
    const book = l.book_id ? db.get('Books', l.book_id) : null;
    if (l.book_id && !book) fields[`lines.${i}.book_id`] = { code: 'val.not_found', params: {} };
    if (!book && !l.title && !old) fields[`lines.${i}.title`] = { code: 'val.required', params: {} };
    lines.push({
      key: old ? old.key : nextKey([{ key: 'L0' }, ...r.lines, ...lines]),
      book_id: book ? book.id : old ? old.book_id : '',
      title: book ? book.title : l.title || (old ? old.title : ''),
      qty: l.qty, received: 0, cancelled: 0,
      special_order_ids: old ? old.special_order_ids : [],
    });
  });
  if (Object.keys(fields).length) throw fieldError(fields);
  // Special orders on a line taken out go back to waiting for the next requisition.
  const kept = new Set(lines.flatMap((l) => l.special_order_ids));
  for (const old of r.lines) {
    for (const id of old.special_order_ids) {
      const o = kept.has(id) ? null : db.get('Special_Orders', id);
      if (o && o.status === 'requested') db.update('Special_Orders', o, { status: 'open', requisition_id: '' });
    }
  }
  const row = db.update('Requisitions', r, { lines, note: input.note || '' }, input.version);
  return saved(row.id);
}

function send(ctx, { id }) {
  const { db } = ctx;
  const r = db.get('Requisitions', id);
  if (!r) throw new AppError('NOT_FOUND');
  if (r.status !== 'draft') throw new AppError('CONFLICT', { by: '' });
  const lines = r.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw fieldError({ lines: { code: 'val.no_lines', params: {} } });
  db.update('Requisitions', r, { lines, status: 'sent', sent_at: db.nowIso, sent_by: ctx.user.id });
  return saved(r.id);
}

function close(ctx, { id, reason }) {
  const { db } = ctx;
  const r = db.get('Requisitions', id);
  if (!r) throw new AppError('NOT_FOUND');
  if (r.status !== 'sent' && r.status !== 'part') throw new AppError('CONFLICT', { by: '' });
  db.setReason(reason);
  const lines = r.lines.map((l) => ({ ...l, cancelled: (l.cancelled || 0) + remaining(l) }));
  db.update('Requisitions', r, { lines, status: 'closed', closed_reason: reason, closed_by: ctx.user.id });
  // Special orders that won't come with it wait for the next requisition.
  for (const o of db.all('Special_Orders')) {
    if (o.requisition_id === r.id && o.status === 'requested') db.update('Special_Orders', o, { status: 'open', requisition_id: '' });
  }
  return saved(r.id);
}

// ---- Automatic drafts (run by the hourly job) --------------------------------

function periodKey(date, every) {
  if (every === 'monthly') return date.slice(0, 7);
  // The week starts on Saturday, as the shop's week does.
  const d = new Date(`${date}T00:00:00Z`);
  const saturday = new Date(d.getTime() - ((d.getUTCDay() + 1) % 7) * DAY_MS);
  return saturday.toISOString().slice(0, 10);
}

export function autoRequisitions(db) {
  const every = setting(db, 'books.req_auto');
  if (every === 'off') return 0;
  const key = `${every}:${periodKey(dhakaDate(db.now), every)}`;
  if (getProp('JOB_req_auto') === key) return 0;
  let made = 0;
  for (const p of db.all('Suppliers')) {
    if (p.kind !== 'publisher' || p.status !== 'active' || openDraft(db, p.id)) continue;
    if (buildDraft(db, 'SYSTEM', p.id, true)) made++;
  }
  setProp('JOB_req_auto', key);
  return made;
}

export const REQUISITION_HANDLERS = {
  'books.reqs': list,
  'books.req.get': get,
  'books.req.build': build,
  'books.req.save': saveDraft,
  'books.req.send': send,
  'books.req.close': close,
};
