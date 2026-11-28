// Table access over Google Sheets.
// - Row 1 of each sheet holds the column names; columns are matched by name.
// - Text is written with the plain-text format so Sheets never turns it into
//   dates or numbers.
// - A table is read at most once per request and kept in memory for it.
// - Every insert and update outside the log tables is written to Audit_Log.
// - Updates check the record's version (conflict check on every edit).

import { BASE_COLUMNS, TABLES } from './tables.js';
import { allProps, cacheGetAll, cachePutAll, createSpreadsheet, getProp, openSpreadsheet, setProp, setProps, uuid } from '../platform.js';
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

// How long a table stays in the script cache, and the largest table kept
// there (in characters; bigger ones are always read from the sheet).
const CACHE_SECONDS = 600;
const CACHE_CHUNK = 90000;
const CACHE_MAX = 900000;

// actor: {id, name} of the person writing; context: {action, op_id, reason}
// cache: the request may use the script cache. Each table has a version (a
// script property) that every write changes, and the cache is keyed by it,
// so a reader never gets a table as it was before a write. A table the
// request itself changes is read from the sheet from then on.
// Script property CACHE_OFF turns the cache off.
export function openDb(now, { cache = false } = {}) {
  const nowIso = now.toISOString();
  const spreadsheets = {};
  const sheets = {};
  const rowsCache = {};
  const fromCache = new Set();
  // Tables this request changes: read from the sheet from then on.
  const bypass = new Set();
  let props = null;
  let actor = { id: '', name: '' };
  let context = { action: '', op_id: '' };
  // Every row this request changed, to undo them if it fails part-way:
  // {table, rowNumber, before} (before: null for a row it added).
  let journal = null;
  // Row writes wait here until flush(): table → Map(rowNumber → values), so
  // a request makes one sheet call per run of rows instead of several per
  // row. nextRow: the next empty row of each table. dirty: tables whose
  // version changes at the flush. flushed: "table:row" already on the sheet.
  const pending = {};
  const nextRow = {};
  const dirty = new Set();
  const flushed = new Set();

  const useCache = (table) => {
    if (!cache || bypass.has(table)) return false;
    if (!props) props = allProps();
    return !props.CACHE_OFF;
  };
  const versionKey = (table) => `TV_${table}`;
  // A table this request changed gets a new version at the flush.
  function touched(table) {
    dirty.add(table);
  }

  function cached(table) {
    const key = `T:${table}:${props[versionKey(table)] || '0'}`;
    const head = cacheGetAll([key])[key];
    if (!head) return null;
    const meta = JSON.parse(head);
    const keys = Array.from({ length: meta.chunks }, (_, i) => `${key}:${i}`);
    const parts = cacheGetAll(keys);
    if (keys.some((k) => !(k in parts))) return null;
    return { header: meta.header, values: JSON.parse(keys.map((k) => parts[k]).join('')) };
  }

  function keep(table, header, values) {
    const text = JSON.stringify(values);
    if (text.length > CACHE_MAX) return;
    const key = `T:${table}:${props[versionKey(table)] || '0'}`;
    const out = {};
    let chunks = 0;
    for (let i = 0; i < text.length || chunks === 0; i += CACHE_CHUNK) out[`${key}:${chunks++}`] = text.slice(i, i + CACHE_CHUNK);
    out[key] = JSON.stringify({ header, chunks });
    cachePutAll(out, CACHE_SECONDS);
  }

  function spreadsheet(group) {
    if (!spreadsheets[group]) {
      if (!isInitialized()) throw new AppError('NOT_INITIALIZED');
      // A group added in a later release is created the first time it is used.
      if (!getProp(`DB_ID_${group}`)) createDatabase();
      spreadsheets[group] = openSpreadsheet(getProp(`DB_ID_${group}`));
    }
    return spreadsheets[group];
  }

  // Returns {sheet, header: [names], rows} and adds any missing columns.
  // withRows: read the whole sheet in one call (rows: the values under
  // the header); otherwise only the header is read.
  function open(table, withRows = false) {
    if (sheets[table]) return sheets[table];
    const book = spreadsheet(TABLES[table].group);
    let sheet = book.getSheetByName(table);
    const wanted = COLUMNS[table].map((c) => c.name);
    let header = [];
    let rows = null;
    if (!sheet) {
      sheet = book.insertSheet(table);
      if (withRows) rows = [];
    } else if (withRows) {
      const grid = sheet.getDataRange().getValues();
      header = grid[0].map(String);
      while (header.length && header[header.length - 1] === '') header.pop();
      rows = grid.slice(1);
    } else if (sheet.getLastColumn() > 0) {
      header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
    }
    const missing = wanted.filter((name) => !header.includes(name));
    if (missing.length) {
      sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
      header = header.concat(missing);
    }
    sheets[table] = { sheet, header, rows };
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
    if (useCache(table)) {
      const hit = cached(table);
      if (hit) {
        fromCache.add(table);
        rowsCache[table] = hit.values.map((v, i) => readRow(table, hit.header, v, i + 2));
        return rowsCache[table];
      }
    }
    flushTable(table);
    const wasOpen = Boolean(sheets[table]);
    const opened = open(table, true);
    const { sheet, header } = opened;
    let values;
    if (!wasOpen && opened.rows) {
      // Read with the header just now: drop trailing empty rows, and pad or
      // cut each row to the header (new columns are empty).
      values = opened.rows.map((v) => header.map((_, i) => (i < v.length ? v[i] : '')));
      while (values.length && values[values.length - 1].every((v) => v === '' || v === null)) values.pop();
      opened.rows = null;
    } else {
      const last = sheet.getLastRow();
      values = last > 1 ? sheet.getRange(2, 1, last - 1, header.length).getValues() : [];
    }
    if (useCache(table)) keep(table, header, values);
    rowsCache[table] = values.map((v, i) => readRow(table, header, v, i + 2));
    return rowsCache[table];
  }

  // A table about to be changed is read again from the sheet if this
  // request had it from the cache, so nothing stale is written back.
  function fresh(table) {
    bypass.add(table);
    if (!fromCache.has(table)) return;
    fromCache.delete(table);
    delete rowsCache[table];
  }

  // Finds the first row whose column equals value, without reading the
  // table (from the whole table when it can come from the cache).
  function findOne(table, column, value) {
    if (!rowsCache[table] && useCache(table)) all(table);
    if (rowsCache[table]) return rowsCache[table].find((r) => r[column] === value) || null;
    flushTable(table);
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

  function encodeRow(table, row) {
    const t = types(table);
    return open(table).header.map((name) => (t[name] ? encode(t[name], row[name]) : ''));
  }

  function writeRow(table, rowNumber, row) {
    (pending[table] ||= new Map()).set(rowNumber, encodeRow(table, row));
  }

  // Writes a table's waiting rows, one sheet call per run of rows.
  function flushTable(table) {
    const rows = pending[table];
    if (!rows || !rows.size) return;
    delete pending[table];
    const { sheet, header } = open(table);
    const t = types(table);
    const formats = header.map((name) => (t[name] === 'n' ? 'General' : '@'));
    const numbers = [...rows.keys()].sort((a, b) => a - b);
    for (let i = 0; i < numbers.length;) {
      let j = i;
      while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
      const run = numbers.slice(i, j + 1);
      const range = sheet.getRange(run[0], 1, run.length, header.length);
      range.setNumberFormats(run.map(() => formats));
      range.setValues(run.map((n) => rows.get(n)));
      for (const n of run) flushed.add(`${table}:${n}`);
      i = j + 1;
    }
  }

  // Everything waiting goes to the sheets, and changed tables get new
  // versions (one property write).
  function flush() {
    for (const table of Object.keys(pending)) flushTable(table);
    if (!dirty.size) return;
    const versions = {};
    for (const table of dirty) versions[versionKey(table)] = uuid();
    dirty.clear();
    setProps(versions);
    if (props) for (const key of Object.keys(versions)) delete props[key];
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
    fresh(table);
    const row = {
      ...data,
      id: data.id || newId(TABLES[table].prefix),
      created_at: nowIso,
      created_by: actor.id,
      updated_at: nowIso,
      updated_by: actor.id,
      version: 1,
    };
    if (!nextRow[table]) {
      flushTable(table);
      nextRow[table] = Math.max(open(table).sheet.getLastRow(), 1) + 1;
    }
    const rowNumber = nextRow[table]++;
    writeRow(table, rowNumber, row);
    if (journal) journal.push({ table, rowNumber, before: null });
    touched(table);
    row._row = rowNumber;
    if (rowsCache[table]) rowsCache[table].push(row);
    audit(table, row.id, null, publicView(table, row));
    return row;
  }

  // `version` must match the stored version, or the edit is refused.
  function update(table, given, patch, version) {
    let current = given;
    if (fromCache.has(table)) {
      fresh(table);
      current = findOne(table, 'id', given.id);
      if (!current) throw new AppError('NOT_FOUND');
      // Changed by someone since the copy it was read from.
      if (version === undefined && current.version !== given.version) throw new AppError('CONFLICT', { by: current.updated_by });
    }
    if (version !== undefined && version !== current.version) {
      throw new AppError('CONFLICT', { by: current.updated_by });
    }
    const row = { ...current, ...patch, updated_at: nowIso, updated_by: actor.id, version: current.version + 1 };
    if (journal && !journal.some((j) => j.table === table && j.rowNumber === current._row)) journal.push({ table, rowNumber: current._row, before: current });
    writeRow(table, current._row, row);
    touched(table);
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
    // A write request: journal every change from here on.
    begin() {
      journal = [];
    },
    // Undo every change since begin(): changed rows get their earlier
    // values back, and added rows are removed (they are the last rows, and
    // the write lock is held, so nothing came after them).
    rollback() {
      if (!journal) return;
      const done = journal;
      journal = null;
      const onSheet = (j) => flushed.has(`${j.table}:${j.rowNumber}`);
      // Rows not yet written are simply dropped; written ones are undone.
      for (const j of done) if (pending[j.table]) pending[j.table].delete(j.rowNumber);
      for (const j of done.filter((x) => x.before && onSheet(x))) {
        writeRow(j.table, j.rowNumber, j.before);
        flushTable(j.table);
      }
      for (const j of done.filter((x) => !x.before && onSheet(x)).sort((a, b) => b.rowNumber - a.rowNumber)) open(j.table).sheet.deleteRow(j.rowNumber);
      for (const table of new Set(done.map((j) => j.table))) {
        delete rowsCache[table];
        delete nextRow[table];
        touched(table);
      }
      flush();
    },
    // Changes so far stay even if the write then fails (a wrong password
    // still counts towards the lockout).
    commit() {
      flush();
      if (journal) journal = [];
    },
    // The reason given for this write (a cancellation, a duplicate), kept in the activity log.
    setReason(reason) {
      context = { ...context, reason };
    },
    flush,
    all,
    get,
    findOne,
    insert,
    update,
  };
}
