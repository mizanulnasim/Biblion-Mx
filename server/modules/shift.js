// The daily shift: one per date. Net sales are split into cash, bKash, card
// and dues by person; cash handed to a shareholder leaves the drawer; the
// counted cash is checked against what the app expects in the drawer.
// Loyverse's expected cash, when entered, is kept beside it with its gap;
// only the app's figure decides short or over.
// Stored as a money entry (kind daily_shift), so it is approved, corrected,
// cancelled and logged like every other.

import { AppError } from '../../shared/contract/errors.js';
import { cashEffect } from '../../shared/money/kinds.js';
import { approvalSettings } from '../kernel/settings.js';
import { isDayClosed } from './closing.js';
import { actorOf, lookups, record, view } from './money.js';

const fieldError = (fields) => new AppError('VALIDATION', {}, fields);
const round = (n) => Math.round(n * 100) / 100;

function drawerOf(db) {
  return db.all('Money_Accounts').find((a) => a.kind === 'drawer' && a.status === 'active') || null;
}

function shiftOn(db, date, except) {
  return db.all('Transactions').find((e) => e.kind === 'daily_shift' && e.status === 'active' && e.date === date && e.id !== except) || null;
}

// What the app expects in the drawer at the end of `date`, before this
// shift: the opening balance and every entry up to and including that day,
// except the shift itself (or the one it corrects).
function drawerBefore(db, drawer, date, except) {
  return round(db.all('Transactions')
    .filter((e) => e.status === 'active' && e.date <= date && !(e.kind === 'daily_shift' && e.date === date) && e.id !== except)
    .reduce((sum, e) => sum + cashEffect(e, drawer.id), drawer.opening || 0));
}

function prepare(ctx, { date }) {
  const { db } = ctx;
  const drawer = drawerOf(db);
  const existing = shiftOn(db, date, '');
  const active = (table) => db.all(table).filter((r) => r.status === 'active');
  return {
    date,
    closed: isDayClosed(db, date),
    existing: existing ? view(existing, lookups(db)) : null,
    drawer: drawer ? { id: drawer.id, name: drawer.name } : null,
    drawer_before: drawer ? drawerBefore(db, drawer, date, '') : 0,
    accounts: active('Money_Accounts').map((a) => ({ id: a.id, name: a.name, kind: a.kind })),
    contacts: active('Due_Contacts').map((c) => ({ id: c.id, name: c.name })),
    approval: approvalSettings(db),
    actor: actorOf(ctx),
  };
}

function save(ctx, input) {
  const { db } = ctx;
  const drawer = drawerOf(db);
  if (!drawer) throw fieldError({ actual_cash: { code: 'val.need_drawer', params: {} } });
  const fields = {};
  const err = (field, code, params = {}) => {
    fields[field] = { code, params };
  };
  if (shiftOn(db, input.date, input.replaces)) err('date', 'val.shift_exists');

  const cash = input.cash || 0;
  const bkash = input.bkash || 0;
  const card = input.card || 0;
  const handed = input.handed || 0;
  const dues = input.dues || [];
  const split = round(cash + bkash + card + dues.reduce((s, d) => s + d.amount, 0));
  if (split !== input.net_sales) err('net_sales', 'val.split', { split, diff: round(input.net_sales - split) });
  if ((input.books_sales || 0) > input.net_sales) err('books_sales', 'val.more_than_sales');

  const account = (field, required) => {
    if (!required) return '';
    const row = input[field] ? db.get('Money_Accounts', input[field]) : null;
    if (!input[field]) err(field, 'val.required');
    else if (!row || row.status !== 'active') err(field, 'val.not_found');
    return input[field] || '';
  };
  const bkashAccount = account('bkash_account_id', bkash > 0);
  const cardAccount = account('card_account_id', card > 0);
  const handedTo = account('handed_to', handed > 0);
  if (handedTo && handedTo === drawer.id) err('handed_to', 'val.same_account');
  dues.forEach((d, i) => {
    const contact = db.get('Due_Contacts', d.party_id);
    if (!contact || contact.status !== 'active') err(`dues.${i}.party_id`, 'val.not_found');
  });
  if (Object.keys(fields).length) throw fieldError(fields);

  const expected = round(drawerBefore(db, drawer, input.date, input.replaces) + cash - handed);
  const shortOver = round(input.actual_cash - expected);
  const entry = {
    kind: 'daily_shift',
    date: input.date,
    amount: input.net_sales,
    account_id: drawer.id,
    to_account_id: '',
    category_id: '',
    party_id: '',
    direction: '',
    note: input.note || '',
    ref: '',
    short_over: shortOver,
    details: {
      books_sales: input.books_sales || 0,
      cash, bkash, card, dues, handed,
      handed_to: handedTo,
      bkash_account_id: bkashAccount,
      card_account_id: cardAccount,
      expected_cash: expected,
      actual_cash: input.actual_cash,
      short_over: shortOver,
      pos_expected: input.pos_expected ?? null,
      pos_gap: input.pos_expected === null || input.pos_expected === undefined ? null : round(input.actual_cash - input.pos_expected),
    },
  };
  return record(ctx, entry, input);
}

export const SHIFT_HANDLERS = {
  'shift.prepare': prepare,
  'shift.save': save,
};
