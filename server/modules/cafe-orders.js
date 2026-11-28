// Café orders: one workflow for stock and supplies.
//   1. A draft suggests quantities from recent use, for the days the order
//      buys for (never past an item's shelf life).
//   2. A quantity changed from the suggestion needs a reason. A supply's
//      on-hand check is recorded and the suggestion follows it.
//   3. Submitted: final for a manager, or a shareholder confirms (a setting).
//   4. Sent as text (WhatsApp) from the phone.
//   5. One or more bills are entered: each is a vendor purchase, and its
//      items come in as batches with expiry dates.
//   6. The order is part bought or bought, or the rest is closed with a reason.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { coverDays, dailyUse, suggestQty } from '../../shared/cafe/forecast.js';
import { nextNumber } from '../store/db.js';
import { page } from '../kernel/paging.js';
import { setting } from '../kernel/settings.js';
import { record } from './money.js';
import { onHand, putCount, recount } from './cafe.js';
import { dhakaDate } from './requisitions.js';

const DAY_MS = 86400000;
const USE_WINDOW = 28;
const fieldError = (fields) => new AppError('VALIDATION', {}, fields);
const round = (n) => Math.round(n * 100) / 100;

function suggestion(db, item, cover, stock) {
  const history = db.all('Cafe_Counts').filter((c) => c.item_id === item.id).map((c) => ({ date: c.date, used: c.used, days: c.days }));
  const daily = dailyUse(history, dhakaDate(db.now), USE_WINDOW, setting(db, 'cafe.min_history_days'));
  return suggestQty(item, daily, stock, coverDays(item, cover));
}

function create(ctx, { vendor_id: vendorId, cover }) {
  const { db } = ctx;
  if (vendorId) {
    const v = db.get('Suppliers', vendorId);
    if (!v || v.kind !== 'vendor') throw fieldError({ vendor_id: { code: 'val.not_found', params: {} } });
  }
  const lines = db.all('Cafe_Items')
    .filter((i) => i.status === 'active' && (!vendorId || i.vendor_id === vendorId))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'stock' ? -1 : 1))
    .map((item) => {
      const stock = onHand(db, item.id);
      const suggested = suggestion(db, item, cover, stock);
      return { item_id: item.id, name: item.name, unit: item.unit, kind: item.kind, on_hand: stock, suggested, qty: suggested || 0, reason: '', bought: 0 };
    });
  const row = db.insert('Cafe_Orders', {
    number: nextNumber(db.all('Cafe_Orders'), 'CO'), date: dhakaDate(db.now), vendor_id: vendorId || '', cover, status: 'draft',
    lines, note: '', entry_ids: [], approved_by: '', approved_at: '', closed_reason: '', entered_by: ctx.user.id,
  });
  return saved(row.id);
}

function openOrder(db, id, states) {
  const o = db.get('Cafe_Orders', id);
  if (!o) throw new AppError('NOT_FOUND');
  if (!states.includes(o.status)) throw new AppError('CONFLICT', { by: '' });
  return o;
}

function save(ctx, input) {
  const { db } = ctx;
  const o = openOrder(db, input.id, ['draft']);
  const fields = {};
  const today = dhakaDate(db.now);
  const lines = input.lines.map((l, i) => {
    const old = o.lines.find((x) => x.item_id === l.item_id);
    const item = db.get('Cafe_Items', l.item_id);
    if (!old || !item) {
      fields[`lines.${i}.item_id`] = { code: 'val.not_found', params: {} };
      return null;
    }
    // A supply's on-hand check counts like a count, and the suggestion follows it.
    let stock = old.on_hand;
    let suggested = old.suggested;
    if (item.kind === 'supply' && l.on_hand !== null && l.on_hand !== undefined && l.on_hand !== old.on_hand) {
      putCount(db, ctx.user.id, today, { item_id: item.id, counted: l.on_hand });
      stock = l.on_hand;
      suggested = suggestion(db, item, o.cover, stock);
    }
    const changed = suggested !== null && l.qty !== suggested;
    if (changed && !l.reason) fields[`lines.${i}.reason`] = { code: 'val.reason_changed', params: { suggested } };
    return { ...old, on_hand: stock, suggested, qty: l.qty, reason: changed ? l.reason : '' };
  });
  if (Object.keys(fields).length) throw fieldError(fields);
  db.update('Cafe_Orders', o, { lines, note: input.note || '' }, input.version);
  return saved(o.id);
}

function submit(ctx, { id }) {
  const { db } = ctx;
  const o = openOrder(db, id, ['draft']);
  const lines = o.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw fieldError({ lines: { code: 'val.no_lines', params: {} } });
  const final = ctx.level >= 3 || setting(db, 'approve.cafe_order') !== 'shareholder';
  db.update('Cafe_Orders', o, {
    lines, status: final ? 'approved' : 'waiting',
    approved_by: final ? ctx.user.id : '', approved_at: final ? db.nowIso : '',
  });
  return saved(o.id, { status: final ? 'approved' : 'waiting' });
}

