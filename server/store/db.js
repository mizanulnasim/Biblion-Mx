// Table access over Google Sheets.
// - Row 1 of each sheet holds the column names; columns are matched by name.
// - Text is written with the plain-text format so Sheets never turns it into
//   dates or numbers.
// - A table is read at most once per request and kept in memory for it.
// - Every insert and update outside the log tables is written to Audit_Log.
// - Updates check the record's version (conflict check on every edit).

import { BASE_COLUMNS, TABLES } from './tables.js';
import { createSpreadsheet, getProp, openSpreadsheet, setProp, uuid } from '../platform.js';
import { AppError } from '../../shared/contract/errors.js';

const GROUP_NAMES = { core: 'Biblion data · core', accounts: 'Biblion data · accounts', books: 'Biblion data · books', cafe: 'Biblion data · café', hr: 'Biblion data · staff' };

function parseColumn(spec) {
  const [name, type = 's'] = spec.split(':');
  return { name, type };
}

const COLUMNS = {};
for (const table of Object.keys(TABLES)) {
  COLUMNS[table] = [...BASE_COLUMNS, ...TABLES[table].columns].map(parseColumn);
}

function encode(type, value) {
  if (value === null || value === undefined) return '';
  if (type === 'j') return JSON.stringify(value);
  if (type === 'b') return value ? '1' : '';
  if (type === 'n') return Number(value);
  return String(value);
}

function decode(type, value) {
  if (value === '' || value === null || value === undefined) {
    if (type === 'b') return false;
    return type === 's' ? '' : null;
  }
  if (type === 'j') return JSON.parse(value);
  if (type === 'b') return value === '1' || value === true;
  if (type === 'n') return Number(value);
  return String(value);
}

export function isInitialized() {
  return Boolean(getProp('DB_ID_core'));
}

export function createDatabase() {
  for (const group of Object.keys(GROUP_NAMES)) {
    if (!getProp(`DB_ID_${group}`)) setProp(`DB_ID_${group}`, createSpreadsheet(GROUP_NAMES[group]).getId());
  }
}

// The next person-friendly number in a table: RQ-0001, RQ-0002… (writes hold
// the script lock, so two can't take the same number).
export function nextNumber(rows, prefix) {
  const last = rows.reduce((max, r) => Math.max(max, Number(String(r.number || '').split('-').pop()) || 0), 0);
  return `${prefix}-${String(last + 1).padStart(4, '0')}`;
}

