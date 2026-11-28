// Getting started: the start date and the opening-figures checklist
// (shared/schema/start.js), on the steps engine. Each step says how far it
// has got; a manual step is ticked done by a shareholder.

import { saved } from '../../shared/contract/reply.js';
import { AppError } from '../../shared/contract/errors.js';
import { START_STEPS } from '../../shared/schema/start.js';
import { saveSetting, setting } from '../kernel/settings.js';
import { checklist, defineChecklist } from '../kernel/steps.js';
import { openingStock } from './stocktake.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });

// What each step has so far, shown beside it.
function counts(db) {
  const n = (rows) => rows.length;
  const waiting = db.all('Stock_Takes').find((s) => s.opening && s.status === 'waiting');
  return {
    date: {},
    accounts: { count: n(db.all('Money_Accounts').filter((a) => a.opening)) },
    shareholders: { count: n(db.all('Shareholders').filter((s) => s.opening_owed || s.opening_owes || db.all('Money_Accounts').some((a) => a.shareholder_id === s.id))) },
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

// Every step is required; a manual one is ticked by a shareholder.
defineChecklist('start', {
  perm: 'acc.setup',
  steps(db) {
    const seen = { date: Boolean(setting(db, 'accounting.start_date')), stock: Boolean(openingStock(db)), cafe: db.all('Cafe_Counts').length > 0 };
    return START_STEPS.map((s) => (s.manual ? { id: s.id, manual: true } : { id: s.id, state: seen[s.id] ? 'done' : 'todo' }));
  },
});

function view(ctx) {
  const { db } = ctx;
  const info = counts(db);
  const steps = checklist(db, 'start', '').map((s, i) => ({ ...s, path: START_STEPS[i].path, done: s.state === 'done', info: info[s.id] }));
  return { start_date: setting(db, 'accounting.start_date'), steps, done: steps.filter((s) => s.done).length };
}

// The start date can't move once a month is closed (closed figures rest on
// it) or the opening stock, dated on it, is approved.
function saveStartDate(db, date) {
  if (date === setting(db, 'accounting.start_date')) return;
  if (db.all('Month_Closings').some((c) => c.status === 'closed')) throw fieldError('start_date', 'val.start_date_closed');
  if (openingStock(db)) throw fieldError('start_date', 'val.start_date_stock');
  saveSetting(db, 'accounting.start_date', date);
}

function saveDate(ctx, { start_date: date }) {
  saveStartDate(ctx.db, date);
  return saved('accounting.start_date');
}

export const START_HANDLERS = {
  'start.view': view,
  'start.date.save': saveDate,
};
