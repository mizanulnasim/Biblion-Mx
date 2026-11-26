// Uploads on the real server bundle, with the stand-in for Drive's text reading.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');

function withSuppliers() {
  const s = shop();
  const id = (r) => r.data.record_id;
  s.ids.dairy = id(s.call(s.owner, 'setup.supplier.save', { kind: 'vendor', name: 'Milk Vita', status: 'active' }));
  s.ids.pathak = id(s.call(s.owner, 'setup.supplier.save', { kind: 'publisher', name: 'Pathak', commission: 25, pays_on: 'sale', status: 'active' }));
  s.ids.book = id(s.call(s.owner, 'books.save', { title: 'Padma Nadir Majhi', publisher_id: s.ids.pathak, printed_price: 400, status: 'active' }));
  return s;
}

// A photo whose text the stand-in "reads".
function photo(s, name, text) {
  s.state.ocr[name] = text;
  return s.call(s.manager, 'intake.upload', { name, mime: 'image/jpeg', data: b64(`jpeg bytes of ${name}`) }).data;
}

const BILL = 'Milk Vita Dairy\nMemo No: 5521\nDate 21/11/2026\nMilk 10 x 90 = 900\nCurd 2 x 120 = 240\nGrand Total 1140\nCOD';

test('a photo is kept, read, and its kind guessed; the same file twice is refused', () => {
  const s = withSuppliers();
  const up = photo(s, 'bill.jpg', BILL);
  assert.equal(up.status, 'saved');
  assert.equal(up.data.guess, 'vendor_bill');
  const doc = s.call(s.manager, 'intake.get', { id: up.record_id }).data;
  assert.deepEqual([doc.status, doc.file.mime, doc.text.includes('Memo No')], ['needs_kind', 'image/jpeg', true]);
  const again = s.call(s.manager, 'intake.upload', { name: 'copy.jpg', mime: 'image/jpeg', data: b64('jpeg bytes of bill.jpg') }).data;
  assert.deepEqual(again.error.fields.data, { code: 'val.file_exists', params: { id: up.record_id } });
});

test('a vendor bill becomes a purchase paid now; Confirm files the document on it', () => {
  const s = withSuppliers();
  const id = photo(s, 'bill.jpg', BILL).record_id;
  s.call(s.manager, 'intake.kind', { id, kind: 'vendor_bill' });
  const { proposal } = s.call(s.manager, 'intake.get', { id }).data;
  assert.deepEqual(proposal.entry, { kind: 'vendor_purchase_paid', date: '2026-11-21', amount: 1140, party_id: s.ids.dairy, ref: '5521' });
  assert.equal(proposal.paid, 'now');
  assert.deepEqual(proposal.unsure, []);
  const r = s.call(s.manager, 'intake.confirm', { id, ...proposal.entry, account_id: s.ids.cash }).data;
  assert.equal(r.status, 'saved');
  const entryId = r.data.records[0].id;
  const entry = s.call(s.owner, 'money.get', { id: entryId }).data.entry;
  assert.ok(entry.file_id);
  const file = s.call(s.manager, 'files.get', { id: entry.file_id }).data;
  assert.equal(Buffer.from(file.data, 'base64').toString(), 'jpeg bytes of bill.jpg');
  assert.equal(s.call(s.manager, 'intake.get', { id }).data.status, 'confirmed');
});

test('a duplicate asks for a reason, and then waits for a shareholder; or the document is filed on the earlier entry', () => {
  const s = withSuppliers();
  s.call(s.manager, 'money.save', { kind: 'expense', date: '2026-11-20', amount: 600, account_id: s.ids.cash, category_id: s.ids.milk });
  const id = photo(s, 'receipt.jpg', 'Receipt\n20/11/2026\nMilk\nTotal 600').record_id;
  s.call(s.manager, 'intake.kind', { id, kind: 'expense' });
  const entry = { id, kind: 'expense', date: '2026-11-20', amount: 600, account_id: s.ids.cash, category_id: s.ids.milk };
  const ask = s.call(s.manager, 'intake.confirm', entry).data;
  assert.equal(ask.status, 'needs_input');
  const earlier = ask.prompt.warnings[0].existing[0].id;
  // Filed on the earlier entry instead.
  assert.equal(s.call(s.manager, 'intake.attach', { id, record_id: earlier }).data.status, 'saved');
  assert.ok(s.call(s.owner, 'money.get', { id: earlier }).data.entry.file_id);
  assert.equal(s.call(s.manager, 'intake.get', { id }).data.status, 'attached');
});

