// Café items, the checklist of common items, the daily closing count (with
// waste and expiry), and what is about to expire.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { STARTER_ITEMS } from '../../shared/cafe/starter.js';
import { usedBetween } from '../../shared/cafe/forecast.js';
import { setting } from '../kernel/settings.js';
import { dhakaDate } from './requisitions.js';

const DAY_MS = 86400000;
const fieldError = (fields) => new AppError('VALIDATION', {}, fields);
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
const round = (n) => Math.round(n * 100) / 100;

function pick(item) {
  return {
    id: item.id, version: item.version, name: item.name, name_bn: item.name_bn, aliases: item.aliases, kind: item.kind, unit: item.unit,
    vendor_id: item.vendor_id, shelf_life_days: item.shelf_life_days || 0, cover_days: item.cover_days || 14, lead_days: item.lead_days || 0,
    min_order: item.min_order || 0, order_multiple: item.order_multiple || 1, unit_cost: item.unit_cost || 0, status: item.status,
  };
}

function items(ctx) {
  return { items: ctx.db.all('Cafe_Items').map(pick).sort((a, b) => a.name.localeCompare(b.name)), starter: STARTER_ITEMS };
}

function saveItem(ctx, input) {
  const { db } = ctx;
  if (db.all('Cafe_Items').some((i) => i.id !== input.id && i.name.toLowerCase() === input.name.toLowerCase())) throw fieldError({ name: { code: 'val.taken', params: {} } });
  if (input.vendor_id) {
    const v = db.get('Suppliers', input.vendor_id);
    if (!v || v.kind !== 'vendor') throw fieldError({ vendor_id: { code: 'val.not_found', params: {} } });
  }
  const fields = {
    name: input.name, name_bn: input.name_bn || '', aliases: input.aliases || '', kind: input.kind, unit: input.unit,
    vendor_id: input.vendor_id || '', shelf_life_days: input.shelf_life_days || 0, cover_days: input.cover_days || 14,
    lead_days: input.lead_days || 0, min_order: input.min_order || 0, order_multiple: input.order_multiple || 1, status: input.status,
  };
  let row;
  if (!input.id) {
    row = db.insert('Cafe_Items', { ...fields, unit_cost: 0 });
  } else {
    const current = db.get('Cafe_Items', input.id);
    if (!current) throw new AppError('NOT_FOUND');
    if (!input.version) throw fieldError({ version: { code: 'val.required', params: {} } });
    row = db.update('Cafe_Items', current, fields, input.version);
  }
  return saved(row.id);
}

// Adds the chosen common items; ones already there (by name) are skipped.
function addStarter(ctx, { keys }) {
  const { db } = ctx;
  const have = new Set(db.all('Cafe_Items').map((i) => i.name.toLowerCase()));
  let added = 0;
  for (const { key } of keys) {
    const s = STARTER_ITEMS.find((x) => x.key === key);
    if (!s || have.has(s.name.toLowerCase())) continue;
    db.insert('Cafe_Items', {
      name: s.name, name_bn: s.name_bn, aliases: '', kind: s.kind, unit: s.unit, vendor_id: '', shelf_life_days: s.shelf,
      cover_days: s.cover, lead_days: 1, min_order: 0, order_multiple: 1, unit_cost: 0, status: 'active',
    });
    have.add(s.name.toLowerCase());
    added++;
  }
  return saved(null, { added });
}

// ---- Counts ----------------------------------------------------------------------

function receivedBetween(db, itemId, after, upTo) {
  return db.all('Cafe_Batches').filter((b) => b.item_id === itemId && (!after || b.received_date > after) && b.received_date <= upTo)
    .reduce((s, b) => s + b.qty, 0);
}

// Works out `used` for every count of an item from the one before it, so a
// count entered or corrected for an earlier day flows into the later ones.
// Before an item's first count it had nothing on hand except what came in;
// that use counts for expiry, but not for daily averages (its days are unknown).
export function recount(db, itemId) {
  const rows = db.all('Cafe_Counts').filter((c) => c.item_id === itemId).sort((a, b) => (a.date < b.date ? -1 : 1));
  rows.forEach((c, i) => {
    const prev = rows[i - 1];
    const received = round(receivedBetween(db, itemId, prev ? prev.date : '', c.date));
    const used = round(usedBetween(prev ? prev.counted : 0, received, c.wasted, c.expired, c.counted));
    const span = prev ? days(prev.date, c.date) : 0;
    if (c.received !== received || c.used !== used || c.days !== span) db.update('Cafe_Counts', c, { received, used, days: span });
  });
}

