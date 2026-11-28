// The one money screen: save (with duplicate warnings and the approval
// policy), correct, cancel, approve, list, and the balances.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { KINDS, cashEffect, dueEffect, kindAccess, loanEffect, payEffect } from '../../shared/money/kinds.js';
import { decide } from '../../shared/rules/approval.js';
import { findDuplicates } from '../../shared/rules/duplicates.js';
import { page } from '../kernel/paging.js';
import { approvalSettings } from '../kernel/settings.js';
import { isDayClosed, isMonthClosed } from './closing.js';
import { supplierBalances } from './suppliers.js';
import { payAccount } from './payroll.js';
import { planner } from './rota.js';
import { tell } from '../kernel/notify.js';

const fieldError = (fields) => new AppError('VALIDATION', {}, fields);

function permissionsOf(ctx) {
  return ['acc.entry', 'acc.view_all', 'acc.approve', ...Object.values(KINDS).map((k) => k.perm)].filter((p) => ctx.can(p));
}

export function actorOf(ctx) {
  return { level: ctx.level, permissions: permissionsOf(ctx) };
}

const counts = (e) => e.status === 'active';

// ---- Names and balances --------------------------------------------------

export function lookups(db) {
  const map = new Map();
  for (const table of ['Money_Accounts', 'Expense_Categories', 'Due_Contacts', 'Shareholders', 'Suppliers', 'Staff']) {
    for (const row of db.all(table)) map.set(row.id, row);
  }
  for (const user of db.all('Users')) map.set(user.id, user);
  return map;
}

function balances(db) {
  const entries = db.all('Transactions').filter(counts);
  const accounts = db.all('Money_Accounts').map((a) => ({
    id: a.id, name: a.name, kind: a.kind, status: a.status,
    balance: entries.reduce((sum, e) => sum + cashEffect(e, a.id), a.opening || 0),
  }));
  const dues = {};
  for (const c of db.all('Due_Contacts')) dues[c.id] = c.opening_due || 0;
  const loans = {};
  const advances = {};
  for (const s of db.all('Shareholders')) {
    loans[s.id] = 0;
    advances[s.id] = 0;
  }
  for (const e of entries) {
    const contacts = e.kind === 'daily_shift' ? new Set(e.details.dues.map((d) => d.party_id)) : [e.party_id];
    for (const id of contacts) if (id in dues) dues[id] += dueEffect(e, id);
    if (e.party_id in loans) {
      loans[e.party_id] += loanEffect(e);
      advances[e.party_id] += payEffect(e).advance;
    }
  }
  return { accounts, dues, loans, advances };
}

export function view(entry, names) {
  const name = (id) => (id && names.get(id) ? names.get(id).name || names.get(id).display_name : '');
  return {
    id: entry.id,
    date: entry.date,
    kind: entry.kind,
    amount: entry.amount,
    account_id: entry.account_id,
    account: name(entry.account_id),
    to_account_id: entry.to_account_id,
    to_account: name(entry.to_account_id),
    category_id: entry.category_id,
    category: name(entry.category_id),
    party_id: entry.party_id,
    party: name(entry.party_id),
    direction: entry.direction,
    note: entry.note,
    ref: entry.ref,
    covers_up_to: entry.covers_up_to,
    period: entry.period,
    file_id: entry.file_id,
    details: entry.details,
    status: entry.status,
    approval: entry.approval,
    wait_reasons: entry.wait_reasons || [],
    dup_reason: entry.dup_reason,
    approved_by: name(entry.approved_by),
    approved_at: entry.approved_at,
    replaces: entry.replaces,
    replaced_by: entry.replaced_by,
    cancel_reason: entry.cancel_reason,
    cancelled_by: name(entry.cancelled_by),
    cancelled_at: entry.cancelled_at,
    entered_by: entry.entered_by,
    entered_by_name: name(entry.entered_by),
    created_at: entry.created_at,
  };
}

