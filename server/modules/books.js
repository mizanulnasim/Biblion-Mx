// Books: the catalogue, the stock ledger, deliveries from publishers, stock
// changes with a reason, and typed book sales.
//
// Selling price: a title's own price, or its printed price less the
// publisher's shop discount to customers.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { newId } from '../store/db.js';
import { page } from '../kernel/paging.js';
import { assertDayOpen, record } from './money.js';
import { bookCosts, supplierCostRule } from './suppliers.js';
import { ordersArrived } from './special-orders.js';

const round = (n) => Math.round(n * 100) / 100;
const fieldError = (fields) => new AppError('VALIDATION', {}, fields);
const SIGN = { damaged: -1, lost: -1, found: 1, returned: -1 };

function sellingPrice(book, publisher) {
  if (book.sell_price) return book.sell_price;
  return Math.round(book.printed_price * (1 - (publisher ? publisher.sell_discount || 0 : 0) / 100));
}

function onHandMap(db) {
  const map = new Map();
  for (const m of db.all('Stock_Movements')) if (m.status === 'active') map.set(m.book_id, (map.get(m.book_id) || 0) + m.qty);
  return map;
}

function publishers(db) {
  return new Map(db.all('Suppliers').filter((s) => s.kind === 'publisher').map((s) => [s.id, s]));
}

function bookView(b, pubs, onHand, costs, showCost) {
  const publisher = pubs.get(b.publisher_id);
  return {
    id: b.id, version: b.version, title: b.title, author: b.author, isbn: b.isbn, aliases: b.aliases,
    publisher_id: b.publisher_id, publisher: publisher ? publisher.name : '',
    printed_price: b.printed_price, sell_price: b.sell_price, price: sellingPrice(b, publisher),
    on_hand: onHand.get(b.id) || 0, cost: showCost ? costs.get(b.id) : null, status: b.status,
  };
}

// ---- Catalogue ---------------------------------------------------------

