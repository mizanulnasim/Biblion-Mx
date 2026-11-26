// Reading figures out of a document's text (from Drive's text reading).
// Pure functions, so they are tested on their own. The rules come from the
// owner's real documents and must keep working:
//   - invoice rows that wrap onto two lines are joined
//   - when there is a printed total, the discount is taken from it
//   - ISBN digits are not prices; phone numbers are not amounts
//   - letterhead lines (address, phone, email) are not items
//   - "To-Pay" on a courier slip means paid on arrival; "COD" or "Received"
//     on a bill means paid now
//   - "pay every 2 months" is a terms line, not an amount paid
//   - Bangla vowel signs count as letters
//   - "tk" is matched only as a whole word
// Every field the reader isn't sure of is listed, so the person checks it.

import { latinDigits } from '../lib/search.js';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  জানু: 1, জানুয়ারি: 1, ফেব্রু: 2, ফেব্রুয়ারি: 2, মার্চ: 3, এপ্রিল: 4, মে: 5, জুন: 6, জুলাই: 7, আগস্ট: 8,
  সেপ্টে: 9, সেপ্টেম্বর: 9, অক্টো: 10, অক্টোবর: 10, নভে: 11, নভেম্বর: 11, ডিসে: 12, ডিসেম্বর: 12,
};
const L = '\\p{L}\\p{M}';

// Lines, with Bangla digits as Latin and spacing tidied.
function lines(text) {
  return latinDigits(String(text || '')).split(/\r?\n/).map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
}

const ISBN = /\b(?:97[89][- ]?)?\d{1,5}[- ]\d{1,7}[- ]\d{1,7}[- ][\dX]\b|\b97[89]\d{10}\b|\b\d{9}[\dX]\b/g;
const PHONE = /(?:\+?88)?\b01[3-9]\d{2}[- ]?\d{6}\b/g;
const DATE_LIKE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/g;
// An amount: 1,250 or 1250.50, optionally after Tk, BDT or ৳ (tk only as a word).
const AMOUNT = new RegExp(`(?:(?<![${L}])(?:tk|bdt)\\.?(?![${L}])|৳)?\\s*(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)`, 'giu');

// The amounts on one line, leaving out ISBNs, phone numbers and dates.
export function amountsIn(line) {
  const clean = latinDigits(line).replace(ISBN, ' ').replace(PHONE, ' ').replace(DATE_LIKE, ' ');
  const out = [];
  for (const m of clean.matchAll(AMOUNT)) {
    const value = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) out.push(value);
  }
  return out;
}

function word(re) {
  return new RegExp(`(?<![${L}])(?:${re})(?![${L}])`, 'iu');
}

const TOTAL = word('grand total|net total|net payable|total payable|payable|total amount|total|amount due|মোট|সর্বমোট|নিট');
const SUBTOTAL = word('sub ?total|gross');
const DISCOUNT = word('discount|less|ছাড়|কমিশন|commission');
const TERMS = word('every|within|terms|months?|days?|due date|মাস পর পর|দিনের মধ্যে');
const LETTERHEAD = word('road|street|lane|house|floor|dhaka|phone|mobile|tel|email|e-mail|www|web|bangladesh|ঢাকা|ফোন|মোবাইল|ঠিকানা');
const PAID_NOW = word('cod|cash on delivery|received|paid|পরিশোধিত|নগদ');
const PAY_LATER = word('to-?pay|due|credit|বাকি');

