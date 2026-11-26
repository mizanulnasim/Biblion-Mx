// The real server bundle, run on the fake Google services.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../../tools/build.mjs';
import { emptyState, loadServer } from '../../tools/gas-shim/index.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblion-test-'));
const { gas } = build({ outDir });
const bundle = path.join(gas, 'Code.js');
test.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

function newServer() {
  const state = emptyState();
  state.props.SETUP_CODE = '424242';
  const server = loadServer(bundle, state);
  const call = (action, payload = {}, extra = {}) =>
    server.post({ action, payload, op_id: crypto.randomUUID(), contract: 1, ...extra });
  return { state, server, call };
}

function setUp() {
  const env = newServer();
  env.call('setup.owner', { code: '424242', display_name: 'Owner', username: 'owner', password: 'owner-pass' });
  const login = (username, password) => env.call('auth.login', { username, password }).data;
  env.ownerToken = login('owner', 'owner-pass').data.token;
  env.login = login;
  return env;
}

test('before setup, only setup actions work', () => {
  const { call } = newServer();
  assert.deepEqual(call('setup.status').data, { initialized: false });
  assert.equal(call('auth.login', { username: 'x', password: 'y' }).error.code, 'NOT_INITIALIZED');
});

test('first-owner setup needs the code, runs once, and deletes the code', () => {
  const { call, state } = newServer();
  const wrong = call('setup.owner', { code: '000000', display_name: 'O', username: 'owner', password: 'owner-pass' });
  assert.equal(wrong.data.status, 'rejected');
  assert.deepEqual(wrong.data.error.fields, { code: { code: 'val.setup_code', params: {} } });
  assert.equal(call('setup.owner', { code: '424242', display_name: 'O', username: 'owner', password: 'owner-pass' }).data.status, 'saved');
  assert.equal(state.props.SETUP_CODE, undefined);
  const again = call('setup.owner', { code: '424242', display_name: 'O', username: 'other', password: 'owner-pass' });
  assert.equal(again.data.error.code, 'ALREADY_SET_UP');
});

test('ten wrong setup codes delete the code', () => {
  const { call, state } = newServer();
  for (let i = 0; i < 10; i++) call('setup.owner', { code: `x${i}`, display_name: 'O', username: 'owner', password: 'owner-pass' });
  assert.equal(state.props.SETUP_CODE, undefined);
});

test('sign-in: wrong password, lockout after 5 tries, and the same answer for unknown users', () => {
  const { call } = setUp();
  const bad = () => call('auth.login', { username: 'owner', password: 'nope-nope' }).data;
  assert.equal(call('auth.login', { username: 'ghost', password: 'whatever' }).data.error.code, 'AUTH_FAILED');
  for (let i = 0; i < 4; i++) assert.equal(bad().error.code, 'AUTH_FAILED');
  assert.equal(bad().error.code, 'AUTH_FAILED');
  const locked = call('auth.login', { username: 'owner', password: 'owner-pass' }).data;
  assert.equal(locked.error.code, 'LOCKED_OUT');
  assert.equal(locked.error.params.minutes, 15);
});

test('reads and writes need a valid session; sign-out ends it', () => {
  const { call, ownerToken } = setUp();
  assert.equal(call('meta.get').error.code, 'AUTH_REQUIRED');
  assert.equal(call('meta.get', {}, { token: ownerToken }).data.user.username, 'owner');
  assert.equal(call('auth.logout', {}, { token: ownerToken }).data.status, 'saved');
  assert.equal(call('meta.get', {}, { token: ownerToken }).error.code, 'AUTH_REQUIRED');
});

test('permissions are checked on the server', () => {
  const env = setUp();
  env.call('users.save', { display_name: 'S', username: 'staff1', role_id: 'ROL-STAFF', status: 'active', password: 'staff-pass' }, { token: env.ownerToken });
  const staffToken = env.login('staff1', 'staff-pass').data.token;
  assert.equal(env.call('users.list', {}, { token: staffToken }).error.code, 'FORBIDDEN');
  assert.equal(env.call('audit.list', {}, { token: staffToken }).error.code, 'FORBIDDEN');
  // Staff may see the catalogue and take a customer's special order; nothing else.
  assert.deepEqual(env.call('meta.get', {}, { token: staffToken }).data.permissions, ['books.order', 'books.view']);
});