// ---- Who may change an entry ---------------------------------------------
// A shareholder may correct or cancel any entry. The person who entered an
// entry may correct or cancel it while it is still waiting (v1 friction).
function canChange(ctx, entry) {
  if (ctx.can('acc.approve')) return true;
  return entry.entered_by === ctx.user.id && entry.approval === 'waiting';
}

function changeable(ctx, id, field) {
  const entry = ctx.db.get('Transactions', id);
  if (!entry) throw fieldError({ [field]: { code: 'val.not_found', params: {} } });
  // Changed meanwhile (corrected or cancelled by someone else): fail clearly, never a second replacement (S7).
  if (entry.status !== 'active') {
    const by = ctx.db.get('Users', entry.cancelled_by || entry.updated_by);
    throw new AppError('CONFLICT', { by: by ? by.display_name : '' });
  }
  if (!canChange(ctx, entry)) throw new AppError('FORBIDDEN');
  assertDayOpen(ctx, entry.date, field);
  return entry;
}

// A closed day's money is changed only by a shareholder (who may also reopen the day).
export function assertDayOpen(ctx, date, field) {
  if (isMonthClosed(ctx.db, date)) throw fieldError({ [field]: { code: 'val.month_locked', params: { date } } });
  if (!ctx.can('acc.approve') && isDayClosed(ctx.db, date)) {
    throw fieldError({ [field]: { code: 'val.day_closed', params: { date } } });
  }
}

// ---- Reads ---------------------------------------------------------------

function boot(ctx) {
  const { db } = ctx;
  const active = (rows) => rows.filter((r) => r.status === 'active').map((r) => ({ ...r, _row: undefined }));
  const sums = balances(db);
  const kinds = {};
  for (const id of Object.keys(KINDS)) kinds[id] = kindAccess(permissionsOf(ctx), id);
  const owed = supplierBalances(db);
  return {
    kinds,
    approval: approvalSettings(db),
    actor: actorOf(ctx),
    accounts: active(db.all('Money_Accounts')).map((a) => ({
      id: a.id, name: a.name, kind: a.kind,
      balance: ctx.can('acc.view_all') ? sums.accounts.find((s) => s.id === a.id).balance : null,
    })),
    categories: active(db.all('Expense_Categories')).map((c) => ({ id: c.id, name: c.name, area: c.area, needs_shareholder: c.needs_shareholder })),
    // Open loans, for loan entries to name theirs (interest is worked out on it).
    loans: db.all('Loans').filter((l) => l.status === 'open').map((l) => ({ id: l.id, number: l.number, shareholder_id: l.shareholder_id, direction: l.direction, rate: l.rate })),
    contacts: active(db.all('Due_Contacts')).map((c) => ({ id: c.id, name: c.name, phone: c.phone, due: sums.dues[c.id] })),
    shareholders: active(db.all('Shareholders')).map((s) => ({
      id: s.id, name: s.name, loan: ctx.can('acc.view_all') ? sums.loans[s.id] : null, advance: ctx.can('acc.view_all') ? sums.advances[s.id] : null,
    })),
    // Staff (and people who left, for their last pay), with their pay
    // account for those who pay staff.
    staff: ctx.can('acc.staffpay') ? staffChoices(db) : [],
    suppliers: active(db.all('Suppliers')).map((s) => ({
      id: s.id, kind: s.kind, name: s.name, pays_on: s.pays_on, owed: ctx.can('acc.view_all') ? owed.get(s.id) || 0 : null,
    })),
  };
}

function staffChoices(db) {
  const p = planner(db);
  return db.all('Staff').filter((s) => s.status === 'active' || s.left_on).sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
    const account = payAccount(db, s, p);
    return { id: s.id, name: s.name, status: s.status, owed: account.owed, advance: account.advance };
  });
}

const STATE_FILTERS = {
  waiting: (e) => e.status === 'active' && e.approval === 'waiting',
  final: (e) => e.status === 'active' && e.approval === 'final',
  cancelled: (e) => e.status !== 'active',
};

