// Uploads. A document comes in (refused if the same file came before), is
// kept on Drive and its text read. The person says what it is (nothing goes
// to Gemini before that). The app prepares the entries it can; on the check
// screen the person corrects them, and one Confirm creates them under the
// normal checks (duplicate warnings, the approval policy) and files the
// document on each. A document can instead be filed on an existing record,
// or discarded with a reason.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { INTAKE_KINDS, MAX_UPLOAD_BYTES } from '../../shared/intake/kinds.js';
import { extract, guessKind, readBkash, readShiftReport } from '../../shared/intake/extract.js';
import { page } from '../kernel/paging.js';
import { setting } from '../kernel/settings.js';
import {
  base64ToBytes, bytesToBase64, fileBytes, getProp, postJson, readText, sha256Hex,
} from '../platform.js';
import { prepareEntry, record } from './money.js';
import { storeFile } from './files.js';
import { createDelivery } from './books.js';
import { dhakaDate } from './requisitions.js';

const fieldError = (fields) => new AppError('VALIDATION', {}, fields);
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

// ---- Upload ------------------------------------------------------------------

function upload(ctx, { name, mime, data }) {
  const { db } = ctx;
  const bytes = base64ToBytes(data);
  if (bytes.length > MAX_UPLOAD_BYTES) throw fieldError({ data: { code: 'val.file_too_big', params: { mb: MAX_UPLOAD_BYTES / 1048576 } } });
  const checksum = sha256Hex(bytes);
  const same = db.all('Files').find((f) => f.checksum === checksum && f.status === 'active');
  if (same) {
    const earlier = db.all('Intake_Docs').find((d) => d.file_id === same.id);
    throw fieldError({ data: { code: 'val.file_exists', params: { id: earlier ? earlier.id : '' } } });
  }
  const file = storeFile(ctx, { name, mime, data }, 'uploads');
  let text = '';
  try {
    text = readText(file.drive_id, mime);
  } catch (err) {
    // A file Drive can't read is still kept; the person fills the entries in.
  }
  const doc = db.insert('Intake_Docs', {
    file_id: file.id, status: 'needs_kind', kind: '', guess: guessKind(text), text, proposal: null, ai_used: false,
    result: null, discard_reason: '', confirmed_by: '', confirmed_at: '', uploaded_by: ctx.user.id,
  });
  return saved(doc.id, { guess: doc.guess });
}

// ---- Preparing entries ------------------------------------------------------------

const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '');

function matchBook(books, name) {
  const n = norm(name);
  if (n.length < 3) return null;
  return books.find((b) => norm(b.title) === n)
    || books.find((b) => String(b.aliases || '').split(',').some((a) => norm(a) === n))
    || books.find((b) => norm(b.title).length >= 5 && (n.includes(norm(b.title)) || norm(b.title).includes(n)))
    || null;
}

// The optional Gemini reading, for receipts and bills only.
function readWithAi(db, file) {
  const key = getProp('GEMINI_KEY');
  if (!key || setting(db, 'intake.ai') !== 'bills') return null;
  try {
    const res = postJson(`${GEMINI}?key=${encodeURIComponent(key)}`, {
      contents: [{
        parts: [
          { inline_data: { mime_type: file.mime, data: bytesToBase64(fileBytes(file.drive_id)) } },
          { text: 'Read this receipt or bill. Reply with JSON only: {"date":"YYYY-MM-DD","total":number,"bill_no":"","seller":""}. Use "" or null when not shown.' },
        ],
      }],
      generationConfig: { response_mime_type: 'application/json' },
    });
    if (res.status !== 200) return null;
    return JSON.parse(res.body.candidates[0].content.parts[0].text);
  } catch (err) {
    return null;
  }
}

const firstAccount = (db, kind) => (db.all('Money_Accounts').find((a) => a.status === 'active' && a.kind === kind) || {}).id || '';

