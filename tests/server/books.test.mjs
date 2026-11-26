// Suppliers, the catalogue, deliveries, stock and typed sales on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

function bookshop() {
  const s = shop();
  const id = (r) => r.data.record_id;
  const sup = (fields) => id(s.call(s.owner, 'setup.supplier.save', { status: 'active', ...fields }));
  // Paid as copies sell: 25% commission to the shop, 10% shop discount to customers.
  s.ids.pathak = sup({ kind: 'publisher', name: 'Pathak Shamabesh', commission: 25, sell_discount: 10, pays_on: 'sale' });
  // Paid on delivery.
  s.ids.prothoma = sup({ kind: 'publisher', name: 'Prothoma', commission: 20, pays_on: 'delivery' });
  s.ids.dairy = sup({ kind: 'vendor', name: 'Milk Vita' });
  s.ids.book = id(s.call(s.owner, 'books.save', { title: 'Padma Nadir Majhi', author: 'Manik', publisher_id: s.ids.pathak, printed_price: 400, status: 'active' }));
  return s;
}

const deliver = (s, token, more = {}) => s.call(token, 'books.delivery.save', {
  date: '2026-11-10', publisher_id: s.ids.pathak, challan: 'CH-1',
  lines: [{ book_id: s.ids.book, printed_price: 400, qty: 10, damaged: 1 }], ...more,
}).data;

test('a title sells at its printed price less the shop discount, and costs printed less commission', () => {
  const s = bookshop();
  deliver(s, s.manager);
  const book = s.call(s.owner, 'books.list', { q: 'padma' }).data.items[0];
  assert.equal(book.price, 360);
  assert.equal(book.cost, 300);
  assert.equal(book.on_hand, 9);
  assert.equal(s.call(s.manager, 'books.list', { q: 'padma' }).data.items[0].cost, null);
});

test('a delivery stocks accepted copies, adds new titles, and records a payment made on delivery', () => {
  const s = bookshop();
  const r = deliver(s, s.owner, {
    lines: [
      { book_id: s.ids.book, printed_price: 400, qty: 5 },
      { title: 'Shesher Kobita', author: 'Rabindranath', printed_price: 200, qty: 4, damaged: 1, unit_cost: 140 },
    ],
    paid: 500, paid_account_id: s.ids.cash,
  });
  assert.equal(r.status, 'saved');
  assert.equal(r.data.total_cost, 5 * 300 + 3 * 140);
  const newTitle = s.call(s.owner, 'books.list', { q: 'shesher' }).data.items[0];
  assert.equal(newTitle.on_hand, 3);
  assert.equal(newTitle.publisher_id, s.ids.pathak);
  const payment = s.call(s.owner, 'money.get', { id: r.data.payment_id }).data.entry;
  assert.equal(payment.kind, 'publisher_payment');
  assert.equal(payment.amount, 500);
});

test('a manager\'s payment on delivery is a request that waits for a shareholder', () => {
  const s = bookshop();
  const r = deliver(s, s.manager, { paid: 100, paid_account_id: s.ids.cash });
  const payment = s.call(s.owner, 'money.get', { id: r.data.payment_id }).data.entry;
  assert.equal(payment.approval, 'waiting');
  assert.deepEqual(payment.wait_reasons.map((w) => w.code), ['approve.why.request']);
});

test('what a publisher is owed: as copies sell, or on delivery less returns', () => {
  const s = bookshop();
  deliver(s, s.owner);
  const owedOf = (id) => s.call(s.owner, 'suppliers.list').data.items.find((x) => x.id === id).owed;
  assert.equal(owedOf(s.ids.pathak), 0);
  s.call(s.manager, 'books.sales.save', { date: '2026-11-12', lines: [{ book_id: s.ids.book, qty: 3, amount: 1080 }] });
  assert.equal(owedOf(s.ids.pathak), 900);

  const pro = s.call(s.owner, 'books.save', { title: 'Lalsalu', publisher_id: s.ids.prothoma, printed_price: 250, status: 'active' }).data.record_id;
  s.call(s.owner, 'books.delivery.save', { date: '2026-11-10', publisher_id: s.ids.prothoma, lines: [{ book_id: pro, printed_price: 250, qty: 8 }] });
  assert.equal(owedOf(s.ids.prothoma), 1600);
  s.call(s.manager, 'books.adjust', { book_id: pro, date: '2026-11-11', kind: 'returned', qty: 2, reason: 'Unsold, sent back' });
  assert.equal(owedOf(s.ids.prothoma), 1200);
});