// What is on hand now: the latest count, plus what came in after it.
export function onHand(db, itemId) {
  const last = db.all('Cafe_Counts').filter((c) => c.item_id === itemId).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return round((last ? last.counted : 0) + receivedBetween(db, itemId, last ? last.date : '', '9999-12-31'));
}

// Upserts one count (or supply check) and recomputes the item's history.
export function putCount(db, userId, date, line) {
  const existing = db.all('Cafe_Counts').find((c) => c.item_id === line.item_id && c.date === date);
  const fields = {
    counted: line.counted, wasted: line.wasted || 0, waste_reason: line.waste_reason || '', expired: line.expired || 0, counted_by: userId,
  };
  if (existing) db.update('Cafe_Counts', existing, fields);
  else db.insert('Cafe_Counts', { date, item_id: line.item_id, ...fields, received: 0, used: 0, days: 0 });
  recount(db, line.item_id);
}

function countSheet(ctx, { date }) {
  const { db } = ctx;
  const counts = db.all('Cafe_Counts');
  const lines = db.all('Cafe_Items').filter((i) => i.status === 'active' && i.kind === 'stock').sort((a, b) => a.name.localeCompare(b.name)).map((item) => {
    const mine = counts.filter((c) => c.item_id === item.id);
    const prev = mine.filter((c) => c.date < date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const today = mine.find((c) => c.date === date);
    const received = round(receivedBetween(db, item.id, prev ? prev.date : '', date));
    return {
      item_id: item.id, name: item.name, name_bn: item.name_bn, unit: item.unit,
      before: prev ? prev.counted : null, before_date: prev ? prev.date : '', received,
      expected: prev ? round(prev.counted + received) : null,
      counted: today ? today.counted : null, wasted: today ? today.wasted : 0, waste_reason: today ? today.waste_reason : '',
      expired: today ? today.expired : 0, used: today ? today.used : null,
    };
  });
  return { date, lines, saved: lines.some((l) => l.counted !== null) };
}

function saveCount(ctx, { date, lines }) {
  const { db } = ctx;
  const fields = {};
  if (!lines.length) fields.lines = { code: 'val.no_lines', params: {} };
  lines.forEach((l, i) => {
    const item = db.get('Cafe_Items', l.item_id);
    if (!item) fields[`lines.${i}.item_id`] = { code: 'val.not_found', params: {} };
    if ((l.wasted || 0) > 0 && !l.waste_reason) fields[`lines.${i}.waste_reason`] = { code: 'val.waste_reason', params: {} };
  });
  if (Object.keys(fields).length) throw fieldError(fields);
  for (const l of lines) putCount(db, ctx.user.id, date, l);
  return saved(null, { counted: lines.length });
}

// ---- Expiry -------------------------------------------------------------------------
// Each item's use, waste and expiry are taken from its batches oldest first;
// what is left in a batch that expires soon (or has) is listed.

function expiry(ctx) {
  const { db } = ctx;
  const today = dhakaDate(db.now);
  const warn = setting(db, 'cafe.expiry_warn_days');
  const out = [];
  for (const item of db.all('Cafe_Items').filter((i) => i.status === 'active')) {
    let taken = db.all('Cafe_Counts').filter((c) => c.item_id === item.id).reduce((s, c) => s + c.used + c.wasted + c.expired, 0);
    const batches = db.all('Cafe_Batches').filter((b) => b.item_id === item.id).sort((a, b) => (a.received_date < b.received_date ? -1 : 1));
    for (const b of batches) {
      const fromThis = Math.min(b.qty, taken);
      taken -= fromThis;
      const left = round(b.qty - fromThis);
      if (left <= 0 || !b.expiry_date) continue;
      const inDays = days(today, b.expiry_date);
      if (inDays <= warn) out.push({ item_id: item.id, name: item.name, name_bn: item.name_bn, unit: item.unit, expiry_date: b.expiry_date, left, in_days: inDays });
    }
  }
  return { items: out.sort((a, b) => (a.expiry_date < b.expiry_date ? -1 : 1)), warn_days: warn };
}

export const CAFE_HANDLERS = {
  'cafe.items': items,
  'cafe.item.save': saveItem,
  'cafe.starter.add': addStarter,
  'cafe.count.get': countSheet,
  'cafe.count.save': saveCount,
  'cafe.expiry': expiry,
};
