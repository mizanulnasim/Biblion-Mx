// The data layer on the fake Google services: undoing a failed write, and
// the table cache that reads use.

import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, gasGlobals } from '../../tools/gas-shim/index.mjs';

const state = emptyState();
Object.assign(globalThis, gasGlobals(state));
const { createDatabase, openDb } = await import('../../server/store/db.js');
createDatabase();

const rowsOf = (table) => openDb(new Date()).all(table).length;
const op = (id) => ({ op_id: id, user_id: 'USR-1', action: 'test', record_id: '', reply: {} });

test('a write that fails part-way leaves nothing behind', () => {
  const db = openDb(new Date());
  const kept = db.insert('Ops', op('kept-0001'));
  const before = { ops: rowsOf('Ops'), audit: rowsOf('Audit_Log') };

  db.begin();
  db.update('Ops', kept, { action: 'changed' });
  db.insert('Ops', op('gone-0001'));
  db.insert('Ops', op('gone-0002'));
  db.rollback();

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
  const sheet = Object.values(state.books).find((b) => b.sheets.Ops).sheets.Ops;
  sheet.cells.push(sheet.cells[sheet.cells.length - 1].slice());
  assert.equal(reader().all('Ops').length, count);
  sheet.cells.pop();

  // …but any write through the app gives the table a new version.
  openDb(new Date()).insert('Ops', op('kept-0003'));
  assert.equal(reader().all('Ops').length, count + 1);

  state.props.CACHE_OFF = '1';
  sheet.cells.push(sheet.cells[sheet.cells.length - 1].slice());
  assert.equal(reader().all('Ops').length, count + 2);
  sheet.cells.pop();
  delete state.props.CACHE_OFF;
});
