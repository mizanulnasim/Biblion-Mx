// Vendors and publishers: their terms, what the shop owes each, statements,
// and the "Covers sales up to" suggestion for a publisher payment.
//
// What a publisher is owed:
//   paid on delivery:  the cost of copies delivered, less copies returned
//   paid as they sell: the cost of copies sold
// plus the opening due, plus refunds and advances written off, less payments.
// A copy's cost is the average cost of its deliveries and opening stock;
// before any, its printed price less the publisher's commission. Opening
// stock adds nothing to what a publisher is owed: that is the opening due.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { payableEffect } from '../../shared/money/kinds.js';

const round = (n) => Math.round(n * 100) / 100;
const fieldError = (field, code) => new AppError('VALIDATION', {}, { [field]: { code, params: {} } });

export function supplierCostRule(publisher) {
  return (printed) => round(printed * (1 - (publisher ? publisher.commission || 0 : 0) / 100));
}

// Average cost per book, from active deliveries and opening stock.
export function bookCosts(db) {
  const sums = new Map();
  for (const m of db.all('Stock_Movements')) {
    if (m.status !== 'active' || (m.kind !== 'receive' && m.kind !== 'opening')) continue;
    const s = sums.get(m.book_id) || { qty: 0, cost: 0 };
    s.qty += m.qty;
    s.cost += m.qty * m.unit_cost;
    sums.set(m.book_id, s);
  }
  const suppliers = new Map(db.all('Suppliers').map((s) => [s.id, s]));
  const costs = new Map();
  for (const b of db.all('Books')) {
    const s = sums.get(b.id);
    costs.set(b.id, s && s.qty ? round(s.cost / s.qty) : supplierCostRule(suppliers.get(b.publisher_id))(b.printed_price));
  }
  return costs;
}

// What each book movement adds to its publisher's due, with its date.
function bookDueLines(db) {
  const costs = bookCosts(db);
  const books = new Map(db.all('Books').map((b) => [b.id, b]));
  const suppliers = new Map(db.all('Suppliers').map((s) => [s.id, s]));
  const lines = [];
  for (const m of db.all('Stock_Movements')) {
    if (m.status !== 'active') continue;
    const book = books.get(m.book_id);
    const publisher = book && suppliers.get(book.publisher_id);
    if (!publisher) continue;
    const onDelivery = publisher.pays_on === 'delivery';
    let amount = 0;
    if (onDelivery && m.kind === 'receive') amount = m.qty * m.unit_cost;
    else if (onDelivery && m.kind === 'returned') amount = m.qty * (m.unit_cost || costs.get(m.book_id));
    else if (!onDelivery && m.kind === 'sale') amount = -m.qty * costs.get(m.book_id);
    if (amount) lines.push({ supplier_id: publisher.id, date: m.date, amount: round(amount), kind: m.kind, book: book.title, qty: Math.abs(m.qty), id: m.id });
  }
  return lines;
}

// What the shop owes each supplier (positive: the shop owes).
export function supplierBalances(db) {
  const owed = new Map(db.all('Suppliers').map((s) => [s.id, s.opening_due || 0]));
  for (const e of db.all('Transactions')) {
    if (e.status === 'active' && owed.has(e.party_id)) owed.set(e.party_id, owed.get(e.party_id) + payableEffect(e));
  }
  for (const l of bookDueLines(db)) owed.set(l.supplier_id, owed.get(l.supplier_id) + l.amount);
  for (const [id, v] of owed) owed.set(id, round(v));
  return owed;
}

function pick(s, owed) {
  return {
    id: s.id, version: s.version, kind: s.kind, name: s.name, phone: s.phone, commission: s.commission || 0,
    sell_discount: s.sell_discount || 0, pays_on: s.pays_on || 'sale', opening_due: s.opening_due || 0, status: s.status, owed: owed.get(s.id) || 0,
  };
}

function list(ctx) {
  const owed = supplierBalances(ctx.db);
  return { items: ctx.db.all('Suppliers').map((s) => pick(s, owed)).sort((a, b) => a.name.localeCompare(b.name)) };
}

