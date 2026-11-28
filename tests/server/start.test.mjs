// Getting started on the real server bundle: the start date, the checklist,
// shareholders' opening figures, and the opening book stock approved by
// someone other than whoever counted it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const step = (s, id) => s.call(s.owner, 'start.view').data.steps.find((x) => x.id === id);

function withBooks() {
  const s = shop();
  const id = (r) => r.data.record_id;
  s.ids.pub = id(s.call(s.owner, 'setup.supplier.save', { kind: 'publisher', name: 'Sheba Prokash', commission: 25, sell_discount: 0, pays_on: 'delivery', status: 'active' }));
  s.ids.book = id(s.call(s.owner, 'books.save', { title: 'Nodir Gaan', publisher_id: s.ids.pub, printed_price: 400, status: 'active' }));
  s.call(s.owner, 'users.save', { display_name: 'Second owner', username: 'owner2', role_id: 'ROL-OWNER', status: 'active', password: 'owner2-pass' });
  s.owner2 = s.call(null, 'auth.login', { username: 'owner2', password: 'owner2-pass' }).data.data.token;
  return s;
}

test('the checklist: the start date, steps ticked by hand, and only for shareholders', () => {
  const s = shop();
  assert.equal(s.call(s.manager, 'start.view').error.code, 'FORBIDDEN');
  const first = s.call(s.owner, 'start.view').data;
  assert.equal(first.steps.length, 9);
  assert.equal(first.done, 0);
  // The shop's accounts already have one opening balance (the drawer).
  assert.deepEqual(step(s, 'accounts').info, { count: 1 });
  assert.deepEqual(step(s, 'dues').info, { count: 1 });
  s.call(s.owner, 'start.date.save', { start_date: '2026-11-11' });
  assert.equal(step(s, 'date').done, true);
  const tick = (who, name, done) => s.call(who, 'steps.tick', { list: 'start', ref: '', step: name, done });
  tick(s.owner, 'accounts', true);
  assert.deepEqual([step(s, 'accounts').done, step(s, 'accounts').by], [true, 'Owner']);
  tick(s.owner, 'accounts', false);
  assert.equal(step(s, 'accounts').done, false);
  // Steps the app sees for itself can't be ticked; nor can others.
  assert.equal(tick(s.owner, 'stock', true).data.error.code, 'NOT_FOUND');
  assert.equal(tick(s.manager, 'accounts', true).data.error.code, 'FORBIDDEN');
});

test('shareholders\' opening figures and the cash they hold count in their account', () => {
  const s = shop();
  const karim = s.call(s.owner, 'setup.money').data.shareholders.find((x) => x.id === s.ids.karim);
  s.call(s.owner, 'setup.shareholder.save', { ...karim, opening_owed: 5000, opening_owes: 500 });
  // The shop's cash Karim holds: an account held by him, Tk 2,000 then.
  assert.equal(s.call(s.owner, 'setup.account.save', { name: 'Held by Karim', kind: 'owner', opening: 2000, status: 'active' }).data.error.fields.shareholder_id.code, 'val.required');
  assert.equal(s.call(s.owner, 'setup.account.save', { name: 'Spare bank', kind: 'bank', shareholder_id: s.ids.karim, status: 'active' }).data.error.fields.shareholder_id.code, 'val.holder_owner_only');
  s.call(s.owner, 'setup.account.save', { name: 'Held by Karim', kind: 'owner', opening: 2000, shareholder_id: s.ids.karim, status: 'active' });
  const st = s.call(s.owner, 'shareholders.view').data.statements.find((x) => x.id === s.ids.karim);
  assert.equal(st.owed_to_them, 5000);
  assert.equal(st.owes_business, 2500);
  assert.equal(st.settle, 2500);
  assert.equal(step(s, 'shareholders').info.count, 1);
});

test('opening stock: counted, sent, approved by someone else, dated the start date', () => {
  const s = withBooks();
  // The start date comes first.
  assert.equal(s.call(s.manager, 'books.stocktake.start', { opening: true }).data.error.fields.opening.code, 'val.start_date_first');
  s.call(s.owner, 'start.date.save', { start_date: '2026-11-11' });
  const id = s.call(s.manager, 'books.stocktake.start', { opening: true }).data.record_id;
  // Nothing counted: nothing to send.
  assert.equal(s.call(s.manager, 'books.stocktake.apply', { id }).data.error.fields.id.code, 'val.no_lines');
  s.call(s.manager, 'books.stocktake.save', { id, counts: [{ book_id: s.ids.book, counted: 7 }] });
  assert.equal(s.call(s.manager, 'books.stocktake.apply', { id }).data.data.waiting, true);
  assert.equal(step(s, 'stock').info.waiting, true);
  // Waiting: no stock yet, and it can't be changed.
  assert.equal(s.call(s.owner, 'books.list', {}).data.items[0].on_hand, 0);
  assert.equal(s.call(s.manager, 'books.stocktake.save', { id, counts: [{ book_id: s.ids.book, counted: 8 }] }).data.error.code, 'CONFLICT');
  // A manager can't approve; sent back with a reason, it opens again.
  assert.equal(s.call(s.manager, 'books.opening.decide', { id, decision: 'approve' }).error.code, 'FORBIDDEN');
  assert.equal(s.call(s.owner, 'books.opening.decide', { id, decision: 'send_back' }).data.error.fields.reason.code, 'val.required');
  s.call(s.owner, 'books.opening.decide', { id, decision: 'send_back', reason: 'Recount the top shelf' });
  assert.equal(s.call(s.manager, 'books.stocktake').data.take.sent_back_reason, 'Recount the top shelf');
  // The owner recounts and sends it: now only the second owner may approve.
  s.call(s.owner, 'books.stocktake.save', { id, counts: [{ book_id: s.ids.book, counted: 8 }] });
  s.call(s.owner, 'books.stocktake.apply', { id });
  assert.equal(s.call(s.owner, 'books.stocktake').data.take.can_decide, false);
  assert.equal(s.call(s.owner, 'books.opening.decide', { id, decision: 'approve' }).data.error.code, 'OWN_ENTRY');
  assert.equal(s.call(s.owner2, 'books.stocktake').data.take.can_decide, true);
  const r = s.call(s.owner2, 'books.opening.decide', { id, decision: 'approve' }).data;
  assert.deepEqual(r.data, { counted: 1, changed: 1, more: 8, fewer: 0 });
  assert.equal(s.call(s.owner, 'books.list', {}).data.items[0].on_hand, 8);
  const move = s.call(s.owner, 'books.moves', { book_id: s.ids.book }).data.items[0];
  assert.deepEqual([move.date, move.kind, move.qty], ['2026-11-11', 'opening', 8]);
  // Its cost is the publisher's rule (400 less 25%), and it owes them nothing.
  assert.equal(s.call(s.owner, 'books.list', {}).data.items[0].cost, 300);
  assert.equal(s.call(s.owner, 'suppliers.list', {}).data.items.find((x) => x.id === s.ids.pub).owed, 0);
  assert.equal(step(s, 'stock').done, true);
  // Once only, and the start date is now fixed.
  assert.equal(s.call(s.manager, 'books.stocktake.start', { opening: true }).data.error.fields.opening.code, 'val.opening_done');
  assert.equal(s.call(s.owner, 'start.date.save', { start_date: '2026-11-01' }).data.error.fields.start_date.code, 'val.start_date_stock');
});
