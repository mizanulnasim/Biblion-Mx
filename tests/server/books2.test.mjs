// Requisitions, deliveries against them, special orders, stock-take and the
// automatic requisition job, on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const today = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);

function bookshop() {
  const s = shop();
  const id = (r) => r.data.record_id;
  s.ids.pathak = id(s.call(s.owner, 'setup.supplier.save', { kind: 'publisher', name: 'Pathak', commission: 25, sell_discount: 10, pays_on: 'sale', status: 'active' }));
  s.ids.book = id(s.call(s.owner, 'books.save', { title: 'Aranyak', publisher_id: s.ids.pathak, printed_price: 400, status: 'active' }));
  s.ids.other = id(s.call(s.owner, 'books.save', { title: 'Lalsalu', publisher_id: s.ids.pathak, printed_price: 200, status: 'active' }));
  s.ids.ship = id(s.call(s.owner, 'setup.category.save', { name: 'Book shipping', area: 'books', status: 'active' }));
  // 10 in stock, 4 sold today.
  s.call(s.owner, 'books.delivery.save', { date: today, publisher_id: s.ids.pathak, lines: [{ book_id: s.ids.book, printed_price: 400, qty: 10 }] });
  s.call(s.manager, 'books.sales.save', { date: today, lines: [{ book_id: s.ids.book, qty: 4, amount: 1440 }] });
  return s;
}

const stock = (s, q) => s.call(s.owner, 'books.list', { q }).data.items[0].on_hand;

function sentRequisition(s) {
  s.call(s.staff, 'books.order.save', { customer_name: 'Mitu', phone: '01711-222333', book_id: s.ids.other, qty: 1 });
  const id = s.call(s.manager, 'books.req.build', { publisher_id: s.ids.pathak }).data.record_id;
  s.call(s.manager, 'books.req.send', { id });
  return s.call(s.manager, 'books.req.get', { id }).data;
}

test('a draft replaces what sold and adds open special orders', () => {
  const s = bookshop();
  s.call(s.staff, 'books.order.save', { customer_name: 'Mitu', phone: '01711-222333', book_id: s.ids.other, qty: 1 });
  s.call(s.staff, 'books.order.save', { customer_name: 'Rana', phone: '01811000000', title: 'Kobi', publisher_id: s.ids.pathak, qty: 2 });
  const id = s.call(s.manager, 'books.req.build', { publisher_id: s.ids.pathak }).data.record_id;
  const req = s.call(s.manager, 'books.req.get', { id }).data;
  assert.equal(req.number, 'RQ-0001');
  assert.deepEqual(req.lines.map((l) => [l.title, l.qty, l.special_order_ids.length]), [['Aranyak', 4, 0], ['Lalsalu', 1, 1], ['Kobi', 2, 1]]);
  assert.deepEqual(s.call(s.manager, 'books.orders', { status: 'open' }).data.items.map((o) => o.status), ['requested', 'requested']);
  assert.equal(s.call(s.manager, 'books.req.build', { publisher_id: s.ids.pathak }).data.error.fields.publisher_id.code, 'val.draft_exists');
});

test('editing a draft: a line taken out sends its special order back to waiting', () => {
  const s = bookshop();
  s.call(s.staff, 'books.order.save', { customer_name: 'Mitu', phone: '01711222333', book_id: s.ids.other, qty: 1 });
  const id = s.call(s.manager, 'books.req.build', { publisher_id: s.ids.pathak }).data.record_id;
  const req = s.call(s.manager, 'books.req.get', { id }).data;
  const aranyak = req.lines.find((l) => l.title === 'Aranyak');
  assert.equal(s.call(s.manager, 'books.req.save', { id, version: req.version, lines: [{ key: aranyak.key, qty: 6 }, { title: 'Nondito Noroke', qty: 2 }] }).data.status, 'saved');
  const after = s.call(s.manager, 'books.req.get', { id }).data;
  assert.deepEqual(after.lines.map((l) => [l.title, l.qty]), [['Aranyak', 6], ['Nondito Noroke', 2]]);
  assert.equal(s.call(s.manager, 'books.orders', { status: 'open' }).data.items[0].status, 'open');
});