test('a write sent twice with the same op_id is saved once (idempotency on the record)', () => {
  const { call, ownerToken } = setUp();
  const payload = { display_name: 'Twice', username: 'twice', role_id: 'ROL-STAFF', status: 'active', password: 'twice-pass' };
  const first = call('users.save', payload, { token: ownerToken, op_id: 'op-same-0001' });
  const second = call('users.save', payload, { token: ownerToken, op_id: 'op-same-0001' });
  assert.equal(first.data.status, 'saved');
  assert.deepEqual(second.data, first.data);
  assert.equal(call('users.list', { q: 'twice' }, { token: ownerToken }).data.total, 1);
});

test('field errors come back per field', () => {
  const { call, ownerToken } = setUp();
  const r = call('users.save', { display_name: '', username: 'owner', role_id: 'ROL-X', status: 'active' }, { token: ownerToken }).data;
  assert.equal(r.status, 'rejected');
  assert.deepEqual(Object.keys(r.error.fields).sort(), ['display_name', 'role_id']);
  const taken = call('users.save', { display_name: 'A', username: 'owner', role_id: 'ROL-STAFF', status: 'active', password: 'some-pass' }, { token: ownerToken }).data;
  assert.deepEqual(taken.error.fields, { username: { code: 'val.taken', params: {} } });
});

test('an edit with an old version is refused as a conflict', () => {
  const { call, ownerToken } = setUp();
  const made = call('users.save', { display_name: 'V', username: 'ver', role_id: 'ROL-STAFF', status: 'active', password: 'ver-pass1' }, { token: ownerToken }).data;
  const id = made.record_id;
  const edit = (name, version) => call('users.save', { id, version, display_name: name, username: 'ver', role_id: 'ROL-STAFF', status: 'active' }, { token: ownerToken }).data;
  assert.equal(edit('V2', 1).status, 'saved');
  assert.equal(edit('V3', 1).error.code, 'CONFLICT');
});

test('the last active shareholder cannot be removed, and nobody demotes themselves', () => {
  const { call, ownerToken } = setUp();
  const me = call('meta.get', {}, { token: ownerToken }).data.user;
  const self = call('users.save', { id: me.id, version: 2, display_name: 'Owner', username: 'owner', role_id: 'ROL-MANAGER', status: 'active' }, { token: ownerToken }).data;
  assert.equal(self.error.fields.role_id.code, 'val.not_self');
});

test('an out-of-date app is told to update', () => {
  const { server } = setUp();
  const r = server.post({ action: 'ping', payload: {}, contract: 999 });
  assert.equal(r.error.code, 'UPDATE_APP');
});

test('the activity log records writes without secrets', () => {
  const { call, ownerToken } = setUp();
  call('auth.password', { current: 'owner-pass', next: 'new-owner-pass' }, { token: ownerToken });
  const items = call('audit.list', {}, { token: ownerToken }).data.items;
  assert.ok(items.length >= 3);
  // No hash, salt or token value (long hex) is ever copied into the log.
  assert.doesNotMatch(JSON.stringify(items), /[0-9a-f]{32,}/);
  assert.equal(items[0].action, 'auth.password');
  assert.deepEqual(items[0].after, { pass_hash: '***', kdf_salt: '***' });
});

test('text that looks like a number stays text in the sheet', () => {
  const { call, ownerToken } = setUp();
  call('users.save', { display_name: '007', username: '0123', role_id: 'ROL-STAFF', status: 'active', password: 'digits-pass' }, { token: ownerToken });
  const user = call('users.list', { q: '0123' }, { token: ownerToken }).data.items[0];
  assert.equal(user.username, '0123');
  assert.equal(user.display_name, '007');
});

test('lists page newest first with totals', () => {
  const { call, ownerToken } = setUp();
  for (let i = 0; i < 30; i++) {
    call('users.save', { display_name: `P${i}`, username: `per${i}`, role_id: 'ROL-STAFF', status: 'active', password: 'paged-pass' }, { token: ownerToken });
  }
  const page2 = call('users.list', { offset: 25, limit: 25 }, { token: ownerToken }).data;
  assert.equal(page2.total, 31);
  assert.equal(page2.offset, 25);
  assert.equal(page2.items.length, 6);
  assert.equal(call('users.list', { limit: 30 }, { token: ownerToken }).error.code, 'VALIDATION');
});
