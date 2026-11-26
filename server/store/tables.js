// Tables are added here only when a feature uses them.
// Every row also has the base columns below. Column suffixes:
//   :n number   :b true/false   :j JSON   (no suffix) text
// `secret` columns are never copied into the activity log.
// `log` tables are not themselves written to the activity log.

export const BASE_COLUMNS = Object.freeze(['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version:n']);

export const TABLES = Object.freeze({
  Users: {
    group: 'core',
    prefix: 'USR',
    columns: [
      'username', 'display_name', 'role_id', 'status', 'perm_grants:j', 'perm_denies:j', 'settings:j',
      'pass_hash', 'kdf_salt', 'kdf_iter:n', 'failed_attempts:n', 'locked_until', 'last_login_at',
    ],
    secret: ['pass_hash', 'kdf_salt', 'kdf_iter'],
  },
  Sessions: {
    group: 'core',
    prefix: 'SES',
    columns: ['user_id', 'token_hash', 'expires_at', 'revoked:b'],
    secret: ['token_hash'],
    log: true,
  },
  // Every saved write keeps its client op_id here for good, so a write sent
  // twice, even years apart, is applied once (v1 bug S2).
  Ops: {
    group: 'core',
    prefix: 'OPS',
    columns: ['op_id', 'user_id', 'action', 'record_id', 'reply:j'],
    log: true,
  },
  // Business settings that differ from their defaults (shared/schema/settings.js).
  Settings: {
    group: 'core',
    prefix: 'SET',
    columns: ['key', 'value:j'],
  },
  Money_Accounts: {
    group: 'accounts',
    prefix: 'MAC',
    columns: ['name', 'kind', 'opening:n', 'status'],
  },
  Expense_Categories: {
    group: 'accounts',
    prefix: 'EXC',
    columns: ['name', 'area', 'needs_shareholder:b', 'status'],
  },
  Due_Contacts: {
    group: 'accounts',
    prefix: 'DUC',
    columns: ['name', 'phone', 'opening_due:n', 'status'],
  },
  Shareholders: {
    group: 'accounts',
    prefix: 'SHR',
    columns: ['name', 'phone', 'status'],
  },
  // Money entries are append-only: a correction is a new row that
  // `replaces` the old one, and the old one is marked replaced; a
  // cancellation keeps the row with its reason. Nothing is deleted.
  Transactions: {
    group: 'accounts',
    prefix: 'TRX',
    columns: [
      'date', 'kind', 'amount:n', 'account_id', 'to_account_id', 'category_id', 'party_id', 'direction', 'note', 'ref',
      'status', 'approval', 'wait_reasons:j', 'approved_by', 'approved_at', 'dup_reason',
      'replaces', 'replaced_by', 'cancel_reason', 'cancelled_by', 'cancelled_at', 'entered_by',
      // A daily shift's split, dues, cash handed over and cash count.
      'details:j',
      // A publisher payment: the latest date of sales it settles.
      'covers_up_to',
    ],
  },
  // Vendors and publishers. commission: the publisher's discount to the
  // shop (%), so a copy costs printed price less commission. sell_discount:
  // the shop's discount to customers (%). pays_on: a publisher is owed for
  // copies as they sell, or for everything delivered.
  Suppliers: {
    group: 'accounts',
    prefix: 'SUP',
    columns: ['kind', 'name', 'phone', 'commission:n', 'sell_discount:n', 'pays_on', 'opening_due:n', 'status'],
  },
  Books: {
    group: 'books',
    prefix: 'BOK',
    columns: ['title', 'author', 'isbn', 'publisher_id', 'printed_price:n', 'sell_price:n', 'aliases', 'status'],
  },
  // A delivery from a publisher, line by line; its stock is in Stock_Movements.
  Deliveries: {
    group: 'books',
    prefix: 'DLV',
    columns: ['date', 'publisher_id', 'challan', 'lines:j', 'total_cost:n', 'paid:n', 'payment_id', 'note', 'entered_by', 'requisition_id', 'charge:n', 'charge_id'],
  },
  // The stock ledger. qty is signed (+ in, − out). Stock on hand is the sum
  // of active movements; a cancelled one keeps its row and reason.
  Stock_Movements: {
    group: 'books',
    prefix: 'STM',
    columns: [
      'date', 'book_id', 'kind', 'qty:n', 'unit_cost:n', 'sale_amount:n', 'ref_type', 'ref_id', 'reason',
      'status', 'cancel_reason', 'cancelled_by', 'cancelled_at', 'entered_by',
    ],
  },
  // A requisition to a publisher. lines: [{key, book_id, title, qty,
  // received, cancelled, special_order_ids}]. Status: draft, sent, part
  // (part received), received, closed (the rest isn't coming).
  Requisitions: {
    group: 'books',
    prefix: 'RQN',
    columns: [
      'number', 'publisher_id', 'date', 'status', 'lines:j', 'sales_from', 'sales_to', 'note',
      'sent_at', 'sent_by', 'closed_reason', 'closed_by', 'entered_by',
    ],
  },
  // A customer's special order. Status: open, requested (in a requisition),
  // arrived, told, collected, cancelled.
  Special_Orders: {
    group: 'books',
    prefix: 'SPO',
    columns: [
      'number', 'date', 'customer_name', 'phone', 'book_id', 'title', 'publisher_id', 'qty:n', 'advance:n', 'note',
      'status', 'requisition_id', 'arrived_at', 'told_at', 'told_by', 'collected_at', 'cancel_reason', 'taken_by',
    ],
  },
  // A full stock-take. counts: {book_id: copies counted}.
  Stock_Takes: {
    group: 'books',
    prefix: 'STK',
    columns: ['number', 'date', 'publisher_id', 'status', 'counts:j', 'started_by', 'applied_by', 'applied_at', 'result:j', 'cancel_reason'],
  },
  // One row per closed date; reopening keeps the row with its reason.
  Day_Closings: {
    group: 'accounts',
    prefix: 'DCL',
    columns: ['date', 'status', 'checklist:j', 'note', 'closed_by', 'closed_at', 'reopened_by', 'reopened_at', 'reopen_reason'],
  },
  Audit_Log: {
    group: 'core',
    prefix: 'AUD',
    columns: ['user_id', 'user_name', 'action', 'table_name', 'record_id', 'before:j', 'after:j', 'reason', 'op_id'],
    log: true,
  },
});
