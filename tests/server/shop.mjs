// A shop on the real server bundle, ready for money tests: an owner, a
// manager and a staff member signed in; a cash drawer (opening Tk 1,000)
// and bKash; categories Milk and Rent (Rent always needs a shareholder);
// Rahim with a Tk 300 due; shareholder Karim.

import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from '../../tools/build.mjs';
import { emptyState, loadServer } from '../../tools/gas-shim/index.mjs';

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblion-money-'));
const { gas } = build({ outDir });
test.after(() => fs.rmSync(outDir, { recursive: true, force: true }));

export function shop() {
  const state = emptyState();
  state.props.SETUP_CODE = '1';
  const server = loadServer(path.join(gas, 'Code.js'), state);
  const call = (token, action, payload = {}, opId = crypto.randomUUID()) =>
    server.post({ action, payload, token, op_id: opId, contract: 1 });
  call(null, 'setup.owner', { code: '1', display_name: 'Owner', username: 'owner', password: 'owner-pass' });
  const login = (u, p) => call(null, 'auth.login', { username: u, password: p }).data.data.token;
  const owner = login('owner', 'owner-pass');
  const id = (reply) => reply.data.record_id;
  call(owner, 'users.save', { display_name: 'Manager', username: 'manager', role_id: 'ROL-MANAGER', status: 'active', password: 'manager-pass' });
  call(owner, 'users.save', { display_name: 'Staff', username: 'staff', role_id: 'ROL-STAFF', status: 'active', password: 'staff-pass' });
  const ids = {
    cash: id(call(owner, 'setup.account.save', { name: 'Cash drawer', kind: 'drawer', opening: 1000, status: 'active' })),
    bkash: id(call(owner, 'setup.account.save', { name: 'bKash', kind: 'bkash', status: 'active' })),
    milk: id(call(owner, 'setup.category.save', { name: 'Milk', area: 'cafe', status: 'active' })),
    rent: id(call(owner, 'setup.category.save', { name: 'Rent', area: 'shared', needs_shareholder: true, status: 'active' })),
    rahim: id(call(owner, 'setup.contact.save', { name: 'Rahim', phone: '01711000000', opening_due: 300, status: 'active' })),
    karim: id(call(owner, 'setup.shareholder.save', { name: 'Karim', status: 'active' })),
  };
  return { call, owner, manager: login('manager', 'manager-pass'), staff: login('staff', 'staff-pass'), ids };
}