function approve(ctx, { id }) {
  const { db } = ctx;
  const o = openOrder(db, id, ['waiting']);
  if (o.entered_by === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (ctx.level < 3) throw new AppError('FORBIDDEN');
  db.update('Cafe_Orders', o, { status: 'approved', approved_by: ctx.user.id, approved_at: db.nowIso });
  return saved(o.id);
}

// A bill for (part of) the order: a vendor purchase, and the items in as
// batches. A possible duplicate bill asks for a reason, like any money entry.
function receive(ctx, input) {
  const { db } = ctx;
  const o = openOrder(db, input.id, ['approved', 'part']);
  const vendor = db.get('Suppliers', input.vendor_id);
  const fields = {};
  if (!vendor || vendor.kind !== 'vendor') fields.vendor_id = { code: 'val.not_found', params: {} };
  if (input.paid === 'now' && !input.account_id) fields.account_id = { code: 'val.required', params: {} };
  if (!input.lines.length) fields.lines = { code: 'val.no_lines', params: {} };
  input.lines.forEach((l, i) => {
    if (!o.lines.some((x) => x.item_id === l.item_id)) fields[`lines.${i}.item_id`] = { code: 'val.not_found', params: {} };
  });
  if (Object.keys(fields).length) throw fieldError(fields);
  const amount = round(input.lines.reduce((s, l) => s + l.qty * l.cost, 0));
  const reply = record(ctx, {
    kind: input.paid === 'now' ? 'vendor_purchase_paid' : 'vendor_purchase_credit', date: input.date, amount,
    account_id: input.paid === 'now' ? input.account_id : '', to_account_id: '', category_id: '', party_id: vendor.id,
    direction: '', note: o.number, ref: input.bill_no || '', covers_up_to: '',
  }, input);
  if (reply.status !== 'saved') return reply;
  for (const l of input.lines) {
    const item = db.get('Cafe_Items', l.item_id);
    const expiry = l.expiry || (item.shelf_life_days ? new Date(Date.parse(`${input.date}T00:00:00Z`) + item.shelf_life_days * DAY_MS).toISOString().slice(0, 10) : '');
    db.insert('Cafe_Batches', { item_id: item.id, received_date: input.date, expiry_date: expiry, qty: l.qty, unit_cost: l.cost, order_id: o.id, entry_id: reply.record_id });
    if (l.cost) db.update('Cafe_Items', item, { unit_cost: l.cost });
    recount(db, item.id);
  }
  const lines = o.lines.map((x) => ({ ...x, bought: round((x.bought || 0) + input.lines.filter((l) => l.item_id === x.item_id).reduce((s, l) => s + l.qty, 0)) }));
  const done = lines.every((x) => x.bought >= x.qty);
  db.update('Cafe_Orders', o, { lines, status: done ? 'bought' : 'part', entry_ids: [...o.entry_ids, reply.record_id] });
  return saved(o.id, { entry_id: reply.record_id, approval: reply.data.approval, amount });
}

function close(ctx, { id, reason }) {
  const { db } = ctx;
  const o = openOrder(db, id, ['approved', 'part', 'waiting', 'draft']);
  db.setReason(reason);
  db.update('Cafe_Orders', o, { status: 'closed', closed_reason: reason });
  return saved(o.id);
}

function view(db, o) {
  const vendor = o.vendor_id ? db.get('Suppliers', o.vendor_id) : null;
  const users = new Map(db.all('Users').map((u) => [u.id, u.display_name]));
  return {
    id: o.id, version: o.version, number: o.number, date: o.date, vendor_id: o.vendor_id, vendor: vendor ? vendor.name : '',
    cover: o.cover, status: o.status, lines: o.lines, note: o.note, entry_ids: o.entry_ids, closed_reason: o.closed_reason,
    approved_by: users.get(o.approved_by) || '', entered_by: users.get(o.entered_by) || '', entered_by_id: o.entered_by,
  };
}

function list(ctx, query) {
  const { db } = ctx;
  let rows = db.all('Cafe_Orders');
  if (query.status) rows = rows.filter((o) => o.status === query.status);
  const items = rows.map((o) => ({ ...view(db, o), lines: undefined, count: o.lines.filter((l) => l.qty > 0).length, _row: o._row, created_at: o.created_at }));
  const result = page(items, query, (o) => `${o.number} ${o.vendor} ${o.status}`, (o) => `${o.date}|${o.created_at}`);
  return { ...result, items: result.items.map(({ _row, created_at: _c, ...o }) => o) };
}

function get(ctx, { id }) {
  const o = ctx.db.get('Cafe_Orders', id);
  if (!o) throw new AppError('NOT_FOUND');
  return view(ctx.db, o);
}

export const CAFE_ORDER_HANDLERS = {
  'cafe.orders': list,
  'cafe.order.get': get,
  'cafe.order.new': create,
  'cafe.order.save': save,
  'cafe.order.submit': submit,
  'cafe.order.approve': approve,
  'cafe.order.receive': receive,
  'cafe.order.close': close,
};