test('deliveries against a requisition: short copies expected or not coming, extras kept or sent back', () => {
  const s = bookshop();
  const req = sentRequisition(s);
  const line = req.lines.find((l) => l.title === 'Aranyak');
  const deliver = (qty, more) => s.call(s.manager, 'books.delivery.save', {
    date: today, publisher_id: s.ids.pathak, requisition_id: req.id,
    lines: [{ book_id: s.ids.book, printed_price: 400, qty, req_line: line.key, ...more }],
  }).data;
  assert.equal(deliver(3, { short_action: 'expected' }).status, 'saved');
  let now = s.call(s.manager, 'books.req.get', { id: req.id }).data;
  assert.equal(now.status, 'part');
  assert.equal(now.lines.find((l) => l.key === line.key).remaining, 1);
  // One still expected; three arrive: two extra, sent back.
  deliver(3, { extra_action: 'return' });
  now = s.call(s.manager, 'books.req.get', { id: req.id }).data;
  assert.equal(now.lines.find((l) => l.key === line.key).remaining, 0);
  assert.equal(stock(s, 'aranyak'), 6 + 3 + 1);
  // The other line (Lalsalu, a special order) is not coming: closed by a short.
  const lal = now.lines.find((l) => l.title === 'Lalsalu');
  s.call(s.manager, 'books.delivery.save', { date: today, publisher_id: s.ids.pathak, requisition_id: req.id, lines: [{ book_id: s.ids.other, printed_price: 200, qty: 0 + 1, damaged: 1, req_line: lal.key, short_action: 'not_coming' }] });
  assert.equal(s.call(s.manager, 'books.req.get', { id: req.id }).data.status, 'received');
});

test('damaged copies kept at a lower cost are stocked at that cost; the delivery charge is an expense', () => {
  const s = bookshop();
  const r = s.call(s.owner, 'books.delivery.save', {
    date: today, publisher_id: s.ids.pathak,
    lines: [{ book_id: s.ids.other, printed_price: 200, qty: 5, damaged: 2, damaged_action: 'keep_lower', damaged_cost: 50 }],
    charge: 120, charge_account_id: s.ids.cash, charge_category_id: s.ids.ship,
  }).data;
  assert.equal(r.data.total_cost, 3 * 150 + 2 * 50);
  assert.equal(stock(s, 'lalsalu'), 5);
  const charge = s.call(s.owner, 'money.get', { id: r.data.charge_id }).data.entry;
  assert.deepEqual([charge.kind, charge.amount, charge.category], ['expense', 120, 'Book shipping']);
});

test('special orders arrive with the delivery and are followed up; staff take orders but can\'t look them up', () => {
  const s = bookshop();
  const req = sentRequisition(s);
  assert.equal(s.call(s.staff, 'books.orders').error.code, 'FORBIDDEN');
  const lal = req.lines.find((l) => l.title === 'Lalsalu');
  s.call(s.manager, 'books.delivery.save', { date: today, publisher_id: s.ids.pathak, requisition_id: req.id, lines: [{ book_id: s.ids.other, printed_price: 200, qty: 1, req_line: lal.key }] });
  const order = s.call(s.manager, 'books.orders', { status: 'arrived' }).data.items[0];
  assert.deepEqual([order.customer_name, order.phone, order.status], ['Mitu', '01711222333', 'arrived']);
  assert.equal(s.call(s.manager, 'books.order.act', { id: order.id, act: 'told' }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'books.order.act', { id: order.id, act: 'cancel' }).data.error.fields.reason.code, 'val.required');
  assert.equal(s.call(s.manager, 'books.order.act', { id: order.id, act: 'collected' }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'books.orders', { status: 'done' }).data.total, 1);
});

test('closing a requisition sends its waiting special orders back for the next one', () => {
  const s = bookshop();
  const req = sentRequisition(s);
  assert.equal(s.call(s.manager, 'books.req.close', { id: req.id, reason: 'Out of print' }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'books.orders', { status: 'open' }).data.items[0].status, 'open');
  assert.equal(s.call(s.manager, 'books.req.get', { id: req.id }).data.status, 'closed');
});

test('stock-take: one at a time, counts over several sittings, applied as stock changes', () => {
  const s = bookshop();
  const id = s.call(s.manager, 'books.stocktake.start', {}).data.record_id;
  assert.equal(s.call(s.manager, 'books.stocktake.start', {}).data.error.fields.publisher_id.code, 'val.stocktake_open');
  s.call(s.manager, 'books.stocktake.save', { id, counts: [{ book_id: s.ids.book, counted: 5 }] });
  const take = s.call(s.manager, 'books.stocktake').data.take;
  assert.deepEqual(take.lines.map((l) => [l.title, l.expected, l.counted]), [['Aranyak', 6, 5], ['Lalsalu', 0, null]]);
  const r = s.call(s.manager, 'books.stocktake.apply', { id }).data;
  assert.deepEqual(r.data, { counted: 1, changed: 1, more: 0, fewer: 1 });
  assert.equal(stock(s, 'aranyak'), 5);
  assert.equal(s.call(s.manager, 'books.stocktake').data.take, null);
});

test('the hourly job drafts requisitions once per week when set to', () => {
  const s = bookshop();
  // The job's result comes from the server's sandbox; compare it as plain data.
  const job = () => JSON.parse(JSON.stringify(s.server.job()));
  assert.deepEqual(job(), { req_auto: 0 });
  s.call(s.owner, 'settings.books.save', { req_auto: 'weekly', req_days: 30 });
  assert.deepEqual(job(), { req_auto: 1 });
  assert.deepEqual(job(), { req_auto: 0 });
  const drafts = s.call(s.manager, 'books.reqs', { status: 'draft' }).data.items;
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].entered_by, '');
});
