// Getting started: the start date and the opening-figures checklist
// (shared/schema/start.js). Each step says how far it has got; a manual
// step is ticked done by a shareholder.

import { saved } from '../../shared/contract/reply.js';
import { AppError } from '../../shared/contract/errors.js';
import { START_STEPS } from '../../shared/schema/start.js';
import { saveSetting, setting } from '../kernel/settings.js';
import { openingStock } from './stocktake.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });

// What each step has so far, shown beside it.
function counts(db) {
  const n = (rows) => rows.length;
  const waiting = db.all('Stock_Takes').find((s) => s.opening && s.status === 'waiting');
  return {
    date: {},
    accounts: { count: n(db.all('Money_Accounts').filter((a) => a.opening)) },
    shareholders: { count: n(db.all('Shareholders').filter((s) => s.opening_held || s.opening_owed || s.opening_owes)) },
    dues: { count: n(db.all('Due_Contacts').filter((c) => c.opening_due)) },
    suppliers: { count: n(db.all('Suppliers').filter((s) => s.opening_due)) },
    advances: { count: n(db.all('Pay_Openings').filter((o) => o.owed || o.advance)) },
    leave: { count: n(db.all('Leave_Adjustments')) },
    stock: { waiting: Boolean(waiting) },
    cafe: { count: n(db.all('Cafe_Counts')) },
  };
}

// For Home: the Getting started steps not yet done (for shareholders).
export function startLeft(ctx) {
  if (!ctx.can('acc.setup')) return 0;
  const v = view(ctx);
  return v.steps.length - v.done;
}

function view(ctx) {
  const { db } = ctx;
  const startDate = setting(db, 'accounting.start_date');
  const marked = new Set(setting(db, 'start.done'));
  const seen = { date: Boolean(startDate), stock: Boolean(openingStock(db)), cafe: db.all('Cafe_Counts').length > 0 };
  const info = counts(db);
  const steps = START_STEPS.map((s) => ({ id: s.id, manual: s.manual, path: s.path, done: s.manual ? marked.has(s.id) : seen[s.id], info: info[s.id] }));
  return { start_date: startDate, steps, done: steps.filter((s) => s.done).length };
}

// The start date can't move once a month is closed (closed figures rest on
// it) or the opening stock, dated on it, is approved.
export function saveStartDate(db, date) {
  if (date === setting(db, 'accounting.start_date')) return;
  if (db.all('Month_Closings').some((c) => c.status === 'closed')) throw fieldError('start_date', 'val.start_date_closed');
  if (openingStock(db)) throw fieldError('start_date', 'val.start_date_stock');
  saveSetting(db, 'accounting.start_date', date);
}

function saveDate(ctx, { start_date: date }) {
  saveStartDate(ctx.db, date);
  return saved('accounting.start_date');
}

function saveStep(ctx, { step, done }) {
  const { db } = ctx;
  const marked = new Set(setting(db, 'start.done'));
  if (done) marked.add(step);
  else marked.delete(step);
  saveSetting(db, 'start.done', START_STEPS.map((s) => s.id).filter((id) => marked.has(id)));
  return saved(step);
}

export const START_HANDLERS = {
  'start.view': view,
  'start.date.save': saveDate,
  'start.step.save': saveStep,
};
