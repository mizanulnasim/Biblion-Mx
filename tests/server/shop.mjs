// A shop on the real server bundle, ready for money tests: an owner, a
// manager and a staff member signed in; the starting lists, with the cash
// drawer opening at Tk 1,000; categories Milk and Rent (Rent always needs a shareholder);
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
  // The first setup made Biblion's starting lists (rulebook S3): the cash
  // drawer, bKash and Rent are those, changed here.
  const start = call(owner, 'setup.money').data;
  const named = (list, name) => list.find((x) => x.name === name);
  const change = (action, row, fields) => id(call(owner, action, { ...row, ...fields }));
  const ids = {
    cash: change('setup.account.save', named(start.accounts, 'Cash drawer'), { opening: 1000 }),
    bkash: named(start.accounts, 'bKash').id,
    milk: id(call(owner, 'setup.category.save', { name: 'Milk', area: 'cafe', status: 'active' })),
    rent: change('setup.category.save', named(start.categories, 'Rent'), { needs_shareholder: true }),
    rahim: id(call(owner, 'setup.contact.save', { name: 'Rahim', phone: '01711000000', opening_due: 300, status: 'active' })),
    karim: id(call(owner, 'setup.shareholder.save', { name: 'Karim', status: 'active' })),
  };
  // Money tests start from a manager's entries being final; a shareholder
  // confirming them is the rulebook's start (tested in money.test.mjs).
  const approvals = Object.fromEntries(call(owner, 'settings.view').data.areas.approvals.map((i) => [i.key, i.value]));
  call(owner, 'settings.approvals.save', { ...approvals, 'approve.rule.other': 'final' });
  return { state, server, call, owner, manager: login('manager', 'manager-pass'), staff: login('staff', 'staff-pass'), ids };
}


// A Setup section's values (key → value), and saving some of them with the
// rest as they are.
export function settingsOf(s, area, token = s.owner) {
  const items = s.call(token, 'settings.view').data.areas[area];
  return Object.fromEntries(items.map((i) => [i.key, i.value]));
}

export function setSettings(s, area, changes, token = s.owner) {
  const values = settingsOf(s, area);
  // A kept secret shows only as true; leaving it out keeps it.
  delete values['intake.gemini_key'];
  return s.call(token, `settings.${area}.save`, { ...values, ...changes });
}
