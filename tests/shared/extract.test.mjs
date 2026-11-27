// The reading rules learned from the owner's documents, on made-up text.

import test from 'node:test';
import assert from 'node:assert/strict';
import { amountsIn, extract, findBillNo, findDate, findItems, findTotals, findTrxId, guessKind, paidVia, paymentState, readBkash, readShiftReport } from '../../shared/intake/extract.js';

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

// Layouts of the owner's real documents (Nov 2026), with made-up names,
// numbers and ids.

test('an invoice: "Bill To" is not joined to the date line; the balance due means not paid', () => {
  const text = 'Rumi Bakes\nGulshan Ave\nDhaka 1212\nINVOICE\n# INV-000123\nBill To\nBiblion Cafe\nInvoice Date : 12 Nov 2026\nTerms : Due on Receipt\n'
    + '# Item & Description Qty Rate Amount\n1 Lemon Tart 2.00 300.00 600.00\n2 Brownie Box 4.00 150.00 600.00\nSub Total 1,200.00\nTotal BDT1,200.00\nBalance Due BDT1,200.00';
  const out = extract(text, 'vendor_bill');
  assert.deepEqual(out.items.map((i) => [i.name, i.qty, i.price]), [['Lemon Tart', 2, 300], ['Brownie Box', 4, 150]]);
  assert.deepEqual([out.date, out.amount, out.bill_no, out.paid], ['2026-11-12', 1200, 'INV-000123', 'later']);
});

test('a cash bill: sizes are not figures, row numbers are dropped, delivery is a charge, "No. :" is the bill number', () => {
  const text = 'Syrup House\nRM Centre (2F), 12 Kemal Ave\nBIN NO. :000111222-0101\nBill/Challan\nName of the Clients : Biblion\nNo. : 4567\nDate : 03/11/2026\n'
    + 'Payment Terms : COD\n1 Vanilla Syrup 1L 01 2100/-\n2 Mint Syrup 750ml 02 3000/-\nDelivery charges 100/-\nTotal = 5200/-';
  const out = extract(text, 'vendor_bill');
  assert.deepEqual(out.items.map((i) => [i.name, i.qty, i.price]), [['Vanilla Syrup', 1, 2100], ['Mint Syrup', 2, 1500]]);
  assert.deepEqual([out.amount, out.charges, out.discount, out.bill_no, out.paid], [5200, 100, null, '4567', 'now']);
});

test('a cash memo: "20p" is twenty pieces', () => {
  const items = findItems('01 কাপ 200p 1500/\n02 স্ট্র 50p 400/\nTotal- 1900/');
  assert.deepEqual(items.map((i) => [i.name, i.qty, i.amount]), [['কাপ', 200, 1500], ['স্ট্র', 50, 400]]);
});

test('a publisher invoice row: price, commission %, copies, amount; terms with % are not books', () => {
  const text = 'বই প্রকাশনী\nসকল বই ৪০% কেবল অমুকের বই ৩৫%\nক্রম লেখক বইএর নাম বিষয় মূল্য কমিশন সংখ্যা মূল্য\n'
    + '৩ রহিম উদ্দিন নদীর গল্প উপন্যাস ৪০০ ৪০ ২ ৪৮০\n৭ Karim Ali Rivers of Bengal প্রবন্ধ ৬০০ ৩৫ ১ ৩৯০\n'
    + '১. বর্তমান ইনভয়েসের ১০% মূল্য গ্রন্থ প্রাপ্তির সাথে পরিশোধ করতে হবে।\n৪. প্রতি ২ মাস অন্তর বিক্রয়কৃত বইয়ের মূল্য পরিশোধ করতে হবে।\n'
    + '৫. আপাতত ২০০০০/- টাকা পর্যন্ত বই নিতে পারবেন।\nতারিখ: ১০.০১.২০২৬';
  const out = extract(text, 'book_delivery');
  assert.deepEqual(out.items.map((i) => [i.qty, i.price, i.amount, i.discount_pct]), [[2, 400, 480, 40], [1, 600, 390, 35]]);
  assert.deepEqual([out.date, out.amount], ['2026-01-10', 870]);
  assert.equal(guessKind(text), 'book_delivery');
});

