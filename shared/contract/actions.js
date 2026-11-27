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
import { KINDS, SCREEN_KINDS } from '../money/kinds.js';
import { INTAKE_KINDS, MAX_UPLOAD_BYTES, UPLOAD_TYPES } from '../intake/kinds.js';
import { LETTER_KINDS } from '../hr/letters.js';
import { PUNCH_TYPES } from '../hr/attendance.js';
import { PRIORITIES, REPEATS, TASK_ROLES } from '../tasks/tasks.js';
import { REPORTS } from '../reports/reports.js';
import { MANUAL_STEPS } from '../schema/start.js';

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
const PUNCH_TYPE = { type: 'enum', required: true, values: PUNCH_TYPES };
const PLACE = {
  lat: { type: 'number', min: -90, max: 90 },
  lng: { type: 'number', min: -180, max: 180 },
  accuracy: { type: 'number', min: 0, max: 100000 },
};
const SIGNATURE = { type: 'text', required: true, max: 64 };
const SCORE_LINES = { type: 'list', max: 12, of: { score: { type: 'int', min: 1, max: 5 }, note: { type: 'text', max: 500 } } };
const LEAVE_DAYS = { type: 'number', min: 0, max: 365 };
const LETTER_TEXT = { type: 'text', required: true, max: 4000 };
const TASK_FIELDS = {
  title: { type: 'text', required: true, max: 120 },
  details: { type: 'text', max: 1000 },
  // Exactly one: a person, a role, a position or a team; each: a task for
  // every person of the role, position or team.
  staff_id: { type: 'id' },
  role: { type: 'enum', values: TASK_ROLES },
  position: { type: 'text', max: 60 },
  team_id: { type: 'id' },
  each: { type: 'bool' },
  priority: { type: 'enum', values: PRIORITIES },
  due_time: { type: 'time' },
  link: { type: 'text', max: 40 },
  // Items to fill in when doing the task.
  checklist: {
    type: 'list', max: 20,
    of: {
      label: { type: 'text', required: true, max: 120 }, type: { type: 'enum', required: true, values: ['check', 'number', 'text', 'photo'] },
      required: { type: 'bool' }, min: { type: 'number' }, max: { type: 'number' }, unit: { type: 'text', max: 12 },
    },
  },
  // Photos before and after, or a note, the person must give.
  evidence_before: { type: 'bool' },
  evidence_after: { type: 'bool' },
  evidence_note: { type: 'bool' },
};
const DECISION = {
  id: { type: 'id', required: true },
  decision: { type: 'enum', required: true, values: ['accept', 'reject'] },
  note: { type: 'text', max: 200 },
};

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
    write: true, replay: false, perm: 'me.password',
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
      own_password: { type: 'bool' },
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
    schema: { ...SETUP_BASE, kind: { type: 'enum', required: true, values: ['drawer', 'bkash', 'bank', 'owner'] }, opening: { type: 'int', min: 0 }, shareholder_id: { type: 'id' } },
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
    schema: {
      ...SETUP_BASE, phone: { type: 'text', max: 20 }, salary: { type: 'money', zero: true },
      opening_owed: { type: 'money', zero: true }, opening_owes: { type: 'money', zero: true },
    },
  },
  // ---- Month closing and shareholders ----
  'month.view': { perm: 'closing.month', schema: { month: { type: 'month' } } },
  'month.close': { write: true, perm: 'closing.month', area: 'money', schema: { month: { type: 'month', required: true }, note: { type: 'text', max: 300 } } },
  'month.reopen': { write: true, perm: 'closing.month', area: 'money', schema: { month: { type: 'month', required: true }, reason: { type: 'text', required: true, max: 300 } } },
  'shareholders.view': { perm: 'acc.shareholders' },
  'shareholders.shares.save': {
    write: true, perm: 'closing.month', area: 'money',
    schema: {
      from: { type: 'date', required: true },
      shares: { type: 'list', required: true, max: 20, of: { shareholder_id: { type: 'id', required: true }, percent: { type: 'number', required: true, min: 0, max: 100 } } },
      note: { type: 'text', max: 300 },
    },
  },
  'shareholders.loan.save': {
    write: true, perm: 'acc.loans', area: 'money',
    schema: {
      id: { type: 'id' }, version: { type: 'int', min: 1 }, shareholder_id: { type: 'id', required: true },
      direction: { type: 'enum', required: true, values: ['taken', 'given'] }, rate: { type: 'number', min: 0, max: 100 },
      opened: { type: 'date', required: true }, note: { type: 'text', max: 300 }, status: { type: 'enum', required: true, values: ['open', 'closed'] },
    },
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
      kind: { type: 'enum', required: true, values: SCREEN_KINDS },
      date: { type: 'date', required: true },
      amount: { type: 'money', required: true },
      account_id: { type: 'id' },
      to_account_id: { type: 'id' },
      category_id: { type: 'id' },
      party_id: { type: 'id' },
      direction: { type: 'enum', values: ['in', 'out'] },
      note: { type: 'text', max: 300 },
      ref: { type: 'text', max: 60 },
      covers_up_to: { type: 'date' },
      period: { type: 'month' },
      instalment: { type: 'money' },
      loan_id: { type: 'id' },
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

  // The daily shift: what the form needs for a date, and saving it (also
  // offline; on sending, the one-per-date rule and the guards run again).
  'shift.prepare': { perm: 'acc.daily', cache: true, schema: { date: { type: 'date', required: true } } },
  'shift.save': {
    write: true, perm: 'acc.daily', offline: true, area: 'money',
    schema: {
      date: { type: 'date', required: true },
      net_sales: { type: 'money', required: true },
      books_sales: { type: 'money', zero: true },
      cash: { type: 'money', zero: true },
      bkash: { type: 'money', zero: true },
      card: { type: 'money', zero: true },
      dues: { type: 'list', max: 30, of: { party_id: { type: 'id', required: true }, amount: { type: 'money', required: true } } },
      handed: { type: 'money', zero: true },
      handed_to: { type: 'id' },
      bkash_account_id: { type: 'id' },
      card_account_id: { type: 'id' },
      actual_cash: { type: 'money', zero: true, required: true },
      // Loyverse's own expected cash, shown beside the app's (owner decision:
      // the app's figure counts).
      pos_expected: { type: 'money', zero: true },
      note: { type: 'text', max: 300 },
      replaces: { type: 'id' },
      reason: { type: 'text', max: 500 },
    },
  },

  // Vendors and publishers: their terms, what is owed, and statements.
  'setup.supplier.save': {
    write: true, perm: 'setup.books', area: 'books',
    schema: {
      ...SETUP_BASE,
      kind: { type: 'enum', required: true, values: ['vendor', 'publisher'] },
      phone: { type: 'text', max: 20 },
      commission: { type: 'int', min: 0, max: 100 },
      sell_discount: { type: 'int', min: 0, max: 100 },
      pays_on: { type: 'enum', values: ['sale', 'delivery'] },
      opening_due: { type: 'int', min: 0 },
    },
  },
  // What the shop owes is for people who see all money (shareholders).
  'suppliers.list': { perm: 'acc.view_all' },
  'supplier.statement': { perm: 'acc.view_all', schema: { id: { type: 'id', required: true } } },
  'publisher.suggest': { perm: 'acc.view_all', schema: { id: { type: 'id', required: true }, amount: { type: 'money', zero: true } } },

  // Books: the catalogue, stock, deliveries and typed sales.
  'books.boot': { perm: 'books.view', cache: true },
  'books.list': { perm: 'books.view', cache: true, schema: { ...PAGED, publisher_id: { type: 'id' }, stock: { type: 'enum', values: ['in', 'out'] } } },
  'books.save': {
    write: true, perm: 'books.catalog', area: 'books',
    schema: {
      id: { type: 'id' },
      version: { type: 'int', min: 1 },
      title: { type: 'text', required: true, max: 200 },
      author: { type: 'text', max: 120 },
      isbn: { type: 'text', max: 20 },
      publisher_id: { type: 'id', required: true },
      printed_price: { type: 'money', required: true },
      sell_price: { type: 'money' },
      aliases: { type: 'text', max: 300 },
      status: STATUS,
    },
  },
  'books.adjust': {
    write: true, perm: 'books.adjust', area: 'books',
    schema: {
      book_id: { type: 'id', required: true },
      date: { type: 'date', required: true },
      kind: { type: 'enum', required: true, values: ['damaged', 'lost', 'found', 'returned'] },
      qty: { type: 'int', required: true, min: 1, max: 10000 },
      reason: { type: 'text', required: true, max: 300 },
    },
  },
  'books.moves': { perm: 'books.view', schema: { book_id: { type: 'id', required: true } } },
  'books.move.cancel': { write: true, perm: 'books.adjust', area: 'books', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 300 } } },
  'books.delivery.save': {
    write: true, perm: 'books.receive', area: 'books',
    schema: {
      date: { type: 'date', required: true },
      publisher_id: { type: 'id', required: true },
      challan: { type: 'text', max: 60 },
      lines: {
        type: 'list', max: 300,
        of: {
          book_id: { type: 'id' },
          title: { type: 'text', max: 200 },
          author: { type: 'text', max: 120 },
          printed_price: { type: 'money', required: true },
          qty: { type: 'int', required: true, min: 1, max: 10000 },
          damaged: { type: 'int', min: 0, max: 10000 },
          // Damaged copies: sent back, or kept at full or a lower cost.
          damaged_action: { type: 'enum', values: ['return', 'keep', 'keep_lower'] },
          damaged_cost: { type: 'money', zero: true },
          unit_cost: { type: 'money', zero: true },
          // Against a requisition: its line, and what happens to copies short or extra.
          req_line: { type: 'text', max: 20 },
          short_action: { type: 'enum', values: ['expected', 'not_coming'] },
          extra_action: { type: 'enum', values: ['keep', 'return'] },
        },
      },
      requisition_id: { type: 'id' },
      paid: { type: 'money', zero: true },
      paid_account_id: { type: 'id' },
      charge: { type: 'money', zero: true },
      charge_account_id: { type: 'id' },
      charge_category_id: { type: 'id' },
      note: { type: 'text', max: 300 },
    },
  },
  'books.deliveries': { perm: 'books.view', schema: PAGED },
  'books.delivery.get': { perm: 'books.view', schema: { id: { type: 'id', required: true } } },
  'books.sales.save': {
    write: true, perm: 'books.sell', offline: true, area: 'books',
    schema: {
      date: { type: 'date', required: true },
      lines: { type: 'list', max: 200, of: { book_id: { type: 'id', required: true }, qty: { type: 'int', required: true, min: 1, max: 10000 }, amount: { type: 'money', zero: true, required: true } } },
    },
  },
  'books.sales.day': { perm: 'books.view', schema: { date: { type: 'date', required: true } } },

  // Requisitions to publishers.
  'books.reqs': { perm: 'books.view', schema: { ...PAGED, status: { type: 'enum', values: ['draft', 'sent', 'part', 'received', 'closed'] } } },
  'books.req.get': { perm: 'books.view', schema: { id: { type: 'id', required: true } } },
  'books.req.build': { write: true, perm: 'books.requisition', area: 'books', schema: { publisher_id: { type: 'id', required: true } } },
  'books.req.save': {
    write: true, perm: 'books.requisition', area: 'books',
    schema: {
      id: { type: 'id', required: true },
      version: { type: 'int', required: true, min: 1 },
      lines: { type: 'list', max: 300, of: { key: { type: 'text', max: 20 }, book_id: { type: 'id' }, title: { type: 'text', max: 200 }, qty: { type: 'int', required: true, min: 0, max: 10000 } } },
      note: { type: 'text', max: 300 },
    },
  },
  'books.req.send': { write: true, perm: 'books.requisition', area: 'books', schema: { id: { type: 'id', required: true } } },
  'books.req.close': { write: true, perm: 'books.requisition', area: 'books', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 300 } } },

  // Special orders from customers. Staff may take one; following them up
  // shows customers' names and phones, so it needs books.orders.
  'books.order.save': {
    write: true, perm: 'books.order', offline: true, area: 'books',
    schema: {
      customer_name: { type: 'text', required: true, max: 80 },
      phone: { type: 'text', required: true, max: 20 },
      book_id: { type: 'id' },
      title: { type: 'text', max: 200 },
      publisher_id: { type: 'id' },
      qty: { type: 'int', required: true, min: 1, max: 50 },
      advance: { type: 'money', zero: true },
      note: { type: 'text', max: 300 },
    },
  },
  'books.orders': { perm: 'books.orders', schema: { ...PAGED, status: { type: 'enum', values: ['open', 'arrived', 'done'] } } },
  'books.order.act': {
    write: true, perm: 'books.orders', area: 'books',
    schema: { id: { type: 'id', required: true }, act: { type: 'enum', required: true, values: ['told', 'collected', 'cancel'] }, reason: { type: 'text', max: 300 } },
  },

  // Full stock-take: start, count (in several sittings), apply.
  'books.stocktake': { perm: 'books.adjust' },
  'books.stocktake.start': { write: true, perm: 'books.adjust', area: 'books', schema: { publisher_id: { type: 'id' }, opening: { type: 'bool' } } },
  'books.stocktake.save': {
    write: true, perm: 'books.adjust', area: 'books',
    schema: { id: { type: 'id', required: true }, counts: { type: 'list', max: 5000, of: { book_id: { type: 'id', required: true }, counted: { type: 'int', min: 0, max: 100000 } } } },
  },
  'books.stocktake.apply': { write: true, perm: 'books.adjust', area: 'books', schema: { id: { type: 'id', required: true } } },
  'books.stocktake.cancel': { write: true, perm: 'books.adjust', area: 'books', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 300 } } },
  // The opening stock, sent for approval: approved by a shareholder who
  // didn't count or send it, or sent back with a reason.
  'books.opening.decide': {
    write: true, perm: 'acc.approve', area: 'books',
    schema: { id: { type: 'id', required: true }, decision: { type: 'enum', required: true, values: ['approve', 'send_back'] }, reason: { type: 'text', max: 300 } },
  },
  // Getting started: the start date and the opening-figures checklist.
  'start.view': { perm: 'acc.setup' },
  'start.date.save': { write: true, perm: 'acc.setup', area: 'money', schema: { start_date: { type: 'date', required: true } } },
  'start.step.save': { write: true, perm: 'acc.setup', area: 'money', schema: { step: { type: 'enum', required: true, values: MANUAL_STEPS }, done: { type: 'bool', required: true } } },

  // Uploads: a document comes in, is read, is told what it is, and its
  // entries are checked and confirmed in one go (or it is filed on an
  // existing record, or discarded).
  'intake.upload': {
    write: true, perm: 'intake.upload', area: 'intake',
    schema: {
      name: { type: 'text', required: true, max: 120 },
      mime: { type: 'enum', required: true, values: UPLOAD_TYPES },
      data: { type: 'text', required: true, max: Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 4 },
    },
  },
  'intake.kind': { write: true, perm: 'intake.upload', area: 'intake', schema: { id: { type: 'id', required: true }, kind: { type: 'enum', required: true, values: Object.keys(INTAKE_KINDS) } } },
  'intake.get': { perm: 'intake.upload', schema: { id: { type: 'id', required: true } } },
  'intake.list': { perm: 'intake.upload', schema: { ...PAGED, status: { type: 'enum', values: ['open', 'done'] } } },
  'intake.confirm': {
    write: true, perm: 'intake.upload', area: 'money',
    schema: {
      id: { type: 'id', required: true },
      // A money entry …
      kind: { type: 'enum', values: SCREEN_KINDS },
      date: { type: 'date', required: true },
      amount: { type: 'money' },
      account_id: { type: 'id' },
      to_account_id: { type: 'id' },
      category_id: { type: 'id' },
      party_id: { type: 'id' },
      ref: { type: 'text', max: 60 },
      note: { type: 'text', max: 300 },
      // … or a book delivery.
      publisher_id: { type: 'id' },
      challan: { type: 'text', max: 60 },
      lines: { type: 'list', max: 300, of: { book_id: { type: 'id' }, title: { type: 'text', max: 200 }, printed_price: { type: 'money', required: true }, qty: { type: 'int', required: true, min: 1, max: 10000 }, unit_cost: { type: 'money', zero: true } } },
      paid: { type: 'money', zero: true },
      paid_account_id: { type: 'id' },
      reason: { type: 'text', max: 500 },
    },
  },
  'intake.attach': { write: true, perm: 'intake.upload', area: 'intake', schema: { id: { type: 'id', required: true }, record_id: { type: 'id', required: true } } },
  'intake.discard': { write: true, perm: 'intake.upload', area: 'intake', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 300 } } },
  'files.get': { perm: 'intake.upload', schema: { id: { type: 'id', required: true } } },
  'settings.intake': { perm: 'settings.manage' },
  'settings.intake.save': {
    write: true, perm: 'settings.manage', replay: false,
    schema: { ai: { type: 'enum', required: true, values: ['off', 'bills'] }, key: { type: 'text', max: 200 }, clear_key: { type: 'bool' } },
  },

  // Café: items, the daily count, expiry, and orders.
  'cafe.items': { perm: 'cafe.view', cache: true },
  'cafe.item.save': {
    write: true, perm: 'cafe.setup', area: 'cafe',
    schema: {
      id: { type: 'id' },
      version: { type: 'int', min: 1 },
      name: NAME,
      name_bn: { type: 'text', max: 80 },
      aliases: { type: 'text', max: 300 },
      kind: { type: 'enum', required: true, values: ['stock', 'supply'] },
      unit: { type: 'text', required: true, max: 20 },
      vendor_id: { type: 'id' },
      shelf_life_days: { type: 'int', min: 0, max: 3650 },
      cover_days: { type: 'int', min: 1, max: 120 },
      lead_days: { type: 'int', min: 0, max: 60 },
      min_order: { type: 'int', min: 0, max: 100000 },
      order_multiple: { type: 'int', min: 1, max: 10000 },
      status: STATUS,
    },
  },
  'cafe.starter.add': { write: true, perm: 'cafe.setup', area: 'cafe', schema: { keys: { type: 'list', max: 60, of: { key: { type: 'text', required: true, max: 20 } } } } },
  'cafe.count.get': { perm: 'cafe.count', cache: true, schema: { date: { type: 'date', required: true } } },
  'cafe.count.save': {
    write: true, perm: 'cafe.count', offline: true, area: 'cafe',
    schema: {
      date: { type: 'date', required: true },
      lines: {
        type: 'list', max: 200,
        of: {
          item_id: { type: 'id', required: true },
          counted: { type: 'money', zero: true, required: true },
          wasted: { type: 'money', zero: true },
          waste_reason: { type: 'text', max: 100 },
          expired: { type: 'money', zero: true },
        },
      },
    },
  },
  'cafe.expiry': { perm: 'cafe.view' },
  'cafe.orders': { perm: 'cafe.view', schema: { ...PAGED, status: { type: 'enum', values: ['draft', 'waiting', 'approved', 'part', 'bought', 'closed'] } } },
  'cafe.order.get': { perm: 'cafe.view', schema: { id: { type: 'id', required: true } } },
  'cafe.order.new': { write: true, perm: 'cafe.order', area: 'cafe', schema: { vendor_id: { type: 'id' }, cover: { type: 'enum', required: true, values: ['auto', 'item', '7', '14', '30', '60', '90'] } } },
  'cafe.order.save': {
    write: true, perm: 'cafe.order', area: 'cafe',
    schema: {
      id: { type: 'id', required: true },
      version: { type: 'int', required: true, min: 1 },
      lines: { type: 'list', max: 200, of: { item_id: { type: 'id', required: true }, on_hand: { type: 'money', zero: true }, qty: { type: 'money', zero: true, required: true }, reason: { type: 'text', max: 200 } } },
      note: { type: 'text', max: 300 },
    },
  },
  'cafe.order.submit': { write: true, perm: 'cafe.order', area: 'cafe', schema: { id: { type: 'id', required: true } } },
  'cafe.order.approve': { write: true, perm: 'cafe.approve', area: 'cafe', schema: { id: { type: 'id', required: true } } },
  'cafe.order.receive': {
    write: true, perm: 'cafe.receive', area: 'cafe',
    schema: {
      id: { type: 'id', required: true },
      date: { type: 'date', required: true },
      vendor_id: { type: 'id', required: true },
      bill_no: { type: 'text', max: 60 },
      paid: { type: 'enum', required: true, values: ['now', 'later'] },
      account_id: { type: 'id' },
      lines: { type: 'list', max: 200, of: { item_id: { type: 'id', required: true }, qty: { type: 'money', required: true }, cost: { type: 'money', zero: true, required: true }, expiry: { type: 'date' } } },
      reason: { type: 'text', max: 500 },
    },
  },
  'cafe.order.close': { write: true, perm: 'cafe.order', area: 'cafe', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 300 } } },

  'settings.cafe': { perm: 'settings.manage' },
  'settings.cafe.save': {
    write: true, perm: 'settings.manage', area: 'cafe',
    schema: {
      approve: { type: 'enum', required: true, values: ['final', 'shareholder'] },
      expiry_warn_days: { type: 'int', required: true, min: 0, max: 30 },
      min_history_days: { type: 'int', required: true, min: 3, max: 28 },
    },
  },
  'settings.books': { perm: 'settings.books' },
  'settings.books.save': {
    write: true, perm: 'settings.books', area: 'books',
    schema: { req_auto: { type: 'enum', required: true, values: ['off', 'weekly', 'monthly'] }, req_days: { type: 'int', required: true, min: 7, max: 365 } },
  },

  // Day closing: the checklist for a date, closing it, and reopening it.
  'closing.day': { perm: 'closing.day', schema: { date: { type: 'date', required: true } } },
  'closing.day.close': { write: true, perm: 'closing.day', area: 'money', schema: { date: { type: 'date', required: true }, note: { type: 'text', max: 300 } } },
  'closing.day.reopen': {
    write: true, perm: 'acc.approve', area: 'money',
    schema: { date: { type: 'date', required: true }, reason: { type: 'text', required: true, max: 500 } },
  },
  // ---- Staff and attendance ----
  'staff.list': { perm: 'staff.view', schema: { ...PAGED, status: { type: 'enum', values: ['active', 'left'] } } },
  'staff.save': {
    write: true, perm: 'staff.edit', area: 'hr',
    schema: {
      id: { type: 'id' },
      version: { type: 'int', min: 1 },
      name: NAME,
      name_bn: { type: 'text', max: 80 },
      phone: { type: 'text', max: 20 },
      email: { type: 'email' },
      position: { type: 'text', max: 60 },
      user_id: { type: 'id' },
      joined_on: { type: 'date' },
      left_on: { type: 'date' },
      status: { type: 'enum', required: true, values: ['active', 'left'] },
      work_start: { type: 'time' },
      work_end: { type: 'time' },
      days_off: { type: 'list', max: 7, of: { day: { type: 'int', required: true, min: 0, max: 6 } } },
      // The shifts the person may choose; empty: any.
      shift_ids: { type: 'list', max: 30, of: { id: { type: 'id', required: true } } },
      nid: { type: 'text', max: 30 },
      birth_date: { type: 'date' },
      address: { type: 'text', max: 300 },
      emergency: { type: 'list', max: 3, of: { name: { type: 'text', max: 80 }, relation: { type: 'text', max: 40 }, phone: { type: 'text', max: 20 } } },
      family: { type: 'text', max: 500 },
      salary: { type: 'money', zero: true },
      overtime_rate: { type: 'money', zero: true },
      pin: { type: 'pin' },
    },
  },
  'attendance.pin': { write: true, area: 'hr', schema: { pin: { type: 'pin', required: true } } },
  // The person's own phone, email and address: a change waits for a manager.
  'staff.my_details': { cache: true },
  'staff.my_details.save': {
    write: true, offline: true, area: 'hr',
    schema: { phone: { type: 'text', max: 20 }, email: { type: 'email' }, address: { type: 'text', max: 300 } },
  },
  'staff.details.waiting': { perm: 'staff.edit' },
  'staff.details.decide': { write: true, perm: 'staff.edit', area: 'hr', schema: DECISION },
  'attendance.punch': {
    write: true, offline: true, area: 'hr',
    schema: { type: PUNCH_TYPE, device_ts: { type: 'instant', required: true }, ...PLACE, reason: { type: 'text', max: 200 } },
  },
  'attendance.today': { cache: true },
  'attendance.mine': { cache: true, schema: { month: { type: 'month' } } },
  'attendance.staff': { perm: 'attendance.view', schema: { staff_id: { type: 'id', required: true }, month: { type: 'month' } } },
  'attendance.board': { perm: 'attendance.view', schema: { date: { type: 'date' } } },
  'attendance.checks': { perm: 'attendance.manage' },
  'attendance.fix': {
    write: true, area: 'hr',
    schema: {
      staff_id: { type: 'id' },
      date: { type: 'date', required: true },
      type: PUNCH_TYPE,
      time: { type: 'time', required: true },
      replaces: { type: 'id' },
      reason: { type: 'text', required: true, max: 200 },
    },
  },
  'attendance.fix.withdraw': { write: true, area: 'hr', schema: { id: { type: 'id', required: true } } },
  'attendance.decide': {
    write: true, perm: 'attendance.manage', area: 'hr',
    schema: {
      kind: { type: 'enum', required: true, values: ['punch', 'fix'] },
      id: { type: 'id', required: true },
      decision: { type: 'enum', required: true, values: ['accept', 'reject'] },
      note: { type: 'text', max: 200 },
    },
  },
  // The reply holds the device's secret, so it is never stored.
  'attendance.device.register': { write: true, replay: false, perm: 'attendance.manage', area: 'hr', schema: { name: NAME } },
  'attendance.devices': { perm: 'attendance.manage' },
  'attendance.device.save': {
    write: true, perm: 'attendance.manage', area: 'hr',
    schema: { id: { type: 'id', required: true }, version: { type: 'int', required: true, min: 1 }, name: NAME, status: STATUS },
  },
  // A shop punch device proves itself with its signature, not a sign-in.
  'attendance.device.staff': {
    public: true,
    schema: { device_id: { type: 'id', required: true }, ts: { type: 'instant', required: true }, sig: SIGNATURE },
  },
  'attendance.device.punch': {
    public: true, write: true, offline: true, area: 'hr',
    schema: {
      punch_id: { type: 'text', required: true, max: 40 },
      staff_id: { type: 'id', required: true },
      type: PUNCH_TYPE,
      device_ts: { type: 'instant', required: true },
      ...PLACE,
      device_id: { type: 'id', required: true },
      sig: SIGNATURE,
    },
  },
  'settings.attendance': { perm: 'settings.manage' },
  'settings.attendance.save': {
    write: true, perm: 'settings.manage', area: 'hr',
    schema: {
      lat: { type: 'number', min: -90, max: 90 },
      lng: { type: 'number', min: -180, max: 180 },
      radius_m: { type: 'int', required: true, min: 10, max: 5000 },
      max_accuracy_m: { type: 'int', required: true, min: 10, max: 5000 },
      exception: { type: 'enum', required: true, values: ['check', 'block'] },
      late_grace: { type: 'int', required: true, min: 0, max: 240 },
      early_grace: { type: 'int', required: true, min: 0, max: 240 },
      incomplete_after: { type: 'int', required: true, min: 0, max: 1440 },
      duplicate_window_sec: { type: 'int', required: true, min: 0, max: 3600 },
      clock_skew_flag_min: { type: 'int', required: true, min: 1, max: 1440 },
      offline_max_age_days: { type: 'int', required: true, min: 1, max: 60 },
      offline_auto_validate: { type: 'bool' },
      device_enabled: { type: 'bool' },
      shop_open: { type: 'time', required: true },
      shop_close: { type: 'time', required: true },
      flex: { type: 'int', min: 0, max: 240 },
    },
  },
  // ---- Rota, holidays and leave ----
  'rota.week': { cache: true, schema: { from: { type: 'date' } } },
  'rota.set': {
    write: true, perm: 'schedule.manage', area: 'hr',
    // value: 'usual', 'off', or a shift's id
    schema: { staff_id: { type: 'id', required: true }, date: { type: 'date', required: true }, value: { type: 'text', required: true, max: 30 } },
  },
  // What a day's setting would bring: short-rest warnings, notes for the
  // manager, what refuses it (staff: only their own).
  'rota.check': { schema: { staff_id: { type: 'id' }, date: { type: 'date', required: true }, value: { type: 'text', required: true, max: 30 } } },
  'rota.shift.save': {
    write: true, perm: 'schedule.manage', area: 'hr',
    schema: {
      id: { type: 'id' },
      version: { type: 'int', min: 1 },
      name: NAME,
      name_bn: { type: 'text', max: 80 },
      start: { type: 'time', required: true },
      end: { type: 'time', required: true },
      places: { type: 'int', min: 0, max: 99 },
      // Comma-separated positions; empty: anyone.
      positions: { type: 'text', max: 200 },
      status: STATUS,
    },
  },
  'rota.unavailable': { schema: { staff_id: { type: 'id' } } },
  'rota.unavailable.save': {
    write: true, area: 'hr',
    schema: { staff_id: { type: 'id' }, date: { type: 'date' }, weekday: { type: 'int', min: 0, max: 6 }, note: { type: 'text', max: 120 } },
  },
  'rota.unavailable.remove': { write: true, area: 'hr', schema: { id: { type: 'id', required: true } } },
  'rota.request': {
    write: true, area: 'hr',
    schema: {
      kind: { type: 'enum', required: true, values: ['shift', 'swap', 'dayoff'] },
      date: { type: 'date', required: true },
      other_date: { type: 'date' },
      partner_id: { type: 'id' },
      shift_id: { type: 'id' },
      reason: { type: 'text', max: 200 },
    },
  },
  'rota.answer': { write: true, area: 'hr', schema: { id: { type: 'id', required: true }, answer: { type: 'enum', required: true, values: ['accept', 'decline'] } } },
  'rota.decide': { write: true, perm: 'schedule.manage', area: 'hr', schema: DECISION },
  'rota.withdraw': { write: true, area: 'hr', schema: { id: { type: 'id', required: true } } },
  'holidays.list': { perm: 'settings.manage', schema: { year: { type: 'int', min: 2000, max: 2100 } } },
  'holidays.save': {
    write: true, perm: 'settings.manage', area: 'hr',
    schema: { id: { type: 'id' }, version: { type: 'int', min: 1 }, date: { type: 'date', required: true }, name: NAME, name_bn: { type: 'text', max: 80 }, status: STATUS },
  },
  'leave.mine': { cache: true },
  'leave.preview': { schema: { staff_id: { type: 'id' }, from: { type: 'date', required: true }, to: { type: 'date', required: true }, half: { type: 'enum', values: ['first', 'second'] } } },
  'leave.apply': {
    write: true, area: 'hr',
    schema: {
      staff_id: { type: 'id' },
      // paid, unpaid, or a kind a shareholder added (its id)
      kind: { type: 'text', required: true, max: 20 },
      half: { type: 'enum', values: ['first', 'second'] },
      from: { type: 'date', required: true },
      to: { type: 'date', required: true },
      reason: { type: 'text', required: true, max: 300 },
    },
  },
  'leave.decide': { write: true, perm: 'leave.approve', area: 'hr', schema: DECISION },
  'leave.cancel': { write: true, area: 'hr', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 200 } } },
  'leave.overview': { perm: 'leave.approve' },
  'leave.adjust': {
    write: true, perm: 'leave.adjust', area: 'hr',
    schema: { staff_id: { type: 'id', required: true }, days: { type: 'number', required: true, min: -365, max: 365 }, reason: { type: 'text', required: true, max: 200 } },
  },
  'settings.leave': { perm: 'settings.manage' },
  'leave.type.save': {
    write: true, perm: 'settings.manage', area: 'hr',
    schema: {
      id: { type: 'id' },
      version: { type: 'int', min: 1 },
      name: NAME,
      name_bn: { type: 'text', max: 80 },
      paid: { type: 'bool' },
      from_balance: { type: 'bool' },
      half_days: { type: 'bool' },
      status: { type: 'enum', required: true, values: ['active', 'inactive'] },
    },
  },
  'settings.leave.save': {
    write: true, perm: 'settings.manage', area: 'hr',
    schema: {
      probation_months: { type: 'int', required: true, min: 0, max: 24 },
      rate: { type: 'number', required: true, min: 0, max: 10 },
      timing: { type: 'enum', required: true, values: ['service_month', 'calendar_month'] },
      partial: { type: 'enum', required: true, values: ['prorate_days', 'none'] },
      day_counting: { type: 'enum', required: true, values: ['working', 'calendar'] },
      allow_negative: { type: 'bool' },
      holidays: { type: 'enum', required: true, values: ['open_scheduled', 'closed'] },
      self_select: { type: 'bool' },
      advance_days: { type: 'int', required: true, min: 1, max: 60 },
      min_rest_hours: { type: 'int', required: true, min: 0, max: 24 },
      min_notice_days: { type: 'int', required: true, min: 0, max: 30 },
    },
  },
  // ---- Payroll ----
  'payroll.month': { perm: 'payroll.view', schema: { month: { type: 'month' } } },
  'payroll.issue': {
    write: true, perm: 'payroll.manage', area: 'hr',
    schema: {
      staff_id: { type: 'id', required: true },
      month: { type: 'month', required: true },
      // The unpaid leave and absent days to cut, chosen when paying.
      unpaid_leave_days: LEAVE_DAYS,
      unpaid_absent_days: { type: 'int', required: true, min: 0, max: 31 },
      // The overtime hours to pay (for people overtime is paid to).
      overtime_hours: { type: 'number', min: 0, max: 744 },
      note: { type: 'text', max: 300 },
    },
  },
  // Salary history: each change in parts, from a date.
  'salary.history': { perm: 'salary.view', schema: { staff_id: { type: 'id', required: true } } },
  'salary.change': {
    write: true, perm: 'salary.edit', area: 'hr',
    schema: {
      staff_id: { type: 'id', required: true },
      from: { type: 'date', required: true },
      parts: { type: 'list', required: true, max: 8, of: { name: { type: 'text', max: 40 }, amount: { type: 'money', required: true } } },
      food_rate: { type: 'money', zero: true },
      note: { type: 'text', max: 300 },
    },
  },
  'payroll.cancel': { write: true, perm: 'payroll.manage', area: 'hr', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 200 } } },
  'payroll.payslip': { cache: true, schema: { id: { type: 'id', required: true } } },
  'payroll.mine': { cache: true },
  'payroll.opening.save': {
    write: true, perm: 'payroll.manage', area: 'hr',
    schema: { staff_id: { type: 'id', required: true }, owed: { type: 'money', zero: true }, advance: { type: 'money', zero: true } },
  },
  'settings.payroll': { perm: 'settings.manage' },
  'settings.payroll.save': {
    write: true, perm: 'settings.manage', area: 'hr',
    schema: {
      divisor: { type: 'enum', required: true, values: ['period_days', 'fixed_30'] },
      food_rule: { type: 'enum', required: true, values: ['every_day', 'skip_unpaid', 'worked_days'] },
      food_rates: { type: 'list', max: 20, of: { from: { type: 'date', required: true }, amount: { type: 'money', zero: true, required: true } } },
      month_start_day: { type: 'int', min: 1, max: 28 },
      overdue_days: { type: 'int', min: 0, max: 60 },
      start_date: { type: 'date' },
    },
  },
  // ---- Tasks ----
  'tasks.mine': { cache: true },
  'tasks.list': { perm: 'tasks.view_all', schema: { date: { type: 'date' }, staff_id: { type: 'id' } } },
  'tasks.create': {
    write: true, perm: 'tasks.create', area: 'hr',
    schema: { ...TASK_FIELDS, due_date: { type: 'date', required: true } },
  },
  'tasks.complete': {
    write: true, offline: true, area: 'hr',
    schema: { id: { type: 'id', required: true }, note: { type: 'text', max: 300 }, record_id: { type: 'id' }, answers: { type: 'list', max: 20, of: { item: { type: 'text', required: true, max: 20 }, value: { type: 'text', max: 300 } } } },
  },
  // A linked task's record: tied when saved from the task, or picked.
  'tasks.record': { write: true, area: 'hr', schema: { id: { type: 'id', required: true }, record_id: { type: 'id', required: true } } },
  'tasks.records': { schema: { id: { type: 'id', required: true } } },
  // A report was printed; who may print it is checked by the report.
  'reports.printed': { write: true, area: 'hr', schema: { report: { type: 'enum', required: true, values: Object.keys(REPORTS) }, ref: { type: 'text', max: 40 } } },
  // A report's model, for the screen, print and Excel; who may see it is
  // checked by the report.
  'reports.get': {
    schema: {
      report: { type: 'enum', required: true, values: Object.keys(REPORTS) },
      date: { type: 'date' }, month: { type: 'month' }, from: { type: 'date' }, to: { type: 'date' }, party_id: { type: 'id' },
    },
  },
  // A photo for a task: before, after, a receipt, or a checklist item's.
  'tasks.attach': {
    write: true, area: 'hr',
    schema: {
      id: { type: 'id', required: true }, slot: { type: 'text', required: true, max: 20 },
      name: { type: 'text', required: true, max: 120 }, mime: { type: 'enum', required: true, values: UPLOAD_TYPES },
      data: { type: 'text', required: true, max: Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 4 },
    },
  },
  'tasks.not_done': { write: true, offline: true, area: 'hr', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 300 } } },
  'tasks.comment': { write: true, offline: true, area: 'hr', schema: { id: { type: 'id', required: true }, text: { type: 'text', required: true, max: 500 } } },
  'tasks.verify': { write: true, perm: 'tasks.verify', area: 'hr', schema: DECISION },
  'tasks.reassign': {
    write: true, perm: 'tasks.manage', area: 'hr',
    schema: { id: { type: 'id', required: true }, staff_id: { type: 'id', required: true }, due_date: { type: 'date' } },
  },
  // A linked task done without its record: a manager allows it, with a reason.
  'tasks.allow': { write: true, perm: 'tasks.manage', area: 'hr', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 200 } } },
  'tasks.cancel': { write: true, perm: 'tasks.manage', area: 'hr', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 200 } } },
  'tasks.templates': { perm: 'tasks.manage' },
  'tasks.team.save': {
    write: true, perm: 'tasks.manage', area: 'hr',
    schema: { id: { type: 'id' }, version: { type: 'int', min: 1 }, name: NAME, members: { type: 'list', max: 50, of: { id: { type: 'id', required: true } } }, status: STATUS },
  },
  'tasks.template.save': {
    write: true, perm: 'tasks.manage', area: 'hr',
    schema: {
      id: { type: 'id' },
      version: { type: 'int', min: 1 },
      ...TASK_FIELDS,
      repeat: { type: 'enum', required: true, values: REPEATS },
      every: { type: 'int', min: 1, max: 365 },
      days: { type: 'list', max: 7, of: { day: { type: 'int', required: true, min: 0, max: 6 } } },
      day_of_month: { type: 'int', min: 1, max: 31 },
      dates: { type: 'list', max: 60, of: { date: { type: 'date', required: true } } },
      start_date: { type: 'date', required: true },
      end_date: { type: 'date' },
      status: { type: 'enum', required: true, values: ['active', 'paused', 'ended'] },
    },
  },
  // ---- Leaving and letters ----
  'separation.list': { perm: 'separation.manage' },
  'separation.mine': {},
  'separation.submit': {
    write: true, area: 'hr',
    schema: {
      staff_id: { type: 'id' },
      kind: { type: 'enum', required: true, values: ['resignation', 'termination'] },
      notice_date: { type: 'date' },
      last_day: { type: 'date', required: true },
      reason: { type: 'text', required: true, max: 500 },
    },
  },
  'separation.accept': { write: true, perm: 'separation.manage', area: 'hr', schema: { id: { type: 'id', required: true }, last_day: { type: 'date' } } },
  'separation.withdraw': { write: true, area: 'hr', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 200 } } },
  'separation.handover': { write: true, perm: 'separation.manage', area: 'hr', schema: { id: { type: 'id', required: true }, to_staff_id: { type: 'id', required: true } } },
  'separation.settlement': { perm: 'payroll.view', schema: { id: { type: 'id', required: true }, leave_days: LEAVE_DAYS } },
  'separation.confirm': { write: true, perm: 'payroll.manage', area: 'hr', schema: { id: { type: 'id', required: true }, leave_days: LEAVE_DAYS } },
  'separation.reopen': { write: true, perm: 'payroll.manage', area: 'hr', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 200 } } },
  'separation.complete': { write: true, perm: 'separation.manage', area: 'hr', schema: { id: { type: 'id', required: true } } },
  'letters.list': { perm: 'staff.view', schema: { staff_id: { type: 'id', required: true } } },
  'letters.issue': {
    write: true, area: 'hr',
    schema: { staff_id: { type: 'id', required: true }, kind: { type: 'enum', required: true, values: LETTER_KINDS } },
  },
  'letters.get': { cache: true, schema: { id: { type: 'id', required: true } } },
  'settings.letters': { perm: 'settings.manage' },
  'settings.letters.save': {
    write: true, perm: 'settings.manage', area: 'hr',
    schema: {
      offer: LETTER_TEXT, appointment: LETTER_TEXT, experience: LETTER_TEXT, release: LETTER_TEXT,
      conduct: { type: 'text', max: 500 },
    },
  },
  // The shop's details on the letterhead.
  'settings.shop': { perm: 'settings.manage' },
  'settings.shop.save': {
    write: true, perm: 'settings.manage', area: 'core',
    schema: {
      name: { type: 'text', required: true, max: 80 },
      tagline: { type: 'text', max: 120 },
      address: { type: 'text', max: 300 },
      phone: { type: 'text', max: 40 },
      email: { type: 'email' },
      number_prefix: { type: 'text', required: true, max: 6 },
      number_digits: { type: 'int', required: true, min: 1, max: 8 },
      self_edit: { type: 'bool' },
    },
  },
  // ---- Announcements, procedures, reviews ----
  'docs.mine': { cache: true },
  'docs.mark': { write: true, area: 'hr', schema: { id: { type: 'id', required: true }, ack: { type: 'bool' } } },
  'docs.manage': { schema: { kind: { type: 'enum', required: true, values: ['announcement', 'procedures'] } } },
  'docs.save': {
    write: true, area: 'hr',
    schema: {
      id: { type: 'id' },
      version: { type: 'int', min: 1 },
      kind: { type: 'enum', required: true, values: ['announcement', 'jd', 'sop'] },
      title: { type: 'text', required: true, max: 150 },
      body: { type: 'text', required: true, max: 8000 },
      audience: { type: 'enum', required: true, values: ['everyone', 'staff', 'managers', 'people'] },
      staff_ids: { type: 'list', max: 100, of: { id: { type: 'id', required: true } } },
      needs_ack: { type: 'bool' },
      show_until: { type: 'date' },
      status: { type: 'enum', required: true, values: ['active', 'archived'] },
    },
  },
  'reviews.list': {},
  'people.waiting': { cache: true },
  'reviews.start': {
    write: true, perm: 'performance.manage', area: 'hr',
    schema: { staff_id: { type: 'id', required: true }, from: { type: 'date', required: true }, to: { type: 'date', required: true } },
  },
  'reviews.self': { write: true, area: 'hr', schema: { id: { type: 'id', required: true }, lines: SCORE_LINES } },
  'reviews.score': {
    write: true, perm: 'performance.manage', area: 'hr',
    schema: { id: { type: 'id', required: true }, version: { type: 'int', min: 1 }, lines: SCORE_LINES, summary: { type: 'text', max: 2000 }, share: { type: 'bool' } },
  },
  'reviews.ack': { write: true, area: 'hr', schema: { id: { type: 'id', required: true }, comment: { type: 'text', max: 1000 } } },
  'settings.reviews': { perm: 'settings.manage' },
  'settings.reviews.save': {
    write: true, perm: 'settings.manage', area: 'hr',
    schema: { criteria: { type: 'list', max: 12, of: { name: { type: 'text', max: 60 } } }, self_assessment: { type: 'bool' } },
  },
  // ---- Recruitment and onboarding ----
  'applicants.list': { perm: 'recruitment.manage', schema: { ...PAGED, stage: { type: 'enum', values: ['open', 'hired', 'rejected', 'withdrawn'] } } },
  'applicants.save': {
    write: true, perm: 'recruitment.manage', area: 'hr',
    schema: {
      id: { type: 'id' },
      version: { type: 'int', min: 1 },
      name: NAME,
      phone: { type: 'text', max: 20 },
      position: { type: 'text', required: true, max: 60 },
      source: { type: 'text', max: 80 },
      notes: { type: 'text', max: 1000 },
    },
  },
  'applicants.stage': {
    write: true, perm: 'recruitment.manage', area: 'hr',
    schema: {
      id: { type: 'id', required: true },
      stage: { type: 'enum', required: true, values: ['interview', 'offered', 'hired', 'rejected', 'withdrawn'] },
      interview_at: { type: 'text', max: 40 },
      offer_salary: { type: 'money' },
      start_date: { type: 'date' },
      note: { type: 'text', max: 500 },
    },
  },
  'onboarding.list': { perm: 'recruitment.manage' },
  'onboarding.tick': {
    write: true, perm: 'recruitment.manage', area: 'hr',
    schema: { id: { type: 'id', required: true }, step: { type: 'int', required: true, min: 0, max: 30 }, done: { type: 'bool' } },
  },
  'settings.onboarding': { perm: 'settings.manage' },
  'settings.onboarding.save': {
    write: true, perm: 'settings.manage', area: 'hr',
    schema: { steps: { type: 'list', max: 20, of: { label: { type: 'text', max: 120 } } } },
  },
});