test('"covers sales up to" is the latest sales day a payment fully settles', () => {
  const s = bookshop();
  deliver(s, s.owner);
  s.call(s.manager, 'books.sales.save', { date: '2026-11-12', lines: [{ book_id: s.ids.book, qty: 2, amount: 720 }] });
  s.call(s.manager, 'books.sales.save', { date: '2026-11-14', lines: [{ book_id: s.ids.book, qty: 1, amount: 360 }] });
  const suggest = (amount) => s.call(s.owner, 'publisher.suggest', { id: s.ids.pathak, amount }).data;
  assert.equal(suggest(500).suggest, '');
  assert.equal(suggest(600).suggest, '2026-11-12');
  assert.equal(suggest(900).suggest, '2026-11-14');
  s.call(s.owner, 'money.save', { kind: 'publisher_payment', date: '2026-11-15', amount: 600, account_id: s.ids.cash, party_id: s.ids.pathak, covers_up_to: '2026-11-12' });
  const after = suggest(300);
  assert.equal(after.owed, 300);
  assert.equal(after.settled_to, '2026-11-12');
  assert.equal(after.suggest, '2026-11-14');
});

test('vendors: owed from purchases on credit, less payments and credit notes; the statement runs', () => {
  const s = bookshop();
  const v = (kind, amount, more = {}) => s.call(s.owner, 'money.save', { kind, date: '2026-11-10', amount, party_id: s.ids.dairy, ...more }).data;
  v('vendor_purchase_credit', 1000, { ref: 'MV-1' });
  v('vendor_payment', 400, { account_id: s.ids.cash });
  v('vendor_credit_note', 50);
  v('vendor_purchase_paid', 300, { account_id: s.ids.cash, ref: 'MV-2' });
  const st = s.call(s.owner, 'supplier.statement', { id: s.ids.dairy }).data;
  assert.deepEqual(st.lines.map((l) => l.owed), [1000, 600, 550]);
  assert.equal(st.supplier.owed, 550);
});

test('D: the same vendor bill number twice is blocked (ignoring case, spaces and punctuation)', () => {
  const s = bookshop();
  const bill = (ref, amount = 700) => s.call(s.manager, 'money.save', { kind: 'vendor_purchase_credit', date: '2026-11-10', amount, party_id: s.ids.dairy, ref }).data;
  const first = bill('INV 77');
  for (const ref of ['inv77', 'INV-77', 'inv/77']) {
    assert.deepEqual(bill(ref).error.fields.ref, { code: 'dup.vendor_bill', params: { id: first.record_id } });
  }
  assert.equal(bill('INV 78', 650).status, 'saved');
});

test('B and C: an expense that names a vendor or publisher offers to switch', () => {
  const s = bookshop();
  const r = s.call(s.manager, 'money.save', { kind: 'expense', date: '2026-11-10', amount: 450, account_id: s.ids.cash, category_id: s.ids.milk, note: 'Paid Milk Vita for the week' }).data;
  assert.equal(r.status, 'needs_input');
  const w = r.prompt.warnings.find((x) => x.code === 'dup.names_vendor');
  assert.equal(w.fix.kind, 'vendor_purchase_paid');
  assert.equal(w.fix.party_id, s.ids.dairy);
  const p = s.call(s.manager, 'money.save', { kind: 'expense', date: '2026-11-10', amount: 451, account_id: s.ids.cash, category_id: s.ids.milk, note: 'pathak shamabesh dues' }).data;
  assert.equal(p.prompt.warnings[0].fix.kind, 'publisher_payment');
});

test('stock changes need a reason; cancelling one restores the stock', () => {
  const s = bookshop();
  deliver(s, s.owner);
  assert.equal(s.call(s.manager, 'books.adjust', { book_id: s.ids.book, date: '2026-11-11', kind: 'damaged', qty: 1, reason: '' }).data.error.fields.reason.code, 'val.required');
  const m = s.call(s.manager, 'books.adjust', { book_id: s.ids.book, date: '2026-11-11', kind: 'damaged', qty: 2, reason: 'Water damage' }).data.record_id;
  assert.equal(s.call(s.owner, 'books.list', { q: 'padma' }).data.items[0].on_hand, 7);
  s.call(s.manager, 'books.move.cancel', { id: m, reason: 'Wrong title' });
  assert.equal(s.call(s.owner, 'books.list', { q: 'padma' }).data.items[0].on_hand, 9);
});

test('suppliers are set up by shareholders; the catalogue reads A to Z', () => {
  const s = bookshop();
  assert.equal(s.call(s.manager, 'setup.supplier.save', { kind: 'vendor', name: 'X', status: 'active' }).error.code, 'FORBIDDEN');
  s.call(s.manager, 'books.save', { title: 'Aranyak', publisher_id: s.ids.pathak, printed_price: 300, status: 'active' });
  assert.deepEqual(s.call(s.manager, 'books.list').data.items.map((b) => b.title), ['Aranyak', 'Padma Nadir Majhi']);
  assert.equal(s.call(s.manager, 'books.list', { stock: 'in' }).data.total, 0);
});