test('a challan becomes a delivery, titles matched; the same challan twice is refused', () => {
  const s = withSuppliers();
  const text = 'Pathak\nChallan No: 77\n21/11/2026\nPadma Nadir Majhi 2 400 800\nShesher Kobita 3 200 600\nTotal 1050';
  const id = photo(s, 'challan.jpg', text).record_id;
  s.call(s.manager, 'intake.kind', { id, kind: 'book_delivery' });
  const { delivery, unsure } = s.call(s.manager, 'intake.get', { id }).data.proposal;
  assert.deepEqual(delivery.lines.map((l) => [l.title, l.qty, l.printed_price, l.matched]), [['Padma Nadir Majhi', 2, 400, true], ['Shesher Kobita', 3, 200, false]]);
  assert.equal(delivery.publisher_id, s.ids.pathak);
  assert.equal(delivery.discount, 350);
  assert.deepEqual(unsure, ['new_titles']);
  const lines = delivery.lines.map((l) => ({ book_id: l.book_id || null, title: l.book_id ? null : l.title, printed_price: l.printed_price, qty: l.qty }));
  const r = s.call(s.manager, 'intake.confirm', { id, date: delivery.date, publisher_id: delivery.publisher_id, challan: delivery.challan, lines }).data;
  assert.equal(r.status, 'saved');
  assert.equal(s.call(s.owner, 'books.list', { q: 'shesher' }).data.items[0].on_hand, 3);

  const id2 = photo(s, 'challan2.jpg', `${text}\n(copy)`).record_id;
  s.call(s.manager, 'intake.kind', { id: id2, kind: 'book_delivery' });
  const again = s.call(s.manager, 'intake.confirm', { id: id2, date: delivery.date, publisher_id: delivery.publisher_id, challan: '77', lines }).data;
  assert.deepEqual(again.error.fields.challan, { code: 'dup.challan', params: { id: r.data.records[0].id } });
});

test('a discarded upload lets the same file come again; the same bKash TrxID is refused', () => {
  const s = withSuppliers();
  const id = photo(s, 'slip.jpg', 'bKash\nTrxID AB12CD34EF\nTk 500\n21/11/2026').record_id;
  assert.equal(s.call(s.manager, 'intake.discard', { id, reason: 'Blurry' }).data.status, 'saved');
  const again = photo(s, 'slip.jpg', 'bKash\nTrxID AB12CD34EF\nTk 500\n21/11/2026');
  assert.equal(again.status, 'saved');
  s.call(s.owner, 'money.save', { kind: 'income', date: '2026-11-21', amount: 500, account_id: s.ids.bkash, ref: 'AB12CD34EF' });
  s.call(s.manager, 'intake.kind', { id: again.record_id, kind: 'payment_receipt' });
  const { entry } = s.call(s.manager, 'intake.get', { id: again.record_id }).data.proposal;
  assert.equal(entry.ref, 'AB12CD34EF');
  const r = s.call(s.manager, 'intake.confirm', { id: again.record_id, kind: 'expense', date: entry.date, amount: entry.amount, ref: entry.ref, account_id: s.ids.bkash, category_id: s.ids.milk }).data;
  assert.equal(r.error.fields.ref.code, 'dup.trx_id');
});

test('the optional Gemini reading fills what the text didn\'t; the key is never shown', () => {
  const s = withSuppliers();
  assert.equal(s.call(s.manager, 'settings.intake').error.code, 'FORBIDDEN');
  s.call(s.owner, 'settings.intake.save', { ai: 'bills', key: 'secret-key-123' });
  const shown = s.call(s.owner, 'settings.intake').data;
  assert.deepEqual(shown, { ai: 'bills', has_key: true });
  s.state.fetch['https://generativelanguage.googleapis.com/'] = {
    candidates: [{ content: { parts: [{ text: JSON.stringify({ date: '2026-11-19', total: 777, bill_no: 'X9', seller: 'Milk Vita Ltd' }) }] } }],
  };
  const id = photo(s, 'faded.jpg', 'faded text').record_id;
  s.call(s.manager, 'intake.kind', { id, kind: 'vendor_bill' });
  const doc = s.call(s.manager, 'intake.get', { id }).data;
  assert.equal(doc.ai_used, true);
  assert.deepEqual([doc.proposal.entry.date, doc.proposal.entry.amount, doc.proposal.entry.party_id], ['2026-11-19', 777, s.ids.dairy]);
  assert.ok(!JSON.stringify(s.call(s.owner, 'audit.list', { limit: 100 }).data).includes('secret-key-123'));
});

test('staff can\'t upload', () => {
  const s = withSuppliers();
  assert.equal(s.call(s.staff, 'intake.upload', { name: 'a.jpg', mime: 'image/jpeg', data: b64('x') }).error.code, 'FORBIDDEN');
});
