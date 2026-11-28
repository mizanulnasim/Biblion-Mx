// The café on the real server bundle: items, counts, orders, bills, expiry.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop, setSettings } from './shop.mjs';

const day = (offset) => new Date(Date.now() + 6 * 3600000 + offset * 86400000).toISOString().slice(0, 10);

function cafe() {
  const s = shop();
  s.ids.dairy = s.call(s.owner, 'setup.supplier.save', { kind: 'vendor', name: 'Milk Vita', status: 'active' }).data.record_id;
  s.call(s.owner, 'cafe.starter.add', { keys: [{ key: 'milk' }, { key: 'sugar' }] });
  const items = s.call(s.manager, 'cafe.items').data.items;
  s.ids.milk_item = items.find((i) => i.name === 'Milk').id;
  s.ids.sugar_item = items.find((i) => i.name === 'Sugar').id;
  const milk = items.find((i) => i.name === 'Milk');
  s.call(s.owner, 'cafe.item.save', { ...milk, vendor_id: s.ids.dairy, lead_days: 1, order_multiple: 1, min_order: 0 });
  return s;
}

const count = (s, who, date, lines) => s.call(who, 'cafe.count.save', { date, lines }).data;

test('the checklist adds common items once; staff count but don\'t set up', () => {
  const s = cafe();
  assert.equal(s.call(s.owner, 'cafe.starter.add', { keys: [{ key: 'milk' }, { key: 'eggs' }] }).data.data.added, 1);
  const items = s.call(s.staff, 'cafe.count.get', { date: day(0) }).data.lines.map((l) => [l.name, l.name_bn]);
  assert.deepEqual(items, [['Eggs', 'ডিম'], ['Milk', 'দুধ']]);
  assert.equal(s.call(s.staff, 'cafe.item.save', { name: 'X', kind: 'stock', unit: 'kg', status: 'active' }).error.code, 'FORBIDDEN');
});

test('use is worked out between counts, and an earlier correction flows into later days', () => {
  const s = cafe();
  count(s, s.staff, day(-2), [{ item_id: s.ids.milk_item, counted: 10 }]);
  count(s, s.staff, day(-1), [{ item_id: s.ids.milk_item, counted: 7, wasted: 1, waste_reason: 'Spilled' }]);
  assert.equal(s.call(s.staff, 'cafe.count.get', { date: day(-1) }).data.lines.find((l) => l.name === 'Milk').used, 2);
  count(s, s.staff, day(-2), [{ item_id: s.ids.milk_item, counted: 12 }]);
  assert.equal(s.call(s.staff, 'cafe.count.get', { date: day(-1) }).data.lines.find((l) => l.name === 'Milk').used, 4);
  const noReason = count(s, s.staff, day(0), [{ item_id: s.ids.milk_item, counted: 5, wasted: 1 }]);
  assert.equal(noReason.error.fields['lines.0.waste_reason'].code, 'val.waste_reason');
});

function history(s) {
  // 15 days of steady use: 5 litres a day, nothing received (counts fall by 5).
  for (let i = 15; i >= 1; i--) count(s, s.staff, day(-i), [{ item_id: s.ids.milk_item, counted: 100 - (15 - i) * 5 }]);
}

test('an order suggests from use; a changed quantity needs a reason; approval follows the setting', () => {
  const s = cafe();
  history(s);
  const id = s.call(s.manager, 'cafe.order.new', { vendor_id: s.ids.dairy, cover: '7' }).data.record_id;
  let o = s.call(s.manager, 'cafe.order.get', { id }).data;
  const line = o.lines.find((l) => l.name === 'Milk');
  // On hand 30; milk keeps 3 days, so the order buys for 3 days, plus 1 day's lead: 5 × 4 − 30 → nothing.
  assert.deepEqual([line.on_hand, line.suggested], [30, 0]);
  const bad = s.call(s.manager, 'cafe.order.save', { id, version: o.version, lines: [{ item_id: line.item_id, qty: 12 }] }).data;
  assert.deepEqual(bad.error.fields['lines.0.reason'], { code: 'val.reason_changed', params: { suggested: 0 } });
  assert.equal(s.call(s.manager, 'cafe.order.save', { id, version: o.version, lines: [{ item_id: line.item_id, qty: 12, reason: 'Event on Friday' }] }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'cafe.order.submit', { id }).data.data.status, 'approved');
  o = s.call(s.manager, 'cafe.order.get', { id }).data;
  assert.deepEqual(o.lines.map((l) => [l.name, l.qty, l.reason]), [['Milk', 12, 'Event on Friday']]);
});

