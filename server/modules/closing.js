// Day closing: the checklist for a date, closing it, and reopening it with a
// reason. A closed day's money can then be changed only by a shareholder.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';

const RECENT_DAYS = 7;
const DAY_MS = 86400000;

function closingRow(db, date) {
  return db.all('Day_Closings').find((r) => r.date === date) || null;
}

export function isDayClosed(db, date) {
  const row = closingRow(db, date);
  return Boolean(row && row.status === 'closed');
}

function shiftOf(db, date) {
  return db.all('Transactions').find((e) => e.kind === 'daily_shift' && e.status === 'active' && e.date === date) || null;
}

// Each step: done, to do (blocks closing), or a warning (shown, doesn't block).
// Steps for deliveries and tasks join when those are built.
function steps(db, date) {
  const shift = shiftOf(db, date);
  const waiting = db.all('Transactions').filter((e) => e.status === 'active' && e.approval === 'waiting' && e.date === date).length;
  const shortOver = shift ? shift.details.short_over : 0;
  const counted = db.all('Cafe_Counts').some((c) => c.date === date);
  const cafeStock = db.all('Cafe_Items').some((i) => i.status === 'active' && i.kind === 'stock');
  return [
    { id: 'shift', state: shift ? 'done' : 'todo', params: {}, record_id: shift ? shift.id : '' },
    { id: 'drawer', state: !shift ? 'todo' : shortOver === 0 ? 'done' : 'warn', params: { amount: Math.abs(shortOver), short: shortOver < 0 } },
    { id: 'waiting', state: waiting ? 'warn' : 'done', params: { count: waiting } },
    ...(cafeStock ? [{ id: 'cafe', state: counted ? 'done' : 'warn', params: {} }] : []),
  ];
}

function nameOf(db, id) {
  const user = id ? db.get('Users', id) : null;
  return user ? user.display_name : '';
}

function checklist(ctx, { date }) {
  const { db } = ctx;
  const row = closingRow(db, date);
  const list = steps(db, date);
  const closed = Boolean(row && row.status === 'closed');
  const recent = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.parse(`${date}T00:00:00Z`) - i * DAY_MS).toISOString().slice(0, 10);
    recent.push({ date: d, shift: Boolean(shiftOf(db, d)), closed: isDayClosed(db, d) });
  }
  return {
    date,
    steps: list,
    closed: closed ? { by: nameOf(db, row.closed_by), at: row.closed_at, note: row.note } : null,
    reopened: row && row.status === 'reopened' ? { by: nameOf(db, row.reopened_by), at: row.reopened_at, reason: row.reopen_reason } : null,
    can_close: !closed && list.every((s) => s.state !== 'todo'),
    can_reopen: closed && ctx.can('acc.approve'),
    recent,
  };
}

function close(ctx, { date, note }) {
  const { db } = ctx;
  const list = steps(db, date);
  // Only a missing daily shift leaves steps to do; warnings don't block.
  if (list.some((s) => s.state === 'todo')) throw new AppError('VALIDATION', {}, { date: { code: 'val.closing_shift', params: {} } });
  const row = closingRow(db, date);
  if (row && row.status === 'closed') throw new AppError('CONFLICT', { by: nameOf(db, row.closed_by) });
  const fields = { date, status: 'closed', checklist: list, note: note || '', closed_by: ctx.user.id, closed_at: db.nowIso };
  const closing = row ? db.update('Day_Closings', row, fields) : db.insert('Day_Closings', { ...fields, reopened_by: '', reopened_at: '', reopen_reason: '' });
  return saved(closing.id);
}

function reopen(ctx, { date, reason }) {
  const { db } = ctx;
  const row = closingRow(db, date);
  if (!row || row.status !== 'closed') throw new AppError('CONFLICT', { by: '' });
  db.setReason(reason);
  db.update('Day_Closings', row, { status: 'reopened', reopened_by: ctx.user.id, reopened_at: db.nowIso, reopen_reason: reason });
  return saved(row.id);
}

export const CLOSING_HANDLERS = {
  'closing.day': checklist,
  'closing.day.close': close,
  'closing.day.reopen': reopen,
};