function list(ctx, query) {
  const { db } = ctx;
  const names = lookups(db);
  let rows = db.all('Transactions');
  // Without acc.view_all, a person sees only what they entered.
  if (!ctx.can('acc.view_all')) rows = rows.filter((e) => e.entered_by === ctx.user.id);
  if (query.kind) rows = rows.filter((e) => e.kind === query.kind);
  if (query.state) rows = rows.filter(STATE_FILTERS[query.state]);
  const items = rows.map((e) => ({ ...view(e, names), _row: e._row }));
  // Newest first by the entry's date, then by when it was saved.
  const result = page(
    items,
    query,
    (e) => [e.id, e.date, e.amount, e.account, e.to_account, e.category, e.party, e.note, e.ref, e.entered_by_name].join(' '),
    (e) => `${e.date}|${e.created_at}`,
  );
  return { ...result, items: result.items.map(({ _row, ...e }) => e) };
}

function get(ctx, { id }) {
  const { db } = ctx;
  const entry = db.get('Transactions', id);
  if (!entry || (!ctx.can('acc.view_all') && entry.entered_by !== ctx.user.id)) throw new AppError('NOT_FOUND');
  const names = lookups(db);
  // The chain of corrections, oldest first.
  const history = [];
  let cursor = entry;
  while (cursor && cursor.replaces) {
    cursor = db.get('Transactions', cursor.replaces);
    if (cursor) history.unshift(view(cursor, names));
  }
  return {
    entry: view(entry, names),
    history,
    can: {
      change: entry.status === 'active' && canChange(ctx, entry),
      approve: entry.status === 'active' && entry.approval === 'waiting' && ctx.can('acc.approve') && entry.entered_by !== ctx.user.id,
    },
  };
}

// ---- Save ----------------------------------------------------------------

// The advance a person still owes back, leaving out an entry being corrected.
function advanceOf(db, table, id, replacing) {
  const entries = db.all('Transactions').filter((e) => counts(e) && e.party_id === id && e.id !== replacing);
  const start = table === 'Staff' ? (db.all('Pay_Openings').find((o) => o.staff_id === id) || { advance: 0 }).advance : 0;
  return entries.reduce((t, e) => t + payEffect(e).advance, start || 0);
}

// Checks the fields each kind needs, and that the records named exist and are active.
function shape(db, input) {
  const kind = KINDS[input.kind];
  const fields = {};
  const need = (field) => {
    if (!input[field]) fields[field] = { code: 'val.required', params: {} };
  };
  const activeIn = (table, field) => {
    if (!input[field]) return null;
    const row = db.get(table, input[field]);
    if (!row || row.status !== 'active') fields[field] = { code: 'val.not_found', params: {} };
    return row;
  };
  if (kind.cash !== 'none') need('account_id');
  if (kind.cash === 'transfer') {
    need('to_account_id');
    if (input.to_account_id && input.to_account_id === input.account_id) fields.to_account_id = { code: 'val.same_account', params: {} };
  }
  if (kind.cash === 'either') need('direction');
  if (kind.party === 'category') need('category_id');
  if (kind.party && kind.party !== 'category') need('party_id');
  activeIn('Money_Accounts', 'account_id');
  activeIn('Money_Accounts', 'to_account_id');
  const category = kind.party === 'category' ? activeIn('Expense_Categories', 'category_id') : null;
  if (kind.party === 'contact') activeIn('Due_Contacts', 'party_id');
  if (kind.party === 'shareholder') activeIn('Shareholders', 'party_id');
  if (kind.party === 'staff' && input.party_id) {
    const person = db.get('Staff', input.party_id);
    if (!person || (person.status !== 'active' && !person.left_on)) fields.party_id = { code: 'val.not_found', params: {} };
  }
  if (kind.period) need('period');
  // A loan entry names its loan (for interest), of the same shareholder.
  if (kind.loan && input.loan_id) {
    const loan = db.get('Loans', input.loan_id);
    if (!loan || loan.status !== 'open' || loan.shareholder_id !== input.party_id) fields.loan_id = { code: 'val.not_found', params: {} };
  }
  // A deduction recovers an advance, so it can't be more than is owed back.
  if ((input.kind === 'staff_deduction' || input.kind === 'shareholder_deduction') && input.party_id && !fields.party_id) {
    const outstanding = advanceOf(db, input.kind === 'staff_deduction' ? 'Staff' : 'Shareholders', input.party_id, input.replaces);
    if (input.amount > outstanding) fields.amount = { code: 'val.over_advance', params: { advance: outstanding } };
  }
  if (kind.party === 'vendor' || kind.party === 'publisher') {
    const supplier = activeIn('Suppliers', 'party_id');
    if (supplier && supplier.kind !== kind.party) fields.party_id = { code: 'val.not_found', params: {} };
  }
  if (Object.keys(fields).length) throw fieldError(fields);
  return {
    kind: input.kind,
    date: input.date,
    amount: input.amount,
    account_id: kind.cash === 'none' ? '' : input.account_id,
    to_account_id: kind.cash === 'transfer' ? input.to_account_id : '',
    category_id: kind.party === 'category' ? input.category_id : '',
    party_id: kind.party && kind.party !== 'category' ? input.party_id : '',
    direction: kind.cash === 'either' ? input.direction : '',
    note: input.note || '',
    ref: input.ref || '',
    covers_up_to: kind.covers ? input.covers_up_to || '' : '',
    period: kind.period ? input.period : '',
    ...(kind.instalment && input.instalment ? { details: { instalment: input.instalment } } : {}),
    ...(kind.loan && input.loan_id ? { details: { loan_id: input.loan_id } } : {}),
    category_needs_shareholder: Boolean(category && category.needs_shareholder),
  };
}

