// Reading figures out of a document's text (from Drive's text reading).
// Pure functions, so they are tested on their own. The rules come from the
// owner's real documents and must keep working:
//   - invoice rows that wrap onto two lines are joined
//   - a row number at the start of a line is not a figure
//   - sizes ("1L", "500ml", "2kg") are not figures; counts ("20p",
//     "2000 pcs", "5টি") are quantities
//   - a publisher's row "price, commission %, copies, amount" is read as such
//   - when there is a printed total, the discount is taken from it; a total
//     above the items is charges (delivery), not a discount
//   - a label alone on a line ("সর্বমোট", "Amount") takes the figure on the
//     next line (bKash slips)
//   - ISBN digits are not prices; phone numbers are not amounts
//   - letterhead lines (address, phone, email, BIN), "Label : value" lines,
//     dated lines and lines with "%" (terms) are not items
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
const PHONE = /(?:\+?88)?\b01[3-9]\d{2}[- ]?\d{6}\b|\b0\d{2}\*+\d{3}\b/g;
const DATE_LIKE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/g;
const TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\b/gi;
// Counted units: the number before one of these is a quantity.
const COUNT_UNIT = '(?:pcs?|ps|p|pkts?|packs?|box(?:es)?|nos?|টি|পিস|পিচ|প্যাকেট)';
// An amount: 1,250 or 1250.50, optionally after Tk, BDT or ৳ (tk only as a
// word), and not touching a letter after it ("1L", "20p", "4F" are a size,
// a count or a floor), unless the letters are tk or taka ("500tk").
const AMOUNT = new RegExp(
  `(?:(?<![${L}])(?:tk|bdt)\\.?(?![${L}])|৳)?\\s*(\\d{1,3}(?:,\\d{2,3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)(?![\\d.,]*\\d)(?!(?!tk|taka|টাকা)[${L}])`,
  'giu',
);

// A row number at the start of a line: "1 ", "02 ", "১১৭ ", "3) ", "4. ".
const ROW_NO = new RegExp(`^(?:sl\\.?\\s*)?\\d{1,3}[.)]?\\s+(?=[${L}(])`, 'u');

// The amounts on one line, leaving out ISBNs, phone numbers, dates, times,
// sizes and counts.
export function amountsIn(line) {
  const clean = latinDigits(line).replace(ISBN, ' ').replace(PHONE, ' ').replace(DATE_LIKE, ' ').replace(TIME, ' ');
  const out = [];
  for (const m of clean.matchAll(AMOUNT)) {
    const value = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) out.push(value);
  }
  return out;
}

// "20p", "2000 pcs", "5টি": a quantity in a counted unit.
function countIn(line) {
  const m = new RegExp(`(?<![\\d.,])(\\d+)\\s?${COUNT_UNIT}(?![${L}])`, 'iu').exec(latinDigits(line));
  return m ? Number(m[1]) : null;
}

function word(re) {
  return new RegExp(`(?<![${L}])(?:${re})(?![${L}])`, 'iu');
}

const TOTAL = word('grand total|net total|net payable|total payable|payable|total amount|total|amount due|মোট|সর্বমোট|নিট');
// A label alone on its line; its figure is on the next line.
const BARE_TOTAL = new RegExp(`^(?:total|amount|grand total|সর্বমোট|মোট|পরিমাণ)\\s*:?$`, 'iu');
const SUBTOTAL = word('sub ?total|gross');
const DISCOUNT = word('discount|less|ছাড়|কমিশন|commission');
const CHARGES = word('delivery|carrying|courier charge|service charge|vat|ডেলিভারি');
const TERMS = word('every|within|terms|months?|days?|due date|মাস|অন্তর|দিনের মধ্যে|পর্যন্ত');
const LETTERHEAD = word('road|street|lane|house|floor|ave|avenue|centre|center|market|shop no|block|sector|section|plaza|tower|r/a|dhaka|phone|mobile|tel|hot ?line|head office|email|e-mail|www|web|bin|tin|ঢাকা|ফোন|মোবাইল|ঠিকানা|ইমেইল');
const PAID_NOW = word('cod|cash on delivery|received|paid|পরিশোধিত|নগদ');
const PAY_LATER = word('to-?pay|due|credit|বাকি');
// "Name of the Clients : Biblion", "Invoice Date : …": a field, not an item.
const FIELD = new RegExp(`^[${L}#&./ ]{2,40}\\s?:`, 'u');

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

const hasDate = (line) => Boolean(findDate(line));