// The money entry a document suggests. A bKash slip says what moved: cash
// out (bKash to the cash drawer) and bKash to Bank are transfers, cash in
// is a transfer the other way, money received is income, and a payment or
// send money is paid from bKash. A courier slip is an expense paid on
// arrival, in a shipping or courier category if there is one.
function moneyProposal(db, kind, found, date) {
  const def = INTAKE_KINDS[kind];
  const party = found.party_id ? db.get('Suppliers', found.party_id) : null;
  const entry = { kind: def.kinds[0], date, amount: found.amount, party_id: found.party_id, ref: found.trx_id || found.bill_no, note: '' };
  if (kind === 'vendor_bill') entry.kind = found.paid === 'now' ? 'vendor_purchase_paid' : 'vendor_purchase_credit';
  // A payment to a known vendor or publisher pays what is owed; anything else is an expense.
  if (kind === 'payment_receipt') entry.kind = party ? (party.kind === 'vendor' ? 'vendor_payment' : 'publisher_payment') : 'expense';
  const via = { bkash: firstAccount(db, 'bkash'), bank: firstAccount(db, 'bank'), cash: firstAccount(db, 'drawer') }[found.via] || '';
  if (via && entry.kind !== 'vendor_purchase_credit') entry.account_id = via;
  const bkash = kind === 'payment_receipt' ? readBkash(found.text) : null;
  if (bkash) {
    entry.account_id = firstAccount(db, 'bkash');
    if (bkash.type === 'cash_out') Object.assign(entry, { kind: 'transfer', to_account_id: firstAccount(db, 'drawer') });
    if (bkash.type === 'to_bank') Object.assign(entry, { kind: 'transfer', to_account_id: firstAccount(db, 'bank') });
    if (bkash.type === 'cash_in') Object.assign(entry, { kind: 'transfer', account_id: firstAccount(db, 'drawer'), to_account_id: firstAccount(db, 'bkash') });
    if (bkash.type === 'received') entry.kind = 'income';
    if (bkash.amount) entry.amount = bkash.amount;
    entry.note = [bkash.party, bkash.reference].filter(Boolean).join(' · ');
  }
  if (kind === 'courier_slip') {
    const shipping = db.all('Expense_Categories').find((c) => c.status === 'active' && /ship|courier|deliver|parcel|পরিবহন|কুরিয়ার/i.test(c.name));
    if (shipping) entry.category_id = shipping.id;
    const from = /from\s*:?\s*([^\n]+)/i.exec(found.text);
    if (from) entry.note = from[1].trim();
  }
  return {
    target: 'money', entry,
    // What the document says about payment ("now", "later" or unknown), shown to the person.
    paid: found.paid, via: found.via, bkash_type: bkash ? bkash.type : '',
    // A bKash slip read whole has its amount and TrxID for sure.
    unsure: bkash && bkash.amount && bkash.trx_id ? found.unsure.filter((u) => u !== 'amount' && u !== 'ref') : found.unsure,
  };
}