function prompt(warnings, db) {
  const names = lookups(db);
  return {
    warnings: warnings.map((w) => ({
      code: w.code,
      params: w.params,
      fix: w.fix || null,
      existing: w.existing.map((id) => view(db.get('Transactions', id), names)),
    })),
  };
}

// Saves a checked entry: duplicate warnings (needs_input until a reason is
// given; a blocking one is a field error), the approval policy, the
// correction it replaces, and the other half it cancels. Used by the money
// screen, the daily shift, and payments made with a book delivery (which
// skip the duplicate checks: the delivery itself is the record).
export function record(ctx, entry, input, { checkDuplicates = true } = {}) {
  const { db } = ctx;
  assertDayOpen(ctx, entry.date, 'date');
  const old = input.replaces ? changeable(ctx, input.replaces, 'replaces') : null;
  if (old && (old.kind === 'daily_shift') !== (entry.kind === 'daily_shift')) throw fieldError({ replaces: { code: 'val.format', params: {} } });
  const pair = input.pair_id ? changeable(ctx, input.pair_id, 'pair_id') : null;
  if (pair && entry.kind !== 'transfer') throw fieldError({ pair_id: { code: 'val.format', params: {} } });

  const ignore = new Set([input.replaces, input.pair_id]);
  const others = db.all('Transactions').filter((e) => counts(e) && !ignore.has(e.id));
  const suppliers = db.all('Suppliers').filter((s) => s.status === 'active');
  const warnings = checkDuplicates ? findDuplicates(entry, others, suppliers) : [];
  const blocking = warnings.find((w) => w.blocks);
  if (blocking) throw fieldError({ [blocking.blocks]: { code: blocking.code, params: blocking.params } });
  if (warnings.length && !input.reason) return { status: 'needs_input', prompt: prompt(warnings, db) };
  const dupReason = warnings.length ? input.reason : '';

  const decision = decide(actorOf(ctx), { ...entry, dup_reason: dupReason }, approvalSettings(db));
  if (dupReason) db.setReason(dupReason);
  const row = db.insert('Transactions', {
    kind: entry.kind,
    date: entry.date,
    amount: entry.amount,
    account_id: entry.account_id,
    to_account_id: entry.to_account_id,
    category_id: entry.category_id,
    party_id: entry.party_id,
    direction: entry.direction,
    note: entry.note,
    ref: entry.ref,
    details: entry.details || null,
    covers_up_to: entry.covers_up_to || '',
    period: entry.period || '',
    file_id: entry.file_id || '',
    status: 'active',
    approval: decision.final ? 'final' : 'waiting',
    wait_reasons: decision.reasons,
    approved_by: '',
    approved_at: '',
    dup_reason: dupReason,
    replaces: old ? old.id : '',
    replaced_by: '',
    entered_by: ctx.user.id,
  });
  if (old) db.update('Transactions', old, { status: 'replaced', replaced_by: row.id });
  // A salary paid is told to the person (not again when it is corrected).
  if (row.kind === 'salary_paid' && !old) {
    const staff = db.get('Staff', row.party_id);
    if (staff) tell(ctx, staff.user_id, 'hr', 'msg.salary_paid', { amount: { m: row.amount }, month: { mo: row.period } }, '/me/pay');
  }
  if (pair) {
    db.setReason(input.reason || '');
    db.update('Transactions', pair, { status: 'cancelled', replaced_by: row.id, cancel_reason: input.reason || '', cancelled_by: ctx.user.id, cancelled_at: db.nowIso });
  }
  return saved(row.id, { approval: row.approval, reasons: decision.reasons });
}