function boot(ctx) {
  const { db } = ctx;
  const pubs = publishers(db);
  const onHand = onHandMap(db);
  const costs = bookCosts(db);
  return {
    books: db.all('Books').filter((b) => b.status === 'active').map((b) => bookView(b, pubs, onHand, costs, false)),
    publishers: [...pubs.values()].filter((p) => p.status === 'active')
      .map((p) => ({ id: p.id, name: p.name, commission: p.commission || 0, sell_discount: p.sell_discount || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function list(ctx, query) {
  const { db } = ctx;
  const pubs = publishers(db);
  const onHand = onHandMap(db);
  const costs = bookCosts(db);
  let rows = db.all('Books');
  if (query.publisher_id) rows = rows.filter((b) => b.publisher_id === query.publisher_id);
  if (query.stock === 'in') rows = rows.filter((b) => (onHand.get(b.id) || 0) > 0);
  if (query.stock === 'out') rows = rows.filter((b) => (onHand.get(b.id) || 0) <= 0);
  const items = rows.map((b) => ({ ...bookView(b, pubs, onHand, costs, ctx.can('acc.view_all')), _row: b._row, created_at: b.created_at }));
  // The catalogue reads A to Z.
  const result = page(items, query, (b) => `${b.title} ${b.author} ${b.isbn} ${b.aliases} ${b.publisher}`, (b) => b.title.toLowerCase(), true);
  return { ...result, items: result.items.map(({ _row, created_at: _created, ...b }) => b) };
}

function saveBook(ctx, input) {
  const { db } = ctx;
  const publisher = db.get('Suppliers', input.publisher_id);
  if (!publisher || publisher.kind !== 'publisher') throw fieldError({ publisher_id: { code: 'val.not_found', params: {} } });
  const fields = {
    title: input.title, author: input.author || '', isbn: (input.isbn || '').replace(/[\s-]/g, ''), publisher_id: input.publisher_id,
    printed_price: input.printed_price, sell_price: input.sell_price || 0, aliases: input.aliases || '', status: input.status,
  };
  const clash = db.all('Books').find((b) => b.id !== input.id && fields.isbn && b.isbn === fields.isbn);
  if (clash) throw fieldError({ isbn: { code: 'val.isbn_taken', params: { title: clash.title } } });
  let row;
  if (!input.id) {
    row = db.insert('Books', fields);
  } else {
    const current = db.get('Books', input.id);
    if (!current) throw new AppError('NOT_FOUND');
    if (!input.version) throw fieldError({ version: { code: 'val.required', params: {} } });
    row = db.update('Books', current, fields, input.version);
  }
  return saved(row.id);
}

// ---- Stock ---------------------------------------------------------------

function move(ctx, fields) {
  return ctx.db.insert('Stock_Movements', {
    unit_cost: 0, sale_amount: 0, reason: '', status: 'active', cancel_reason: '', cancelled_by: '', cancelled_at: '', entered_by: ctx.user.id, ...fields,
  });
}

function adjust(ctx, input) {
  const { db } = ctx;
  assertDayOpen(ctx, input.date, 'date');
  const book = db.get('Books', input.book_id);
  if (!book) throw fieldError({ book_id: { code: 'val.not_found', params: {} } });
  db.setReason(input.reason);
  const row = move(ctx, {
    date: input.date, book_id: book.id, kind: input.kind, qty: SIGN[input.kind] * input.qty,
    unit_cost: input.kind === 'returned' ? bookCosts(db).get(book.id) : 0, ref_type: 'adjust', ref_id: '', reason: input.reason,
  });
  return saved(row.id);
}

function moves(ctx, { book_id: bookId }) {
  const { db } = ctx;
  const users = new Map(db.all('Users').map((u) => [u.id, u.display_name]));
  const items = db.all('Stock_Movements').filter((m) => m.book_id === bookId)
    .sort((a, b) => (a.date === b.date ? b._row - a._row : a.date < b.date ? 1 : -1))
    .map((m) => ({
      id: m.id, date: m.date, kind: m.kind, qty: m.qty, sale_amount: m.sale_amount, reason: m.reason, ref_id: m.ref_id,
      status: m.status, cancel_reason: m.cancel_reason, entered_by: users.get(m.entered_by) || '',
      can_cancel: m.status === 'active' && (ctx.can('acc.approve') || m.entered_by === ctx.user.id),
    }));
  return { items };
}

function cancelMove(ctx, { id, reason }) {
  const { db } = ctx;
  const m = db.get('Stock_Movements', id);
  if (!m) throw new AppError('NOT_FOUND');
  if (m.status !== 'active') throw new AppError('CONFLICT', { by: '' });
  if (!ctx.can('acc.approve') && m.entered_by !== ctx.user.id) throw new AppError('FORBIDDEN');
  assertDayOpen(ctx, m.date, 'id');
  db.setReason(reason);
  db.update('Stock_Movements', m, { status: 'cancelled', cancel_reason: reason, cancelled_by: ctx.user.id, cancelled_at: db.nowIso });
  return saved(m.id);
}

// ---- Deliveries ------------------------------------------------------------
// Each line is a title already in the catalogue or a new one (title and
// printed price). A copy's cost is the printed price less the publisher's
// commission unless the challan says otherwise.
//   Damaged copies: sent back (not stocked), kept at full cost, or kept at a
//   lower cost.
//   Against a requisition line: copies beyond what is still expected are kept
//   or sent back; copies short are still expected or not coming.
// A payment made on delivery is a publisher payment, and the delivery charge
// an expense. Customers' special orders for a title are marked arrived.

function checkDelivery(db, input) {
  const fields = {};
  const publisher = db.get('Suppliers', input.publisher_id);
  if (!publisher || publisher.kind !== 'publisher' || publisher.status !== 'active') fields.publisher_id = { code: 'val.not_found', params: {} };
  const req = input.requisition_id ? db.get('Requisitions', input.requisition_id) : null;
  if (input.requisition_id && (!req || req.publisher_id !== input.publisher_id || (req.status !== 'sent' && req.status !== 'part'))) {
    fields.requisition_id = { code: 'val.not_found', params: {} };
  }
  const lines = input.lines || [];
  if (!lines.length) fields.lines = { code: 'val.no_lines', params: {} };
  lines.forEach((l, i) => {
    if (l.book_id) {
      if (!db.get('Books', l.book_id)) fields[`lines.${i}.book_id`] = { code: 'val.not_found', params: {} };
    } else if (!l.title) {
      fields[`lines.${i}.title`] = { code: 'val.required', params: {} };
    }
    if ((l.damaged || 0) > l.qty) fields[`lines.${i}.damaged`] = { code: 'val.more_than_qty', params: {} };
    if (l.damaged_action === 'keep_lower' && (l.damaged_cost === null || l.damaged_cost === undefined)) fields[`lines.${i}.damaged_cost`] = { code: 'val.required', params: {} };
    if (l.req_line && !(req && req.lines.some((x) => x.key === l.req_line))) fields[`lines.${i}.req_line`] = { code: 'val.not_found', params: {} };
  });
  if ((input.paid || 0) > 0 && !input.paid_account_id) fields.paid_account_id = { code: 'val.required', params: {} };
  if ((input.charge || 0) > 0) {
    if (!input.charge_account_id) fields.charge_account_id = { code: 'val.required', params: {} };
    if (!input.charge_category_id) fields.charge_category_id = { code: 'val.required', params: {} };
  }
  if (Object.keys(fields).length) throw fieldError(fields);
  return { publisher, req };
}

const plainEntry = { to_account_id: '', category_id: '', party_id: '', direction: '', covers_up_to: '' };

function saveDelivery(ctx, input) {
  return createDelivery(ctx, input, '');
}

// Used by the delivery form and by an uploaded challan (with its file).
export function createDelivery(ctx, input, fileId) {
  const { db } = ctx;
  assertDayOpen(ctx, input.date, 'date');
  const { publisher, req } = checkDelivery(db, input);
  const cost = supplierCostRule(publisher);
  const id = newId('DLV');
  const reqLines = req ? req.lines.map((l) => ({ ...l })) : [];

  const stored = input.lines.map((l) => {
    const book = l.book_id ? db.get('Books', l.book_id) : db.insert('Books', {
      title: l.title, author: l.author || '', isbn: '', publisher_id: publisher.id, printed_price: l.printed_price, sell_price: 0, aliases: '', status: 'active',
    });
    const unitCost = l.unit_cost || l.unit_cost === 0 ? l.unit_cost : cost(l.printed_price);
    const damaged = l.damaged || 0;
    const damagedAction = damaged ? l.damaged_action || 'return' : '';
    const keptDamaged = damagedAction === 'keep' || damagedAction === 'keep_lower' ? damaged : 0;
    let good = l.qty - damaged;
    let extraReturned = 0;
    let short = 0;
    const reqLine = l.req_line ? reqLines.find((x) => x.key === l.req_line) : null;
    if (reqLine) {
      const expected = Math.max(0, reqLine.qty - (reqLine.received || 0) - (reqLine.cancelled || 0));
      const arrived = good + keptDamaged;
      if (arrived > expected && l.extra_action === 'return') {
        extraReturned = Math.min(good, arrived - expected);
        good -= extraReturned;
      }
      reqLine.received = (reqLine.received || 0) + Math.min(arrived, expected);
      short = Math.max(0, expected - arrived);
      if (short && l.short_action === 'not_coming') reqLine.cancelled = (reqLine.cancelled || 0) + short;
    }
    if (good > 0) move(ctx, { date: input.date, book_id: book.id, kind: 'receive', qty: good, unit_cost: unitCost, ref_type: 'delivery', ref_id: id });
    if (keptDamaged) {
      move(ctx, {
        date: input.date, book_id: book.id, kind: 'receive', qty: keptDamaged, unit_cost: damagedAction === 'keep_lower' ? l.damaged_cost : unitCost,
        ref_type: 'delivery', ref_id: id, reason: damagedAction,
      });
    }
    if (good + keptDamaged > 0) ordersArrived(db, book, good + keptDamaged);
    return {
      book_id: book.id, title: book.title, printed_price: l.printed_price, qty: l.qty, damaged, damaged_action: damagedAction,
      accepted: good + keptDamaged, unit_cost: unitCost, damaged_cost: damagedAction === 'keep_lower' ? l.damaged_cost : null,
      req_line: l.req_line || '', extra_returned: extraReturned, short, short_action: short ? l.short_action || 'expected' : '',
    };
  });
  const total = round(stored.reduce((s, l) => s + (l.accepted - (l.damaged_action === 'keep_lower' ? l.damaged : 0)) * l.unit_cost
    + (l.damaged_action === 'keep_lower' ? l.damaged * l.damaged_cost : 0), 0));

  if (req) {
    const done = reqLines.every((l) => (l.received || 0) + (l.cancelled || 0) >= l.qty);
    db.update('Requisitions', req, { lines: reqLines, status: done ? 'received' : 'part' });
  }

  let paymentId = '';
  if ((input.paid || 0) > 0) {
    paymentId = record(ctx, {
      ...plainEntry, kind: 'publisher_payment', date: input.date, amount: input.paid, account_id: input.paid_account_id,
      party_id: publisher.id, note: '', ref: input.challan || '',
    }, {}, { checkDuplicates: false }).record_id;
  }
  let chargeId = '';
  if ((input.charge || 0) > 0) {
    const category = db.get('Expense_Categories', input.charge_category_id);
    chargeId = record(ctx, {
      ...plainEntry, kind: 'expense', date: input.date, amount: input.charge, account_id: input.charge_account_id,
      category_id: input.charge_category_id, note: input.challan || '', ref: id,
      category_needs_shareholder: Boolean(category && category.needs_shareholder),
    }, {}, { checkDuplicates: false }).record_id;
  }
  db.insert('Deliveries', {
    id, date: input.date, publisher_id: publisher.id, challan: input.challan || '', lines: stored, total_cost: total,
    paid: input.paid || 0, payment_id: paymentId, note: input.note || '', entered_by: ctx.user.id,
    requisition_id: req ? req.id : '', charge: input.charge || 0, charge_id: chargeId, file_id: fileId,
  });
  return saved(id, { total_cost: total, payment_id: paymentId, charge_id: chargeId });
}

function deliveries(ctx, query) {
  const { db } = ctx;
  const pubs = publishers(db);
  const items = db.all('Deliveries').map((d) => ({
    id: d.id, date: d.date, publisher: pubs.has(d.publisher_id) ? pubs.get(d.publisher_id).name : '', challan: d.challan,
    titles: d.lines.length, copies: d.lines.reduce((s, l) => s + l.accepted, 0), total_cost: d.total_cost, paid: d.paid,
    _row: d._row, created_at: d.created_at,
  }));
  const result = page(items, query, (d) => `${d.date} ${d.publisher} ${d.challan} ${d.id}`, (d) => `${d.date}|${d.created_at}`);
  return { ...result, items: result.items.map(({ _row, created_at: _created, ...d }) => d) };
}

function getDelivery(ctx, { id }) {
  const { db } = ctx;
  const d = db.get('Deliveries', id);
  if (!d) throw new AppError('NOT_FOUND');
  const publisher = db.get('Suppliers', d.publisher_id);
  return { ...d, _row: undefined, publisher: publisher ? publisher.name : '' };
}

// ---- Typed sales -------------------------------------------------------------

function saveSales(ctx, input) {
  const { db } = ctx;
  assertDayOpen(ctx, input.date, 'date');
  const fields = {};
  if (!input.lines.length) fields.lines = { code: 'val.no_lines', params: {} };
  input.lines.forEach((l, i) => {
    if (!db.get('Books', l.book_id)) fields[`lines.${i}.book_id`] = { code: 'val.not_found', params: {} };
  });
  if (Object.keys(fields).length) throw fieldError(fields);
  const batch = newId('BSL');
  for (const l of input.lines) {
    move(ctx, { date: input.date, book_id: l.book_id, kind: 'sale', qty: -l.qty, sale_amount: l.amount, ref_type: 'sales', ref_id: batch });
  }
  return saved(batch, { lines: input.lines.length });
}

function salesDay(ctx, { date }) {
  const { db } = ctx;
  const books = new Map(db.all('Books').map((b) => [b.id, b.title]));
  const items = db.all('Stock_Movements').filter((m) => m.kind === 'sale' && m.date === date && m.status === 'active')
    .map((m) => ({ id: m.id, book_id: m.book_id, title: books.get(m.book_id) || '', qty: -m.qty, amount: m.sale_amount }));
  return { date, items, total: round(items.reduce((s, m) => s + m.amount, 0)) };
}

export const BOOK_HANDLERS = {
  'books.boot': boot,
  'books.list': list,
  'books.save': saveBook,
  'books.adjust': adjust,
  'books.moves': moves,
  'books.move.cancel': cancelMove,
  'books.delivery.save': saveDelivery,
  'books.deliveries': deliveries,
  'books.delivery.get': getDelivery,
  'books.sales.save': saveSales,
  'books.sales.day': salesDay,
};