function prepare(db, doc, kind) {
  const def = INTAKE_KINDS[kind];
  const supplierKind = kind === 'book_delivery' ? 'publisher' : kind === 'vendor_bill' ? 'vendor' : null;
  const suppliers = db.all('Suppliers').filter((s) => s.status === 'active' && (!supplierKind || s.kind === supplierKind));
  const found = { ...extract(doc.text, kind, suppliers), text: doc.text };
  let aiUsed = false;
  if (def.ai) {
    const ai = readWithAi(db, db.get('Files', doc.file_id));
    if (ai) {
      aiUsed = true;
      if (ai.date && !found.date) found.date = ai.date;
      if (ai.total && found.unsure.includes('amount')) found.amount = ai.total;
      if (ai.bill_no && !found.bill_no) found.bill_no = ai.bill_no;
      const seller = ai.seller ? suppliers.find((s) => norm(ai.seller).includes(norm(s.name))) : null;
      if (seller && !found.party_id) found.party_id = seller.id;
      found.unsure = found.unsure.filter((u) => !(u === 'date' && found.date) && !(u === 'amount' && ai.total) && !(u === 'party' && found.party_id));
    }
  }
  const date = found.date || dhakaDate(db.now);
  if (def.target === 'delivery') {
    const books = db.all('Books').filter((b) => b.status === 'active');
    const own = found.party_id ? books.filter((b) => b.publisher_id === found.party_id) : books;
    const lines = found.items.map((item) => {
      const book = matchBook(own, item.name) || matchBook(books, item.name);
      // A row with its own commission ("price, commission %, copies, amount") costs what it says.
      const unitCost = item.discount_pct !== undefined ? Math.round((item.amount / item.qty) * 100) / 100 : null;
      return { book_id: book ? book.id : '', title: book ? book.title : item.name, printed_price: item.price, qty: item.qty, unit_cost: unitCost, matched: Boolean(book) };
    });
    const unsure = [...found.unsure];
    if (!lines.length) unsure.push('lines');
    if (lines.some((l) => !l.matched)) unsure.push('new_titles');
    return { aiUsed, proposal: { target: 'delivery', delivery: { date, publisher_id: found.party_id, challan: found.bill_no, lines, discount: found.discount }, unsure } };
  }
  if (def.target === 'shift') {
    const figures = readShiftReport(doc.text) || {};
    const unsure = ['net_sales', 'cash', 'actual_cash'].filter((f) => figures[f] === undefined);
    return { aiUsed, proposal: { target: 'shift', shift: { ...figures, date: figures.date || date }, unsure } };
  }
  if (def.target === 'money') {
    return { aiUsed, proposal: moneyProposal(db, kind, found, date) };
  }
  return { aiUsed, proposal: { target: 'none', unsure: [] } };
}

function setKind(ctx, { id, kind }) {
  const { db } = ctx;
  const doc = openDoc(db, id, ['needs_kind', 'ready']);
  const { proposal, aiUsed } = prepare(db, doc, kind);
  db.update('Intake_Docs', doc, { kind, status: 'ready', proposal, ai_used: aiUsed });
  return saved(doc.id);
}

function openDoc(db, id, states) {
  const doc = db.get('Intake_Docs', id);
  if (!doc) throw new AppError('NOT_FOUND');
  if (!states.includes(doc.status)) throw new AppError('CONFLICT', { by: '' });
  return doc;
}

// ---- Reading ---------------------------------------------------------------------

function docView(db, d) {
  const file = db.get('Files', d.file_id);
  const user = db.get('Users', d.uploaded_by);
  return {
    id: d.id, status: d.status, kind: d.kind, guess: d.guess, text: d.text, proposal: d.proposal, ai_used: d.ai_used,
    result: d.result, discard_reason: d.discard_reason, created_at: d.created_at, uploaded_by: user ? user.display_name : '',
    file: file ? { id: file.id, name: file.name, mime: file.mime, size: file.size } : null,
  };
}

function get(ctx, { id }) {
  const d = ctx.db.get('Intake_Docs', id);
  if (!d) throw new AppError('NOT_FOUND');
  return docView(ctx.db, d);
}

const OPEN = new Set(['reading', 'needs_kind', 'ready']);

function list(ctx, query) {
  const { db } = ctx;
  let rows = db.all('Intake_Docs');
  if (query.status === 'open') rows = rows.filter((d) => OPEN.has(d.status));
  if (query.status === 'done') rows = rows.filter((d) => !OPEN.has(d.status));
  const items = rows.map((d) => {
    const v = docView(db, d);
    return { id: v.id, status: v.status, kind: v.kind, name: v.file ? v.file.name : '', uploaded_by: v.uploaded_by, created_at: d.created_at, _row: d._row };
  });
  const result = page(items, query, (d) => `${d.name} ${d.kind} ${d.status} ${d.uploaded_by}`);
  return { ...result, items: result.items.map(({ _row, ...d }) => d) };
}