// A money entry checked and ready for record(), without saving it.
export function prepareEntry(ctx, input) {
  if (kindAccess(permissionsOf(ctx), input.kind) === 'none') throw new AppError('FORBIDDEN');
  return shape(ctx.db, input);
}

function save(ctx, input) {
  return record(ctx, prepareEntry(ctx, input), input);
}

function cancel(ctx, input) {
  const { db } = ctx;
  const entry = changeable(ctx, input.id, 'id');
  db.setReason(input.reason);
  db.update('Transactions', entry, { status: 'cancelled', cancel_reason: input.reason, cancelled_by: ctx.user.id, cancelled_at: db.nowIso });
  // Cancelled by someone else: whoever entered it is told why.
  tell(ctx, entry.entered_by, 'accounts', 'msg.entry_cancelled', { kind: { k: entry.kind }, amount: { m: entry.amount }, reason: input.reason }, '/money');
  return saved(entry.id);
}

function approve(ctx, input) {
  const { db } = ctx;
  const entry = db.get('Transactions', input.id);
  if (!entry) throw new AppError('NOT_FOUND');
  if (entry.status !== 'active' || entry.approval !== 'waiting') throw new AppError('CONFLICT', { by: '' });
  // Nobody approves their own entry.
  if (entry.entered_by === ctx.user.id) throw new AppError('OWN_ENTRY');
  db.update('Transactions', entry, { approval: 'final', approved_by: ctx.user.id, approved_at: db.nowIso });
  return saved(entry.id);
}

// ---- Home: what waits ------------------------------------------------------

function home(ctx) {
  const { db } = ctx;
  if (!ctx.can('acc.entry')) return { waiting: [], mine_waiting: 0, today: null };
  const date = new Date(db.now.getTime() + 6 * 3600000).toISOString().slice(0, 10);
  // Today's first jobs for people who do them: the shift, then closing the day.
  const today = ctx.can('acc.daily') ? {
    date,
    shift: db.all('Transactions').some((e) => e.kind === 'daily_shift' && e.status === 'active' && e.date === date),
    closed: isDayClosed(db, date),
  } : null;
  const names = lookups(db);
  const waiting = db.all('Transactions').filter((e) => e.status === 'active' && e.approval === 'waiting');
  return {
    waiting: ctx.can('acc.approve')
      ? waiting.filter((e) => e.entered_by !== ctx.user.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((e) => view(e, names))
      : [],
    mine_waiting: waiting.filter((e) => e.entered_by === ctx.user.id).length,
    today,
  };
}

export const MONEY_HANDLERS = {
  'money.boot': boot,
  'money.list': list,
  'money.get': get,
  'money.save': save,
  'money.cancel': cancel,
  'money.approve': approve,
  'home.get': home,
};
