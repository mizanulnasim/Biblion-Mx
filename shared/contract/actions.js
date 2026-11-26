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
  'books.stocktake.start': { write: true, perm: 'books.adjust', area: 'books', schema: { publisher_id: { type: 'id' } } },
  'books.stocktake.save': {
    write: true, perm: 'books.adjust', area: 'books',
    schema: { id: { type: 'id', required: true }, counts: { type: 'list', max: 5000, of: { book_id: { type: 'id', required: true }, counted: { type: 'int', min: 0, max: 100000 } } } },
  },
  'books.stocktake.apply': { write: true, perm: 'books.adjust', area: 'books', schema: { id: { type: 'id', required: true } } },
  'books.stocktake.cancel': { write: true, perm: 'books.adjust', area: 'books', schema: { id: { type: 'id', required: true }, reason: { type: 'text', required: true, max: 300 } } },

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
      lines: { type: 'list', max: 300, of: { book_id: { type: 'id' }, title: { type: 'text', max: 200 }, printed_price: { type: 'money', required: true }, qty: { type: 'int', required: true, min: 1, max: 10000 } } },
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
});