function save(ctx, input) {
  const { db } = ctx;
  const rows = db.all('Suppliers');
  if (rows.some((r) => r.id !== input.id && r.kind === input.kind && r.name.toLowerCase() === input.name.toLowerCase())) throw fieldError('name', 'val.taken');
  const fields = {
    kind: input.kind, name: input.name, phone: input.phone || '', status: input.status,
    commission: input.kind === 'publisher' ? input.commission || 0 : 0,
    sell_discount: input.kind === 'publisher' ? input.sell_discount || 0 : 0,
    pays_on: input.kind === 'publisher' ? input.pays_on || 'sale' : '',
    opening_due: input.opening_due || 0,
  };
  let row;
  if (!input.id) {
    row = db.insert('Suppliers', fields);
  } else {
    const current = db.get('Suppliers', input.id);
    if (!current) throw new AppError('NOT_FOUND');
    if (!input.version) throw fieldError('version', 'val.required');
    if (current.kind !== input.kind) throw fieldError('kind', 'val.not_self');
    row = db.update('Suppliers', current, fields, input.version);
  }
  return saved(row.id, pick(row, supplierBalances(db)));
}

// Every line that changed what is owed, oldest first, with a running total.
function statement(ctx, { id }) {
  const { db } = ctx;
  const supplier = db.get('Suppliers', id);
  if (!supplier) throw new AppError('NOT_FOUND');
  const lines = [];
  for (const e of db.all('Transactions')) {
    if (e.status === 'active' && e.party_id === id && payableEffect(e)) {
      lines.push({ date: e.date, kind: e.kind, amount: payableEffect(e), ref: e.ref, covers_up_to: e.covers_up_to, id: e.id, created_at: e.created_at });
    }
  }
  for (const l of bookDueLines(db)) {
    if (l.supplier_id === id) lines.push({ date: l.date, kind: `book_${l.kind}`, amount: l.amount, book: l.book, qty: l.qty, id: l.id, created_at: '' });
  }
  lines.sort((a, b) => (a.date === b.date ? (a.created_at < b.created_at ? -1 : 1) : a.date < b.date ? -1 : 1));
  let running = supplier.opening_due || 0;
  for (const l of lines) {
    running = round(running + l.amount);
    l.owed = running;
  }
  return { supplier: pick(supplier, supplierBalances(db)), opening_due: supplier.opening_due || 0, lines };
}

// For a publisher paid as copies sell: what is owed now, the latest date a
// payment has settled, and the latest date this payment would settle.
function suggest(ctx, { id, amount }) {
  const { db } = ctx;
  const supplier = db.get('Suppliers', id);
  if (!supplier || supplier.kind !== 'publisher') throw new AppError('NOT_FOUND');
  const owed = supplierBalances(db).get(id) || 0;
  const settled = db.all('Transactions').filter((e) => e.status === 'active' && e.party_id === id && e.covers_up_to)
    .map((e) => e.covers_up_to).sort().pop() || '';
  if (supplier.pays_on === 'delivery') return { owed, settled_to: settled, suggest: '' };
  // Money that went to this publisher so far, less refunds and write-offs and
  // the opening due, plus this payment, set against sales day by day.
  let credit = -(supplier.opening_due || 0) + (amount || 0);
  for (const e of db.all('Transactions')) if (e.status === 'active' && e.party_id === id) credit -= payableEffect(e);
  const byDay = new Map();
  for (const l of bookDueLines(db)) if (l.supplier_id === id) byDay.set(l.date, (byDay.get(l.date) || 0) + l.amount);
  let covered = '';
  let total = 0;
  for (const day of [...byDay.keys()].sort()) {
    total = round(total + byDay.get(day));
    if (total > credit) break;
    covered = day;
  }
  return { owed, settled_to: settled, suggest: covered };
}

export const SUPPLIER_HANDLERS = {
  'setup.supplier.save': save,
  'suppliers.list': list,
  'supplier.statement': statement,
  'publisher.suggest': suggest,
};
