// The one list of API actions. The server's router, the client's API layer
// and the hygiene check all read it.
//   write    changes data; needs an op_id and is applied once per op_id
//   replay   false for writes whose reply must never be stored (sessions)
//   public   needs no sign-in
//   perm     permission the router checks before the handler runs
//   offline  may be queued on the phone when there is no connection
//   cache    a read whose last reply is kept on the phone, per user
//   area     live-update area whose change number the write moves
//   schema   payload rules (shared/lib/validate.js)

import { ROLES } from '../schema/permissions.js';
import { KINDS } from '../money/kinds.js';

// Bumped whenever a request or reply changes shape. A client built for another
// contract is told to update itself (v1 bug S10).
export const CONTRACT = 1;

export const PAGE_SIZES = Object.freeze([25, 50, 100]);

const PAGED = {
  q: { type: 'text', max: 100 },
  offset: { type: 'int', min: 0 },
  limit: { type: 'enum', values: PAGE_SIZES },
};

const NAME = { type: 'text', required: true, max: 80 };
const STATUS = { type: 'enum', required: true, values: ['active', 'inactive'] };
const RULE = { type: 'enum', required: true, values: ['final', 'shareholder'] };
const SETUP_BASE = { id: { type: 'id' }, version: { type: 'int', min: 1 }, name: NAME, status: STATUS };
const USERNAME = { type: 'username', required: true, min: 3, max: 40 };

export const ACTIONS = Object.freeze({
  'ping': { public: true },
  'setup.status': { public: true },
  'setup.owner': {
    public: true, write: true, area: 'core',
    schema: {
      code: { type: 'text', required: true, max: 40 },
      display_name: NAME,
      username: USERNAME,
      password: { type: 'password', required: true },
    },
  },
  'auth.login': {
    public: true, write: true, replay: false,
    schema: { username: { type: 'username', required: true, max: 40 }, password: { type: 'text', required: true } },
  },
  'auth.logout': { write: true, replay: false },
  'auth.password': {
    write: true, replay: false,
    schema: { current: { type: 'text', required: true }, next: { type: 'password', required: true } },
  },
  'meta.get': {},
  'me.settings': {
    write: true, area: 'core',
    schema: {
      lang: { type: 'enum', values: ['en', 'bn'] },
      theme: { type: 'enum', values: ['light', 'dark', 'system'] },
      accent: { type: 'color' },
    },
  },
  'sync.version': {},
  'users.list': { perm: 'users.manage', cache: true, schema: PAGED },
  'users.save': {
    write: true, perm: 'users.manage', area: 'core',
    schema: {
      id: { type: 'text', max: 40 },
      version: { type: 'int', min: 1 },
      display_name: NAME,
      username: USERNAME,
      role_id: { type: 'enum', required: true, values: ROLES.map((r) => r.id) },
      status: { type: 'enum', required: true, values: ['active', 'inactive'] },
      password: { type: 'password' },
    },
  },
  'audit.list': { perm: 'audit.view', schema: PAGED },

  'home.get': {},
  'settings.approvals': { perm: 'settings.manage' },
  'settings.approvals.save': {
    write: true, perm: 'settings.manage', area: 'money',
    schema: {
      limit: { type: 'money', required: true },
      expense: RULE, income: RULE, transfer: RULE, other: RULE,
    },
  },

  'setup.money': { perm: 'acc.setup' },
  'setup.account.save': {
    write: true, perm: 'acc.setup', area: 'money',
    schema: { ...SETUP_BASE, kind: { type: 'enum', required: true, values: ['drawer', 'bkash', 'bank', 'owner'] }, opening: { type: 'int', min: 0 } },
  },
  'setup.category.save': {
    write: true, perm: 'acc.setup', area: 'money',
    schema: { ...SETUP_BASE, area: { type: 'enum', required: true, values: ['books', 'cafe', 'shared'] }, needs_shareholder: { type: 'bool' }, confirm_similar: { type: 'bool' } },
  },
  'setup.contact.save': {
    write: true, perm: 'acc.setup', area: 'money',
    schema: { ...SETUP_BASE, phone: { type: 'text', max: 20 }, opening_due: { type: 'int', min: 0 } },
  },
  'setup.shareholder.save': {
    write: true, perm: 'acc.setup', area: 'money',
    schema: { ...SETUP_BASE, phone: { type: 'text', max: 20 } },
  },

  'money.boot': { perm: 'acc.entry', cache: true },
  'money.list': {
    perm: 'acc.entry', cache: true,
    schema: { ...PAGED, kind: { type: 'enum', values: Object.keys(KINDS) }, state: { type: 'enum', values: ['waiting', 'final', 'cancelled'] } },
  },
  'money.get': { perm: 'acc.entry', schema: { id: { type: 'id', required: true } } },
  // Saved offline too. `reason` answers a duplicate warning; `replaces`
  // makes this a correction of an earlier entry; `pair_id` cancels the
  // other half when an expense and income are turned into one transfer.
  'money.save': {
    write: true, perm: 'acc.entry', offline: true, area: 'money',
    schema: {
      kind: { type: 'enum', required: true, values: Object.keys(KINDS) },
      date: { type: 'date', required: true },
      amount: { type: 'money', required: true },
      account_id: { type: 'id' },
      to_account_id: { type: 'id' },
      category_id: { type: 'id' },
      party_id: { type: 'id' },
      direction: { type: 'enum', values: ['in', 'out'] },
      note: { type: 'text', max: 300 },
      ref: { type: 'text', max: 60 },
      replaces: { type: 'id' },
      pair_id: { type: 'id' },
      reason: { type: 'text', max: 500 },
    },
  },
  'money.cancel': {
    write: true, perm: 'acc.entry', area: 'money',
    schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 500 } },
  },
  'money.approve': { write: true, perm: 'acc.approve', area: 'money', schema: { id: { type: 'id', required: true } } },
});