export function findDate(text) {
  const t = latinDigits(String(text || ''));
  let m = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(t);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+([${L}]+)\\.?,?[\\s-]+(\\d{2,4})\\b`, 'u').exec(t);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()] || MONTHS[m[2].toLowerCase().slice(0, 3)];
    if (month) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], month, +m[1]);
  }
  return '';
}

function iso(y, mo, d) {
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) return '';
  return date.toISOString().slice(0, 10);
}

export function findBillNo(text) {
  const m = /(?:bill|invoice|inv|memo|challan|receipt|voucher|চালান|মেমো|বিল)\s*(?:no\.?|number|#|নং)?\s*[:#.-]?\s*([A-Za-z]{0,4}[-/]?\d[\w/-]{0,15})/i.exec(latinDigits(String(text || '')));
  return m ? m[1] : '';
}

export function findTrxId(text) {
  const m = /trx\s*id\s*[:#]?\s*([A-Z0-9]{8,12})\b/i.exec(String(text || ''));
  return m ? m[1].toUpperCase() : '';
}

// Paid now (COD, Received), later (To-Pay, due), or unknown.
export function paymentState(text) {
  const t = String(text || '');
  if (PAY_LATER.test(t) && !PAID_NOW.test(t.replace(/to-?pay/gi, ''))) return 'later';
  if (PAID_NOW.test(t)) return 'now';
  return '';
}

// The printed total, a printed discount, and the items' sum.
export function findTotals(text) {
  const all = lines(text);
  let total = null;
  let subtotal = null;
  let discount = null;
  for (const line of all) {
    if (TERMS.test(line) && !TOTAL.test(line)) continue;
    const amounts = amountsIn(line);
    if (!amounts.length) continue;
    const last = amounts[amounts.length - 1];
    if (SUBTOTAL.test(line)) subtotal = last;
    else if (DISCOUNT.test(line)) discount = last;
    else if (TOTAL.test(line)) total = last;
  }
  return { total, subtotal, discount };
}

const HEADING = word('qty|quantity|price|rate|amount|title|description|particulars|item|বইয়ের নাম|পরিমাণ|দর|মূল্য');

// Joins an item row that wrapped: a line of words with no figures (not a
// column heading or letterhead), followed by a line with figures.
function joinWrapped(all) {
  const out = [];
  for (const line of all) {
    const prev = out[out.length - 1];
    const wrapped = prev && !amountsIn(prev).length && amountsIn(line).length >= 2
      && new RegExp(`[${L}]{3}`, 'u').test(prev) && !HEADING.test(prev) && !LETTERHEAD.test(prev) && !TOTAL.test(prev);
    if (wrapped) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

// Item lines: a name, then copies and a price (and maybe the line amount).
// Totals, terms and letterhead lines are not items.
export function findItems(text) {
  const items = [];
  for (const line of joinWrapped(lines(text))) {
    if (TOTAL.test(line) || SUBTOTAL.test(line) || DISCOUNT.test(line) || TERMS.test(line) || LETTERHEAD.test(line)) continue;
    const name = line.replace(ISBN, ' ').replace(/[\d.,৳xX×@=*/-]+/g, ' ').replace(new RegExp(`(?<![${L}])(?:tk|bdt|pcs|copies|qty)(?![${L}])`, 'giu'), ' ').replace(/\s+/g, ' ').trim();
    if (!new RegExp(`[${L}]{3}`, 'u').test(name)) continue;
    const amounts = amountsIn(line);
    if (amounts.length < 2) continue;
    let qty;
    let price;
    let amount;
    if (amounts.length >= 3) {
      [qty, price, amount] = amounts.slice(-3);
      // "qty price amount" must agree; otherwise read "price qty amount".
      if (Math.abs(qty * price - amount) > 1 && Math.abs(price * qty - amount) > 1) {
        [price, qty] = [qty, price];
        if (Math.abs(qty * price - amount) > 1) continue;
      }
      if (!Number.isInteger(qty)) [qty, price] = [price, qty];
    } else {
      [qty, price] = amounts;
      if (!Number.isInteger(qty) || qty > 1000) [qty, price] = [price, qty];
      amount = qty * price;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > 10000) continue;
    items.push({ name, qty, price, amount });
  }
  return items;
}

// What a document says, for a kind. `suppliers`: [{id, kind, name}] to match.
export function extract(text, kind, suppliers = []) {
  const unsure = [];
  const date = findDate(text);
  if (!date) unsure.push('date');
  const { total, subtotal, discount } = findTotals(text);
  const items = kind === 'book_delivery' || kind === 'vendor_bill' ? findItems(text) : [];
  const itemsSum = items.reduce((s, i) => s + i.amount, 0);
  let amount = total;
  if (amount === null && items.length) amount = itemsSum;
  if (amount === null) {
    const every = lines(text).filter((l) => !TERMS.test(l)).flatMap(amountsIn);
    amount = every.length ? Math.max(...every) : null;
    unsure.push('amount');
  }
  // With a printed total, the discount is what the items lose to reach it.
  let discountFound = discount;
  if (total !== null && items.length && Math.abs((subtotal ?? itemsSum) - total) > 0.5) discountFound = Math.round(((subtotal ?? itemsSum) - total) * 100) / 100;
  const lower = latinDigits(String(text || '')).toLowerCase();
  const supplier = suppliers.find((s) => s.name.length >= 3 && lower.includes(s.name.toLowerCase())) || null;
  if ((kind === 'vendor_bill' || kind === 'book_delivery') && !supplier) unsure.push('party');
  const out = {
    date, amount, discount: discountFound, bill_no: findBillNo(text), trx_id: findTrxId(text),
    paid: paymentState(text), party_id: supplier ? supplier.id : '', items, unsure,
  };
  if (kind === 'payment_receipt' && !out.trx_id && !out.bill_no) unsure.push('ref');
  return out;
}

// A first guess at what the document is, from its text.
export function guessKind(text) {
  const t = String(text || '').toLowerCase();
  if (/challan|চালান/.test(t) && /isbn|book|বই|প্রকাশ|publication|prokashon/.test(t)) return 'book_delivery';
  if (/trx\s*id|bkash|বিকাশ|deposit slip|transaction id/.test(t)) return 'payment_receipt';
  if (/electric|desco|dpdc|wasa|titas|gas bill|internet bill|বিদ্যুৎ|গ্যাস|পানি/.test(t)) return 'utility_bill';
  if (/invoice|bill|memo|বিল|মেমো/.test(t)) return 'vendor_bill';
  return t.trim() ? 'expense' : '';
}