function getFile(ctx, { id }) {
  const f = ctx.db.get('Files', id);
  if (!f || f.status === 'removed') throw new AppError('NOT_FOUND');
  return { name: f.name, mime: f.mime, data: bytesToBase64(fileBytes(f.drive_id)) };
}

// ---- Confirm, attach, discard -------------------------------------------------------

function fileOn(ctx, doc, records, status) {
  const { db } = ctx;
  const file = db.get('Files', doc.file_id);
  db.update('Files', file, { record_ids: [...file.record_ids, ...records.map((r) => r.id)] });
  db.update('Intake_Docs', doc, { status, result: { records }, confirmed_by: ctx.user.id, confirmed_at: db.nowIso });
}

function confirm(ctx, input) {
  const { db } = ctx;
  const doc = openDoc(db, input.id, ['ready']);
  const def = INTAKE_KINDS[doc.kind];
  if (def.target === 'money') {
    if (!def.kinds.includes(input.kind)) throw fieldError({ kind: { code: 'val.choice', params: {} } });
    const entry = { ...prepareEntry(ctx, input), file_id: doc.file_id };
    const reply = record(ctx, entry, input);
    if (reply.status !== 'saved') return reply;
    fileOn(ctx, doc, [{ type: 'money', id: reply.record_id }], 'confirmed');
    return saved(doc.id, { records: [{ type: 'money', id: reply.record_id, approval: reply.data.approval }] });
  }
  if (def.target === 'delivery') {
    const earlier = input.challan && db.all('Deliveries').find((d) => d.publisher_id === input.publisher_id && d.challan.toLowerCase() === input.challan.toLowerCase());
    if (earlier) throw fieldError({ challan: { code: 'dup.challan', params: { id: earlier.id } } });
    const reply = createDelivery(ctx, {
      date: input.date, publisher_id: input.publisher_id, challan: input.challan, lines: input.lines || [],
      paid: input.paid, paid_account_id: input.paid_account_id, note: input.note,
    }, doc.file_id);
    fileOn(ctx, doc, [{ type: 'delivery', id: reply.record_id }], 'confirmed');
    return saved(doc.id, { records: [{ type: 'delivery', id: reply.record_id }] });
  }
  fileOn(ctx, doc, [], 'confirmed');
  return saved(doc.id, { records: [] });
}

// Files the document on a record that already exists (instead of a duplicate).
function attach(ctx, { id, record_id: recordId }) {
  const { db } = ctx;
  const doc = openDoc(db, id, ['needs_kind', 'ready']);
  const table = recordId.startsWith('TRX-') ? 'Transactions' : recordId.startsWith('DLV-') ? 'Deliveries' : null;
  const row = table ? db.get(table, recordId) : null;
  if (!row) throw fieldError({ record_id: { code: 'val.not_found', params: {} } });
  db.update(table, row, { file_id: doc.file_id });
  fileOn(ctx, doc, [{ type: table === 'Transactions' ? 'money' : 'delivery', id: recordId }], 'attached');
  return saved(doc.id);
}

function discard(ctx, { id, reason }) {
  const { db } = ctx;
  const doc = openDoc(db, id, ['needs_kind', 'ready']);
  db.setReason(reason);
  db.update('Intake_Docs', doc, { status: 'discarded', discard_reason: reason });
  // The same file may be uploaded again later.
  const file = db.get('Files', doc.file_id);
  db.update('Files', file, { status: 'discarded' });
  return saved(doc.id);
}

export const INTAKE_HANDLERS = {
  'intake.upload': upload,
  'intake.kind': setKind,
  'intake.get': get,
  'intake.list': list,
  'intake.confirm': confirm,
  'intake.attach': attach,
  'intake.discard': discard,
  'files.get': getFile,
};
