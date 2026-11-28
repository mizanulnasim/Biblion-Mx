// The data layer on the fake Google services: writes batched per request,
// undoing a failed write, and the table cache that reads use.

import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, gasGlobals } from '../../tools/gas-shim/index.mjs';

const state = emptyState();
Object.assign(globalThis, gasGlobals(state));
const { createDatabase, openDb } = await import('../../server/store/db.js');
createDatabase();

const rowsOf = (table) => openDb(new Date()).all(table).length;
const op = (id) => ({ op_id: id, user_id: 'USR-1', action: 'test', record_id: '', reply: {} });
const opsSheet = () => Object.values(state.books).find((b) => b.sheets.Ops).sheets.Ops;

test('writes wait for the flush, then go in one call per run of rows', () => {
  const before = rowsOf('Ops');
  let calls = 0;
  const real = globalThis.SpreadsheetApp.openById;
  globalThis.SpreadsheetApp.openById = (id) => {
    const book = real(id);
    const getSheetByName = book.getSheetByName;
    book.getSheetByName = (name) => {
      const sheet = getSheetByName(name);
      if (!sheet) return sheet;
      const getRange = sheet.getRange;
      sheet.getRange = (...args) => {
        const range = getRange(...args);
        const setValues = range.setValues;
        range.setValues = (v) => { calls++; return setValues(v); };
        return range;
      };
      return sheet;
    };
    return book;
  };
  try {
    const batch = openDb(new Date());
    for (let i = 0; i < 5; i++) batch.insert('Ops', op(`many-000${i}`));
    assert.equal(rowsOf('Ops'), before);
    batch.flush();
    // Five new rows in Ops (a log table, so no audit rows): one call.
    assert.equal(calls, 1);
    assert.equal(rowsOf('Ops'), before + 5);
  } finally {
    globalThis.SpreadsheetApp.openById = real;
  }
});

test('a write that fails part-way leaves nothing behind', () => {
  const db = openDb(new Date());
  const kept = db.insert('Ops', op('kept-0001'));
  db.flush();
  const before = { ops: rowsOf('Ops'), audit: rowsOf('Audit_Log') };

  const failing = openDb(new Date());
  failing.begin();
  failing.update('Ops', failing.get('Ops', kept.id), { action: 'changed' });
  failing.insert('Ops', op('gone-0001'));
  // A lookup that misses the request's memory writes the table first, so
  // some of the changes are already on the sheet when it fails.
  assert.equal(failing.findOne('Ops', 'op_id', 'nobody'), null);
  failing.insert('Ops', op('gone-0002'));
  failing.rollback();

  assert.equal(rowsOf('Ops'), before.ops);
  assert.equal(rowsOf('Audit_Log'), before.audit);
  assert.equal(openDb(new Date()).get('Ops', kept.id).action, 'test');
});

test('commit keeps the changes made so far', () => {
  const db = openDb(new Date());
  const before = rowsOf('Ops');
  db.begin();
  db.insert('Ops', op('kept-0002'));
  db.commit();
  db.insert('Ops', op('gone-0003'));
  db.rollback();
  assert.equal(rowsOf('Ops'), before + 1);
});

test('a read uses the cache, and never sees a table as it was before a write', () => {
  const reader = () => openDb(new Date(), { cache: true });
  const count = reader().all('Ops').length;
  assert.ok(Object.keys(state.cache).some((k) => k.startsWith('T:Ops:')));

  // Served from the cache: a change made behind the app's back isn't seen…
  const sheet = opsSheet();
  sheet.cells.push(sheet.cells[sheet.cells.length - 1].slice());
  assert.equal(reader().all('Ops').length, count);
  sheet.cells.pop();

  // …but any write through the app gives the table a new version.
  const writer = openDb(new Date());
  writer.insert('Ops', op('kept-0003'));
  writer.flush();
  assert.equal(reader().all('Ops').length, count + 1);

  state.props.CACHE_OFF = '1';
  sheet.cells.push(sheet.cells[sheet.cells.length - 1].slice());
  assert.equal(reader().all('Ops').length, count + 2);
  sheet.cells.pop();
  delete state.props.CACHE_OFF;
});