test('a supply\'s on-hand check is recorded and the suggestion follows it', () => {
  const s = cafe();
  const id = s.call(s.manager, 'cafe.order.new', { cover: '30' }).data.record_id;
  const o = s.call(s.manager, 'cafe.order.get', { id }).data;
  const sugar = o.lines.find((l) => l.name === 'Sugar');
  assert.equal(sugar.suggested, null);
  s.call(s.manager, 'cafe.order.save', { id, version: o.version, lines: [{ item_id: sugar.item_id, on_hand: 4, qty: 10 }] });
  assert.equal(s.call(s.manager, 'cafe.order.get', { id }).data.lines.find((l) => l.name === 'Sugar').on_hand, 4);
});

test('bills: a vendor purchase, batches with expiry, part then fully bought; expiry is listed oldest first', () => {
  const s = cafe();
  const id = s.call(s.manager, 'cafe.order.new', { vendor_id: s.ids.dairy, cover: '7' }).data.record_id;
  let o = s.call(s.manager, 'cafe.order.get', { id }).data;
  const milk = o.lines.find((l) => l.name === 'Milk');
  s.call(s.manager, 'cafe.order.save', { id, version: o.version, lines: [{ item_id: milk.item_id, qty: 20, reason: 'Opening stock' }] });
  s.call(s.manager, 'cafe.order.submit', { id });
  const bill = (qty, more) => s.call(s.manager, 'cafe.order.receive', {
    id, date: day(0), vendor_id: s.ids.dairy, paid: 'now', account_id: s.ids.cash, lines: [{ item_id: milk.item_id, qty, cost: 90 }], ...more,
  }).data;
  const first = bill(8, { bill_no: 'MV-1', lines: [{ item_id: milk.item_id, qty: 8, cost: 90, expiry: day(1) }] });
  assert.equal(first.status, 'saved');
  assert.equal(first.data.amount, 720);
  const entry = s.call(s.owner, 'money.get', { id: first.data.entry_id }).data.entry;
  assert.deepEqual([entry.kind, entry.amount, entry.party], ['vendor_purchase_paid', 720, 'Milk Vita']);
  assert.equal(s.call(s.manager, 'cafe.order.get', { id }).data.status, 'part');
  // The same bill number again is refused, like any vendor bill.
  assert.equal(bill(12, { bill_no: 'mv 1' }).error.fields.ref.code, 'dup.vendor_bill');
  bill(12, { bill_no: 'MV-2' });
  o = s.call(s.manager, 'cafe.order.get', { id }).data;
  assert.deepEqual([o.status, o.lines[0].bought], ['bought', 20]);
  // 8 expire tomorrow, 12 in 3 days (milk's shelf life); tomorrow is within the warning.
  let soon = s.call(s.manager, 'cafe.expiry').data.items;
  assert.deepEqual(soon.map((x) => [x.left, x.in_days]), [[8, 1]]);
  // A count tomorrow: 11 left, so 9 used; the older batch goes first.
  count(s, s.staff, day(1), [{ item_id: milk.item_id, counted: 11 }]);
  soon = s.call(s.manager, 'cafe.expiry').data.items;
  assert.deepEqual(soon, []);
});

test('a manager\'s order waits when a shareholder must confirm; nobody approves their own', () => {
  const s = cafe();
  setSettings(s, 'cafe', { 'approve.cafe_order': 'shareholder' });
  const id = s.call(s.manager, 'cafe.order.new', { cover: '7' }).data.record_id;
  const o = s.call(s.manager, 'cafe.order.get', { id }).data;
  s.call(s.manager, 'cafe.order.save', { id, version: o.version, lines: o.lines.map((l) => ({ item_id: l.item_id, qty: 5, reason: 'Opening stock' })) });
  assert.equal(s.call(s.manager, 'cafe.order.submit', { id }).data.data.status, 'waiting');
  assert.equal(s.call(s.manager, 'cafe.order.approve', { id }).data.error.code, 'OWN_ENTRY');
  assert.equal(s.call(s.owner, 'cafe.order.approve', { id }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'cafe.order.close', { id, reason: 'Bought elsewhere' }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'cafe.order.get', { id }).data.status, 'closed');
});

test('day closing asks for the café count', () => {
  const s = cafe();
  const step = () => s.call(s.manager, 'closing.day', { date: day(0) }).data.steps.find((x) => x.id === 'cafe').state;
  assert.equal(step(), 'warn');
  count(s, s.staff, day(0), [{ item_id: s.ids.milk_item, counted: 3 }]);
  assert.equal(step(), 'done');
});
