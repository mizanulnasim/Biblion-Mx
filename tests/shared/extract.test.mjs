// The reading rules learned from the owner's documents, on made-up text.

import test from 'node:test';
import assert from 'node:assert/strict';
import { amountsIn, extract, findBillNo, findDate, findItems, findTotals, findTrxId, guessKind, paymentState } from '../../shared/intake/extract.js';

test('ISBN digits are not prices; phone numbers and dates are not amounts', () => {
  assert.deepEqual(amountsIn('Padma Nadir Majhi ISBN 978-984-8765-12-3 2 x 400 800'), [2, 400, 800]);
  assert.deepEqual(amountsIn('Aranyak 9789848765123 1 350'), [1, 350]);
  assert.deepEqual(amountsIn('Call 01711-222333 on 21/11/2026'), []);
});

test('"tk" counts only as a whole word', () => {
  assert.deepEqual(amountsIn('Total Tk 1,250.50'), [1250.5]);
  assert.deepEqual(amountsIn('Total tk.500'), [500]);
  assert.deepEqual(amountsIn('Teatktime 12 cups'), [12]);
});

test('Bangla digits are read', () => {
  assert.deepEqual(amountsIn('মোট ১,২৫০ টাকা'), [1250]);
  assert.equal(findDate('তারিখ: ২১/১১/২০২৬'), '2026-11-21');
});

test('dates in the forms bills use', () => {
  assert.equal(findDate('Date: 21-11-26'), '2026-11-21');
  assert.equal(findDate('2026-11-21'), '2026-11-21');
  assert.equal(findDate('21st Nov, 2026'), '2026-11-21');
  assert.equal(findDate('২১ নভেম্বর ২০২৬'), '2026-11-21');
  assert.equal(findDate('31/02/2026'), '');
});

test('bill numbers and bKash TrxIDs', () => {
  assert.equal(findBillNo('Invoice No: INV-2207'), 'INV-2207');
  assert.equal(findBillNo('চালান নং ৪৫৬'), '456');
  assert.equal(findTrxId('You have received Tk 500 from 01711222333. TrxID AB12CD34EF at 21/11/2026'), 'AB12CD34EF');
});

test('To-Pay means paid on arrival; COD or Received means paid now', () => {
  assert.equal(paymentState('Courier slip. To-Pay: 120'), 'later');
  assert.equal(paymentState('Payment: COD'), 'now');
  assert.equal(paymentState('Received with thanks'), 'now');
  assert.equal(paymentState('Thank you'), '');
});

test('"pay every 2 months" is a terms line, not an amount paid', () => {
  const t = findTotals('Milk 10 x 90 900\nPay every 2 months\nTotal 900');
  assert.equal(t.total, 900);
  assert.deepEqual(findItems('Milk 10 x 90 900\nPay every 2 months'), [{ name: 'Milk', qty: 10, price: 90, amount: 900 }]);
});

test('rows that wrap onto two lines are joined; letterhead lines are not items', () => {
  const text = 'Pathak Shamabesh Publications\n38/2 Banglabazar Road, Dhaka\nPhone 01711-000000\n'
    + 'Padma Nadir Majhi (paperback\nedition) 2 400 800\nAranyak 3 350 1050\nTotal 1850';
  assert.deepEqual(findItems(text).map((i) => [i.name, i.qty, i.price]), [['Padma Nadir Majhi (paperback edition)', 2, 400], ['Aranyak', 3, 350]]);
});

test('Bangla titles keep their vowel signs', () => {
  assert.deepEqual(findItems('পদ্মা নদীর মাঝি ২ ৪০০ ৮০০').map((i) => i.name), ['পদ্মা নদীর মাঝি']);
});

test('with a printed total, the discount is taken from it', () => {
  const r = extract('Challan 77\n21/11/2026\nPadma 2 400 800\nAranyak 3 350 1050\nTotal 1387.50', 'book_delivery', [{ id: 'SUP-1', kind: 'publisher', name: 'Pathak' }]);
  assert.equal(r.amount, 1387.5);
  assert.equal(r.discount, 462.5);
  assert.deepEqual(r.unsure, ['party']);
});

test('extract: a bill with its vendor, number, total and paid state', () => {
  const r = extract('Milk Vita Dairy\nMemo No: 5521\nDate 21/11/2026\nMilk 10 x 90 = 900\nCurd 2 x 120 = 240\nGrand Total 1140\nCOD', 'vendor_bill', [{ id: 'SUP-9', kind: 'vendor', name: 'Milk Vita' }]);
  assert.deepEqual([r.date, r.amount, r.bill_no, r.paid, r.party_id, r.items.length, r.unsure], ['2026-11-21', 1140, '5521', 'now', 'SUP-9', 2, []]);
});

test('a first guess at the kind', () => {
  assert.equal(guessKind('Delivery challan\nISBN 978...'), 'book_delivery');
  assert.equal(guessKind('bKash TrxID AB12CD34EF'), 'payment_receipt');
  assert.equal(guessKind('DESCO electricity bill'), 'utility_bill');
  assert.equal(guessKind('Invoice 22'), 'vendor_bill');
  assert.equal(guessKind(''), '');
});