test('bKash slips: the kind of transaction, the TrxID under a Bangla or English label, the amount on the next line', () => {
  const slip = (title, extra = '') => `${title}\n01800000000\nপ্রেরক\n013*****111\nসময়\n3:10 PM 04/11/26\nট্রানজেকশন আইডি\nDA1234ABCD\nসর্বমোট\n৳1,234.50\n${extra}বিকাশ`;
  assert.deepEqual(readBkash(slip('মার্চেন্ট পেমেন্ট', 'রেফারেন্স\nShopRef\n')), {
    type: 'payment', trx_id: 'DA1234ABCD', amount: 1234.5, date: '2026-11-04', party: '01800000000', reference: 'ShopRef',
  });
  assert.equal(readBkash(slip('এজেন্ট ক্যাশ আউট')).type, 'cash_out');
  assert.equal(readBkash(slip('সেন্ড মানি')).type, 'send');
  const toBank = readBkash('bKash to Bank\nVISA\nTime\n10:00pm 17/11/26\nTransaction ID\nDB9876WXYZ\nAmount\n৳5,000.00\nReference\n123456789012\nবিকাশ');
  assert.deepEqual([toBank.type, toBank.trx_id, toBank.amount, toBank.reference], ['to_bank', 'DB9876WXYZ', 5000, '123456789012']);
  assert.equal(guessKind('ট্রানজেকশন আইডি DA1234ABCD'), 'payment_receipt');
  assert.equal(readBkash('An invoice\nTotal 500'), null);
});

test('a money receipt: serial number, "TK 2000/-", paid by bKash; a courier slip is paid on arrival', () => {
  const receipt = extract('প্রকাশনী\nSL No. 0042\nMONEY RECEIPT Date: 3/10/2026\nBy Cash/Cheque/PO/DD No: বিকাশ\nTK 1500/- In word: এক হাজার পাঁচশ টাকা মাত্র', 'payment_receipt');
  assert.deepEqual([receipt.bill_no, receipt.amount, receipt.via, receipt.unsure], ['0042', 1500, 'bkash', []]);
  assert.equal(paidVia('Paid by cheque no 123'), 'bank');
  const courier = 'Sundarban Express Transportation System Ltd.\nConsignment No. 900100002000111/1\nBooking Date: 11-Oct-2026\nFrom: SOME PROKASHONI\n1 ( BOOKS BUNDLE ) To-Pay Payable : 150.00';
  assert.equal(guessKind(courier), 'courier_slip');
  const out = extract(courier, 'courier_slip');
  assert.deepEqual([out.amount, out.paid, out.date, out.bill_no], [150, 'now', '2026-10-11', '900100002000111/1']);
});

test('a Loyverse shift report gives the daily shift its figures', () => {
  const text = 'Shift report\nShift number: 77\nStore: Biblion\nShift opened:\nOwner 15/11/2026 11:00 am\nCash drawer\nStarting cash Tk2,000.00\nCash payments Tk9,500.00\n'
    + 'Paid out Tk700.00\nExpected cash\namount Tk10,800.00\nActual cash amount Tk10,750.00\nDifference -Tk50.00\nSales summary\nGross sales Tk15,000.00\n'
    + 'Discounts Tk500.00\nNet sales Tk14,500.00\nCash Tk9,500.00\nBkash Tk4,000.00\nDue Tk1,000.00';
  const r = readShiftReport(text);
  assert.deepEqual([r.shift_no, r.date, r.net_sales, r.cash, r.bkash, r.due, r.paid_out, r.expected_cash, r.actual_cash], ['77', '2026-11-15', 14500, 9500, 4000, 1000, 700, 10800, 10750]);
  assert.equal(guessKind(text), 'shift_report');
  assert.equal(readShiftReport('Total 500'), null);
});
