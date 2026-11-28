// Day closing: the checklist for a date, closing it, and reopening it with a
// reason. A closed day's money can then be changed only by a shareholder.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { tasksDue } from './tasks.js';
import { setting } from '../kernel/settings.js';
import { checkReady, checklist, defineChecklist, missing } from '../kernel/steps.js';

const RECENT_DAYS = 7;
const DAY_MS = 86400000;

function closingRow(db, date) {
  return db.all('Day_Closings').find((r) => r.date === date) || null;
}

export function isDayClosed(db, date) {
  const row = closingRow(db, date);
  return Boolean(row && row.status === 'closed') || isMonthClosed(db, date);
}

// A closed accounting month locks its days for everyone; it is reopened
// (with a reason) to change them.
export function isMonthClosed(db, date) {
  return db.all('Month_Closings').some((c) => c.status === 'closed' && c.figures.period_from <= date && c.figures.period_to >= date);
}

function shiftOf(db, date) {
  return db.all('Transactions').find((e) => e.kind === 'daily_shift' && e.status === 'active' && e.date === date) || null;
}

// The day's checklist. Which steps are required is a setting
// (closing.day_steps); entries still waiting are only ever a warning.
// Deliveries are ticked by the person closing.
defineChecklist('day', {
  perm: 'closing.day',
  required: (db) => new Set(setting(db, 'closing.day_steps')),
  locked: (db, date) => isDayClosed(db, date),
  steps(db, date) {
    const shift = shiftOf(db, date);
    const waiting = db.all('Transactions').filter((e) => e.status === 'active' && e.approval === 'waiting' && e.date === date).length;
    const shortOver = shift ? shift.details.short_over : 0;
    const counted = db.all('Cafe_Counts').some((c) => c.date === date);
    const cafeStock = db.all('Cafe_Items').some((i) => i.status === 'active' && i.kind === 'stock');
    const tasks = tasksDue(db, date);
    return [
      { id: 'shift', state: shift ? 'done' : 'todo', record_id: shift ? shift.id : '' },
      { id: 'cash', state: !shift ? 'todo' : shortOver === 0 ? 'done' : 'warn', params: { amount: Math.abs(shortOver), short: shortOver < 0 } },
      ...(cafeStock ? [{ id: 'cafe', state: counted ? 'done' : 'todo' }] : []),
      { id: 'deliveries', manual: true },
      ...(tasks.total ? [{ id: 'tasks', state: tasks.open ? 'todo' : 'done', params: { count: tasks.open } }] : []),
      { id: 'waiting', state: waiting ? 'warn' : 'done', params: { count: waiting } },
    ];
  },
});

const steps = (db, date) => checklist(db, 'day', date);

function nameOf(db, id) {
  const user = id ? db.get('Users', id) : null;
  return user ? user.display_name : '';
}

function dayView(ctx, { date }) {
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
    missing: missing(list),
    skip_reason: row && row.status === 'closed' ? row.skip_reason : '',
    can_close: !closed,
    can_reopen: closed && ctx.can('acc.approve'),
    recent,
  };
}

// A required step not done needs a reason, kept on the closing and logged.
function close(ctx, { date, note, skip_reason: skipReason }) {
  const { db } = ctx;
  const list = steps(db, date);
  const skipped = checkReady(list, skipReason);
  if (skipped.length) db.setReason(skipReason);
  const row = closingRow(db, date);
  if (row && row.status === 'closed') throw new AppError('CONFLICT', { by: nameOf(db, row.closed_by) });
  const fields = { date, status: 'closed', checklist: list, note: note || '', skip_reason: skipped.length ? skipReason : '', closed_by: ctx.user.id, closed_at: db.nowIso };
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
  'closing.day': dayView,
  'closing.day.close': close,
  'closing.day.reopen': reopen,
};