export function newId(prefix) {
  return `${prefix}-${uuid().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

// actor: {id, name} of the person writing; context: {action, op_id, reason}
export function openDb(now) {
  const nowIso = now.toISOString();
  const spreadsheets = {};
  const sheets = {};
  const rowsCache = {};
  let actor = { id: '', name: '' };
  let context = { action: '', op_id: '' };

  function spreadsheet(group) {
    if (!spreadsheets[group]) {
      if (!isInitialized()) throw new AppError('NOT_INITIALIZED');
      // A group added in a later release is created the first time it is used.
      if (!getProp(`DB_ID_${group}`)) createDatabase();
      spreadsheets[group] = openSpreadsheet(getProp(`DB_ID_${group}`));
    }
    return spreadsheets[group];
  }

  // Returns {sheet, header: [names]} and adds any missing columns.
  function open(table) {
    if (sheets[table]) return sheets[table];
    const book = spreadsheet(TABLES[table].group);
    let sheet = book.getSheetByName(table);
    const wanted = COLUMNS[table].map((c) => c.name);
    let header = [];
    if (!sheet) {
      sheet = book.insertSheet(table);
    } else if (sheet.getLastColumn() > 0) {
      header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    }
    const missing = wanted.filter((name) => !header.includes(name));
    if (missing.length) {
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
      header = header.concat(missing);
    }
    sheets[table] = { sheet, header };
    return sheets[table];
  }

  function types(table) {
    const map = {};
    for (const c of COLUMNS[table]) map[c.name] = c.type;
    return map;
  }

  function readRow(table, header, values, rowNumber) {
    const t = types(table);
    const row = { _row: rowNumber };
    header.forEach((name, i) => {
      if (t[name]) row[name] = decode(t[name], values[i]);
    });
    return row;
  }

  function all(table) {
    if (rowsCache[table]) return rowsCache[table];
    const { sheet, header } = open(table);
    const last = sheet.getLastRow();
    const values = last > 1 ? sheet.getRange(2, 1, last - 1, header.length).getValues() : [];
    rowsCache[table] = values.map((v, i) => readRow(table, header, v, i + 2));
    return rowsCache[table];
  }

  // Finds the first row whose column equals value, without reading the table.
  function findOne(table, column, value) {
    if (rowsCache[table]) return rowsCache[table].find((r) => r[column] === value) || null;
    const { sheet, header } = open(table);
    const col = header.indexOf(column) + 1;
    const last = sheet.getLastRow();
    if (!col || last < 2) return null;
    const cell = sheet.getRange(2, col, last - 1, 1).createTextFinder(String(value)).matchEntireCell(true).findNext();
    if (!cell) return null;
    const rowNumber = cell.getRow();
    return readRow(table, header, sheet.getRange(rowNumber, 1, 1, header.length).getValues()[0], rowNumber);
  }

  function get(table, id) {
    return findOne(table, 'id', id);
  }

  function writeRow(table, rowNumber, row) {
    const { sheet, header } = open(table);
    const t = types(table);
    const values = header.map((name) => (t[name] ? encode(t[name], row[name]) : ''));
    const formats = header.map((name) => (t[name] === 'n' ? 'General' : '@'));
    const range = sheet.getRange(rowNumber, 1, 1, header.length);
    range.setNumberFormats([formats]);
    range.setValues([values]);
  }

  function publicView(table, row) {
    const hidden = new Set(TABLES[table].secret || []);
    const out = {};
    for (const c of TABLES[table].columns) {
      const name = parseColumn(c).name;
      if (!hidden.has(name)) out[name] = row[name];
    }
    return out;
  }

  function audit(table, recordId, before, after) {
    if (TABLES[table].log) return;
    insert('Audit_Log', {
      user_id: actor.id,
      user_name: actor.name,
      action: context.action,
      table_name: table,
      record_id: recordId,
      before,
      after,
      reason: context.reason || '',
      op_id: context.op_id,
    });
  }

  function insert(table, data) {
    const { sheet } = open(table);
    const row = {
      ...data,
      id: data.id || newId(TABLES[table].prefix),
      created_at: nowIso,
      created_by: actor.id,
      updated_at: nowIso,
      updated_by: actor.id,
      version: 1,
    };
    const rowNumber = Math.max(sheet.getLastRow(), 1) + 1;
    writeRow(table, rowNumber, row);
    row._row = rowNumber;
    if (rowsCache[table]) rowsCache[table].push(row);
    audit(table, row.id, null, publicView(table, row));
    return row;
  }

  // `version` must match the stored version, or the edit is refused.
  function update(table, current, patch, version) {
    if (version !== undefined && version !== current.version) {
      throw new AppError('CONFLICT', { by: current.updated_by });
    }
    const row = { ...current, ...patch, updated_at: nowIso, updated_by: actor.id, version: current.version + 1 };
    writeRow(table, current._row, row);
    if (rowsCache[table]) rowsCache[table] = rowsCache[table].map((r) => (r._row === row._row ? row : r));
    const before = {};
    const after = {};
    const shown = publicView(table, row);
    const old = publicView(table, current);
    for (const key of Object.keys(shown)) {
      if (JSON.stringify(shown[key]) !== JSON.stringify(old[key])) {
        before[key] = old[key];
        after[key] = shown[key];
      }
    }
    // A change to a secret column is logged by name, never by value.
    for (const key of TABLES[table].secret || []) {
      if (row[key] !== current[key]) {
        before[key] = '***';
        after[key] = '***';
      }
    }
    if (Object.keys(after).length) audit(table, row.id, before, after);
    return row;
  }

  return {
    now,
    nowIso,
    setActor(next) {
      actor = { id: next.id, name: next.display_name || next.name || '' };
    },
    setContext(next) {
      context = next;
    },
    // The reason given for this write (a cancellation, a duplicate), kept in the activity log.
    setReason(reason) {
      context = { ...context, reason };
    },
    all,
    get,
    findOne,
    insert,
    update,
  };
}
