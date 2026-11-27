// Setup → Money: money accounts, expense categories, due contacts and
// shareholders. These are history, not just configuration, so they are
// never deleted: they are turned inactive.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });

const byName = (a, b) => a.name.localeCompare(b.name);

function list(ctx) {
  const { db } = ctx;
  return {
    accounts: db.all('Money_Accounts').map(pick).sort(byName),
    categories: db.all('Expense_Categories').map(pick).sort(byName),
    contacts: db.all('Due_Contacts').map(pick).sort(byName),
    shareholders: db.all('Shareholders').map(pick).sort(byName),
  };
}

function pick(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (!['_row', 'created_at', 'created_by', 'updated_at', 'updated_by'].includes(key)) out[key] = value;
  }
  return out;
}

// Insert, or update with the version check.
function upsert(db, table, input, fields) {
  if (!input.id) return db.insert(table, fields);
  const current = db.get(table, input.id);
  if (!current) throw new AppError('NOT_FOUND');
  if (!input.version) throw fieldError('version', 'val.required');
  return db.update(table, current, fields, input.version);
}

function sameName(rows, input) {
  const name = input.name.toLowerCase();
  return rows.find((r) => r.id !== input.id && r.name.toLowerCase() === name);
}

// "Utility" and "Utilities", "Snack" and "Snacks": the same word.
function stem(name) {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').replace(/ies$/u, 'y').replace(/(?:es|s)$/u, '');
}

function saveAccount(ctx, input) {
  const { db } = ctx;
  const rows = db.all('Money_Accounts');
  if (sameName(rows, input)) throw fieldError('name', 'val.taken');
  // Exactly one cash drawer: the daily cash count is checked against it.
  const otherDrawer = rows.find((r) => r.id !== input.id && r.kind === 'drawer' && r.status === 'active');
  if (input.kind === 'drawer' && input.status === 'active' && otherDrawer) throw fieldError('kind', 'val.one_drawer', { name: otherDrawer.name });
  const current = input.id ? rows.find((r) => r.id === input.id) : null;
  if (current && current.kind === 'drawer' && current.status === 'active' && (input.kind !== 'drawer' || input.status !== 'active') && !otherDrawer) {
    throw fieldError(input.kind !== 'drawer' ? 'kind' : 'status', 'val.need_drawer');
  }
  const row = upsert(db, 'Money_Accounts', input, { name: input.name, kind: input.kind, opening: input.opening || 0, status: input.status });
  return saved(row.id, pick(row));
}

function saveCategory(ctx, input) {
  const { db } = ctx;
  const rows = db.all('Expense_Categories');
  if (sameName(rows, input)) throw fieldError('name', 'val.taken');
  const close = rows.find((r) => r.id !== input.id && stem(r.name) === stem(input.name));
  if (close && !input.confirm_similar) throw fieldError('name', 'val.similar', { name: close.name });
  const row = upsert(db, 'Expense_Categories', input, {
    name: input.name, area: input.area, needs_shareholder: Boolean(input.needs_shareholder), status: input.status,
  });
  return saved(row.id, pick(row));
}

function saveContact(ctx, input) {
  const row = upsert(ctx.db, 'Due_Contacts', input, {
    name: input.name, phone: input.phone || '', opening_due: input.opening_due || 0, status: input.status,
  });
  return saved(row.id, pick(row));
}

function saveShareholder(ctx, input) {
  const { db } = ctx;
  if (sameName(db.all('Shareholders'), input)) throw fieldError('name', 'val.taken');
  const row = upsert(db, 'Shareholders', input, {
    name: input.name, phone: input.phone || '', salary: input.salary || 0, status: input.status,
    opening_held: input.opening_held || 0, opening_owed: input.opening_owed || 0, opening_owes: input.opening_owes || 0,
  });
  return saved(row.id, pick(row));
}

export const SETUP_MONEY_HANDLERS = {
  'setup.money': list,
  'setup.account.save': saveAccount,
  'setup.category.save': saveCategory,
  'setup.contact.save': saveContact,
  'setup.shareholder.save': saveShareholder,
};