export function findBillNo(text) {
  const t = latinDigits(String(text || ''));
  const labelled = /(?:bill|invoice|inv|memo|challan|receipt|voucher|consignment|চালান|মেমো|বিল|রসিদ)\s*(?:no\.?|number|#|নং)?\s*[:#.-]?\s*([A-Za-z]{0,4}[-/]?\d[\w/-]{0,23})/i.exec(t);
  if (labelled) return labelled[1].replace(/[/-]+$/, '');
  // "No. : 6123", "SL No. 0305", "Ref: 12": a number on its own label.
  const plain = /(?:^|\n)\s*(?:sl\.?\s*|serial\s*)?(?:no|ref)\.?\s*[:.]?\s*(\d[\w/-]{0,15})/im.exec(t);
  return plain ? plain[1] : '';
}

// A bKash, Nagad or bank transaction id, labelled in English or Bangla, on
// the same line or the next.
export function findTrxId(text) {
  const m = /(?:trx\s*id|txn\s*id|transaction\s*id|ট্রানজেকশন\s*আইডি|লেনদেন\s*আইডি)\s*[:#]?\s*([A-Z0-9]{8,12})\b/iu.exec(String(text || ''));
  return m ? m[1].toUpperCase() : '';
}

// Paid now (COD, Received), later (To-Pay, due), or unknown.
export function paymentState(text) {
  const t = String(text || '');
  if (PAY_LATER.test(t) && !PAID_NOW.test(t.replace(/to-?pay/gi, ''))) return 'later';
  if (PAID_NOW.test(t)) return 'now';
  return '';
}

// How it was paid: bkash, bank (cheque, transfer) or cash.
export function paidVia(text) {
  const t = String(text || '');
  if (/bkash|বিকাশ/i.test(t)) return 'bkash';
  if (/cheque|check no|চেক|bank transfer|npsb|beftn|ব্যাংক/i.test(t)) return 'bank';
  if (word('cash|নগদ').test(t)) return 'cash';
  return '';
}

// The printed total, a printed discount, charges, and a subtotal.
export function findTotals(text) {
  const all = lines(text);
  let total = null;
  let subtotal = null;
  let discount = null;
  let charges = 0;
  all.forEach((line, i) => {
    if (line.includes('%')) return;
    if (BARE_TOTAL.test(line) && i + 1 < all.length) {
      const next = amountsIn(all[i + 1]);
      if (next.length === 1) total = next[0];
      return;
    }
    if (TERMS.test(line) && !TOTAL.test(line)) return;
    const amounts = amountsIn(line.replace(ROW_NO, ''));
    if (!amounts.length) return;
    const last = amounts[amounts.length - 1];
    if (SUBTOTAL.test(line)) subtotal = last;
    else if (DISCOUNT.test(line)) discount = last;
    else if (CHARGES.test(line) && amounts.length === 1 && !TOTAL.test(line)) charges += last;
    else if (TOTAL.test(line)) total = last;
    // "TK 2000/-" at the start of a line, as on a money receipt.
    else if (total === null && /^(?:tk|taka|৳)\.?\s*\d/i.test(line)) total = last;
  });
  return { total, subtotal, discount, charges };
}

const HEADING = word('qty|quantity|price|rate|amount|title|description|particulars|item|বইয়ের নাম|বইএর নাম|পরিমাণ|দর|মূল্য|সংখ্যা');

const notItem = (line) => line.includes('%') || FIELD.test(line) || hasDate(line) || LETTERHEAD.test(line);

// Joins an item row that wrapped: a line of words with no figures (not a
// column heading, field, or letterhead), followed by a line with figures.
function joinWrapped(all) {
  const out = [];
  for (const line of all) {
    const prev = out[out.length - 1];
    const wrapped = prev && !amountsIn(prev).length && amountsIn(line).length >= 2 && !notItem(line)
      && new RegExp(`[${L}]{3}`, 'u').test(prev) && !HEADING.test(prev) && !notItem(prev) && !TOTAL.test(prev);
    if (wrapped) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

const near = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.01);

// One item row's figures. A publisher's row is "price, commission %,
// copies, amount" (amount = price × copies less the commission).
function rowFigures(line) {
  const amounts = amountsIn(line);
  const counted = countIn(line);
  if (counted !== null && amounts.length >= 1) {
    const amount = amounts[amounts.length - 1];
    return { qty: counted, price: Math.round((amount / counted) * 100) / 100, amount };
  }
  if (amounts.length >= 4) {
    const [price, pct, qty, amount] = amounts.slice(-4);
    if (Number.isInteger(qty) && pct < 100 && near(price * qty * (1 - pct / 100), amount)) return { qty, price, amount, discount_pct: pct };
  }
  if (amounts.length >= 3) {
    let [qty, price, amount] = amounts.slice(-3);
    if (!near(qty * price, amount)) return null;
    if (!Number.isInteger(qty)) [qty, price] = [price, qty];
    return { qty, price, amount };
  }
  // Two figures: copies and a price, or copies and the row's amount; the
  // printed total decides (see extract).
  if (amounts.length === 2) {
    let [qty, price] = amounts;
    if (!Number.isInteger(qty) || qty > 1000) [qty, price] = [price, qty];
    return { qty, price, amount: qty * price, two: true };
  }
  return null;
}

// Item lines: a name, then copies and a price (and maybe the line amount).
// Totals, charges, terms, fields and letterhead lines are not items.
export function findItems(text) {
  const items = [];
  for (const raw of joinWrapped(lines(text))) {
    const line = raw.replace(ROW_NO, '');
    if (notItem(raw) || TOTAL.test(line) || SUBTOTAL.test(line) || DISCOUNT.test(line) || CHARGES.test(line) || TERMS.test(line)) continue;
    const name = line.replace(ISBN, ' ').replace(new RegExp(`\\d+\\s?(?:${COUNT_UNIT}|l|ml|kg|gm?|ltr)(?![${L}])`, 'giu'), ' ')
      .replace(new RegExp(`(?<![${L}])[xX×](?![${L}])`, 'gu'), ' ').replace(/[\d.,৳@=*/-]+/g, ' ').replace(new RegExp(`(?<![${L}])(?:tk|bdt|pcs|copies|qty)(?![${L}])`, 'giu'), ' ')
      .replace(/\s+/g, ' ').trim();
    if (!new RegExp(`[${L}]{3}`, 'u').test(name)) continue;
    const figures = rowFigures(line);
    if (!figures || !Number.isInteger(figures.qty) || figures.qty < 1 || figures.qty > 10000) continue;
    items.push({ name, ...figures });
  }
  return items;
}

// A bKash slip: what kind of transaction, its id, amount, when, with whom,
// and the reference. null when the text isn't a bKash slip.
//   type: payment (merchant), send (send money), cash_out, to_bank,
//         cash_in, received, or '' when unclear
const BKASH_TYPES = [
  ['cash_out', /ক্যাশ\s*আউট|cash\s*out/i],
  ['to_bank', /bkash\s*to\s*bank|ব্যাংকে|to\s*bank/i],
  ['cash_in', /ক্যাশ\s*ইন|cash\s*in|add\s*money|অ্যাড\s*মানি/i],
  ['received', /received|রিসিভড|পেয়েছেন/i],
  ['send', /সেন্ড\s*মানি|send\s*money/i],
  ['payment', /মার্চেন্ট|merchant|পেমেন্ট|payment/i],
];

export function readBkash(text) {
  const t = String(text || '');
  if (!/bkash|বিকাশ/i.test(t) || !findTrxId(t)) return null;
  const all = lines(t);
  const after = (label) => {
    const i = all.findIndex((l) => label.test(l));
    return i >= 0 && i + 1 < all.length ? all[i + 1] : '';
  };
  const type = (BKASH_TYPES.find(([, re]) => re.test(t)) || [''])[0];
  const { total } = findTotals(t);
  const party = all.slice(1, 4).find((l) => /\d{11}/.test(l) || (/^[A-Z][A-Z .&-]{3,}$/.test(l) && !/^VISA$/.test(l))) || '';
  return {
    type, trx_id: findTrxId(t), amount: total, date: findDate(t),
    party: party.replace(/[^\w .&-]/g, '').trim(), reference: after(/^(?:reference|রেফারেন্স)$/i),
  };
}

// A Loyverse shift report: the figures the daily shift needs. null when the
// text isn't one.
const SHIFT_FIELDS = {
  starting_cash: /^starting cash\b/i,
  cash_payments: /^cash payments\b/i,
  cash_refunds: /^cash refunds\b/i,
  paid_in: /^paid in\b/i,
  paid_out: /^paid out\b/i,
  expected_cash: /^expected cash\b/i,
  actual_cash: /^actual cash\b/i,
  difference: /^difference\b/i,
  gross_sales: /^gross sales\b/i,
  refunds: /^refunds\b/i,
  discounts: /^discounts\b/i,
  net_sales: /^net sales\b/i,
  cash: /^cash\s*(?:tk|৳|\d)/i,
  bkash: /^bkash\b/i,
  card: /^(?:card|visa|master ?card)\b/i,
  due: /^due\b/i,
};

export function readShiftReport(text) {
  const t = String(text || '');
  if (!/shift report|shift number/i.test(t) || !/net sales/i.test(t)) return null;
  const all = lines(t);
  const out = { shift_no: '', date: findDate(t) };
  const m = /shift number\s*:?\s*(\d+)/i.exec(t);
  if (m) out.shift_no = m[1];
  for (const [field, re] of Object.entries(SHIFT_FIELDS)) {
    // "Expected cash" may wrap: "Expected cash" / "amount Tk12,929.90".
    const i = all.findIndex((l) => re.test(l));
    if (i < 0) continue;
    let amounts = amountsIn(all[i]);
    if (!amounts.length && i + 1 < all.length) amounts = amountsIn(all[i + 1]);
    if (amounts.length) out[field] = amounts[amounts.length - 1];
  }
  return out;
}

// What a document says, for a kind. `suppliers`: [{id, kind, name}] to match.
export function extract(text, kind, suppliers = []) {
  const unsure = [];
  const date = findDate(text);
  if (!date) unsure.push('date');
  const { total, subtotal, discount, charges } = findTotals(text);
  let items = kind === 'book_delivery' || kind === 'vendor_bill' ? findItems(text) : [];
  // Rows of "copies, figure": if the figures are row amounts (they, not
  // copies × figure, add up to the printed total), read them so.
  const goods = total === null ? null : total - charges;
  if (goods !== null && items.some((i) => i.two) && !near(items.reduce((s, i) => s + i.amount, 0), goods)
    && near(items.reduce((s, i) => s + (i.two ? i.price : i.amount), 0), goods)) {
    items = items.map((i) => (i.two ? { ...i, amount: i.price, price: Math.round((i.price / i.qty) * 100) / 100 } : i));
  }
  items = items.map(({ two, ...i }) => i);
  const itemsSum = items.reduce((s, i) => s + i.amount, 0);
  let amount = total;
  if (amount === null && items.length) amount = itemsSum;
  if (amount === null) {
    const every = lines(text).filter((l) => !TERMS.test(l) && !l.includes('%')).flatMap((l) => amountsIn(l.replace(ROW_NO, '')));
    amount = every.length ? Math.max(...every) : null;
    unsure.push('amount');
  }
  // With a printed total below the items, the difference is a discount;
  // above them, it is charges such as delivery.
  let discountFound = discount;
  const before = subtotal ?? itemsSum;
  if (total !== null && items.length && before - total > 0.5) discountFound = Math.round((before - total) * 100) / 100;
  const lower = latinDigits(String(text || '')).toLowerCase();
  const supplier = suppliers.find((s) => s.name.length >= 3 && lower.includes(s.name.toLowerCase())) || null;
  if ((kind === 'vendor_bill' || kind === 'book_delivery') && !supplier) unsure.push('party');
  const out = {
    date, amount, discount: discountFound, charges, bill_no: findBillNo(text), trx_id: findTrxId(text),
    paid: kind === 'courier_slip' ? 'now' : paymentState(text), via: paidVia(text), party_id: supplier ? supplier.id : '', items, unsure,
  };
  if (kind === 'payment_receipt' && !out.trx_id && !out.bill_no) unsure.push('ref');
  return out;
}

// A first guess at what the document is, from its text.
export function guessKind(text) {
  const t = String(text || '').toLowerCase();
  if (/shift report|shift number/.test(t) && /net sales/.test(t)) return 'shift_report';
  if (/consignment|courier|sundarban|pathao|redx|steadfast|paribahan|কুরিয়ার/.test(t)) return 'courier_slip';
  if ((/challan|চালান/.test(t) || /commission|কমিশন/.test(t)) && /isbn|book|বই|প্রকাশ|publication|prokashon|লেখক/.test(t)) return 'book_delivery';
  if (/trx\s*id|transaction id|ট্রানজেকশন|bkash|বিকাশ|deposit slip|money receipt/.test(t)) return 'payment_receipt';
  if (/electric|desco|dpdc|wasa|titas|gas bill|internet bill|বিদ্যুৎ|গ্যাস|পানি/.test(t)) return 'utility_bill';
  if (/invoice|bill|memo|challan|বিল|মেমো/.test(t)) return 'vendor_bill';
  return t.trim() ? 'expense' : '';
}
