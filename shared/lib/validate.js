// One validator for the browser and the server. The browser runs it before
// sending, so most mistakes are marked at once; the server runs it again and
// returns the same {field: {code, params}} map, so the form marks the fields.

import { latinDigits } from './search.js';

const COLOR = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9._-]+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RECORD_ID = /^[A-Z]{3}-[A-Z0-9]{4,20}$/;
const MAX_AMOUNT = 1000000000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const PIN = /^\d{4,6}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function realDate(text) {
  const m = ISO_DATE.exec(text);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function checkOne(spec, raw) {
  const empty = raw === undefined || raw === null || raw === '';
  if (empty) {
    if (spec.required) return { error: { code: 'val.required' } };
    return { value: null };
  }
  switch (spec.type) {
    case 'text':
    case 'username': {
      if (typeof raw !== 'string') return { error: { code: 'val.format' } };
      const value = spec.type === 'username' ? raw.trim().toLowerCase() : raw.trim();
      if (!value && spec.required) return { error: { code: 'val.required' } };
      const max = spec.max || 200;
      if (value.length > max) return { error: { code: 'val.too_long', params: { max } } };
      if (spec.min && value.length < spec.min) return { error: { code: 'val.too_short', params: { min: spec.min } } };
      if (spec.type === 'username' && !USERNAME.test(value)) return { error: { code: 'val.username' } };
      return { value };
    }
    case 'password': {
      if (typeof raw !== 'string') return { error: { code: 'val.format' } };
      const min = spec.min || 8;
      if (raw.length < min) return { error: { code: 'val.too_short', params: { min } } };
      if (raw.length > 200) return { error: { code: 'val.too_long', params: { max: 200 } } };
      return { value: raw };
    }
    case 'int': {
      // Digits typed in Bangla are stored as Latin digits.
      const value = typeof raw === 'number' ? raw : Number(latinDigits(raw).trim());
      if (!Number.isInteger(value)) return { error: { code: 'val.number' } };
      if (spec.min !== undefined && value < spec.min) return { error: { code: 'val.min', params: { min: spec.min } } };
      if (spec.max !== undefined && value > spec.max) return { error: { code: 'val.max', params: { max: spec.max } } };
      return { value };
    }
    case 'enum':
      if (!spec.values.includes(raw)) return { error: { code: 'val.choice' } };
      return { value: raw };
    // Several of the choices, kept in the choices' order.
    case 'set':
      if (!Array.isArray(raw) || raw.some((v) => !spec.values.includes(v))) return { error: { code: 'val.choice' } };
      return { value: spec.values.filter((v) => raw.includes(v)) };
    case 'bool':
      if (typeof raw !== 'boolean') return { error: { code: 'val.format' } };
      return { value: raw };
    case 'date': {
      const value = latinDigits(String(raw)).trim();
      if (!realDate(value)) return { error: { code: 'val.date' } };
      return { value };
    }
    case 'id':
      if (typeof raw !== 'string' || !RECORD_ID.test(raw)) return { error: { code: 'val.format' } };
      return { value: raw };
    // Taka, more than zero (or zero too, with `zero: true`), at most 2 decimals.
    // Commas and Bangla digits are accepted.
    case 'money': {
      const text = typeof raw === 'number' ? String(raw) : latinDigits(String(raw)).replace(/,/g, '').trim();
      if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: { code: 'val.amount' } };
      const value = Number(text);
      if (value < 0 || (value === 0 && !spec.zero)) return { error: { code: 'val.amount_positive' } };
      if (value > MAX_AMOUNT) return { error: { code: 'val.max', params: { max: MAX_AMOUNT } } };
      return { value };
    }
    // A time of day, "HH:MM" (24 hours).
    case 'time': {
      const value = latinDigits(String(raw)).trim();
      if (!TIME.test(value)) return { error: { code: 'val.time' } };
      return { value };
    }
    // Any number, with a decimal point (a map position, for example).
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(latinDigits(String(raw)).trim());
      if (!Number.isFinite(value)) return { error: { code: 'val.decimal' } };
      if (spec.min !== undefined && value < spec.min) return { error: { code: 'val.min', params: { min: spec.min } } };
      if (spec.max !== undefined && value > spec.max) return { error: { code: 'val.max', params: { max: spec.max } } };
      return { value };
    }
    // A month, "YYYY-MM".
    case 'month': {
      const value = latinDigits(String(raw)).trim();
      if (!MONTH.test(value)) return { error: { code: 'val.format' } };
      return { value };
    }
    // A PIN of 4 to 6 digits.
    case 'pin': {
      const value = latinDigits(String(raw)).trim();
      if (!PIN.test(value)) return { error: { code: 'val.pin' } };
      return { value };
    }
    // A moment, as an ISO time in UTC (what a phone records for a punch).
    case 'instant':
      if (typeof raw !== 'string' || !INSTANT.test(raw) || Number.isNaN(Date.parse(raw))) return { error: { code: 'val.format' } };
      return { value: raw };
    case 'color':
      if (typeof raw !== 'string' || !COLOR.test(raw)) return { error: { code: 'val.format' } };
      return { value: raw.toLowerCase() };
    case 'email': {
      const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      if (!EMAIL.test(value) || value.length > 120) return { error: { code: 'val.email' } };
      return { value };
    }
    default:
      return { error: { code: 'val.format' } };
  }
}

// A list of rows, each checked with `of` (a schema). Errors are reported as
// "<field>.<row>.<column>", for example dues.0.amount.
function checkList(spec, raw, key, fields) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    fields[key] = { code: 'val.format', params: {} };
    return null;
  }
  if (raw.length > (spec.max || 50)) {
    fields[key] = { code: 'val.max', params: { max: spec.max || 50 } };
    return null;
  }
  return raw.map((row, i) => {
    const out = {};
    for (const col of Object.keys(spec.of)) {
      const result = checkOne(spec.of[col], row && typeof row === 'object' ? row[col] : undefined);
      if (result.error) fields[`${key}.${i}.${col}`] = { code: result.error.code, params: result.error.params || {} };
      else out[col] = result.value;
    }
    return out;
  });
}

// Returns {value, fields}. `fields` is null when everything is valid.
// Keys that are not in the schema are dropped, so a client can't slip
// extra flags past the server.
export function validate(schema, input) {
  const source = input && typeof input === 'object' ? input : {};
  const value = {};
  const fields = {};
  for (const key of Object.keys(schema)) {
    if (schema[key].type === 'list') {
      value[key] = checkList(schema[key], source[key], key, fields);
      continue;
    }
    const result = checkOne(schema[key], source[key]);
    if (result.error) fields[key] = { code: result.error.code, params: result.error.params || {} };
    else value[key] = result.value;
  }
  return { value, fields: Object.keys(fields).length ? fields : null };
}
