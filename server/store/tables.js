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
      // The document filed on the entry (Files).
      'file_id',
      // The month a salary payment is for (YYYY-MM).
      'period',
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
    columns: ['date', 'publisher_id', 'challan', 'lines:j', 'total_cost:n', 'paid:n', 'payment_id', 'note', 'entered_by', 'requisition_id', 'charge:n', 'charge_id', 'file_id'],
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
  // Every file kept on Drive. checksum (SHA-256) refuses the same file twice;
  // record_ids are the records it is filed on.
  Files: {
    group: 'core',
    prefix: 'FIL',
    columns: ['drive_id', 'name', 'mime', 'size:n', 'checksum', 'sensitive:b', 'uploaded_by', 'status', 'record_ids:j'],
  },
  // An uploaded document on its way: reading → needs_kind → ready →
  // confirmed (or attached to an existing record), or discarded.
  Intake_Docs: {
    group: 'core',
    prefix: 'INT',
    columns: [
      'file_id', 'status', 'kind', 'guess', 'text', 'proposal:j', 'ai_used:b', 'result:j',
      'discard_reason', 'confirmed_by', 'confirmed_at', 'uploaded_by',
    ],
  },
  // Café items. kind: stock (counted at every daily closing) or supply
  // (checked when ordering). cover_days: how long an order usually buys for.
  Cafe_Items: {
    group: 'cafe',
    prefix: 'CIT',
    columns: [
      'name', 'name_bn', 'aliases', 'kind', 'unit', 'vendor_id', 'shelf_life_days:n', 'cover_days:n', 'lead_days:n',
      'min_order:n', 'order_multiple:n', 'unit_cost:n', 'status',
    ],
  },
  // A count of one item on one date: the daily closing count for stock, or
  // a check of what is on hand for a supply. used: since the count before it,
  // over `days` days.
  Cafe_Counts: {
    group: 'cafe',
    prefix: 'CCT',
    columns: ['date', 'item_id', 'counted:n', 'wasted:n', 'waste_reason', 'expired:n', 'received:n', 'used:n', 'days:n', 'counted_by'],
  },
  // What came in, by batch, with its expiry date. How much of a batch is
  // left is worked out from the counts (used up oldest first), never stored.
  Cafe_Batches: {
    group: 'cafe',
    prefix: 'CBT',
    columns: ['item_id', 'received_date', 'expiry_date', 'qty:n', 'unit_cost:n', 'order_id', 'entry_id'],
  },
  // A café order. lines: [{item_id, name, unit, on_hand, suggested, qty,
  // reason, bought}]. Status: draft, waiting (for a shareholder), approved,
  // part (part bought), bought, closed (the rest isn't being bought).
  Cafe_Orders: {
    group: 'cafe',
    prefix: 'COR',
    columns: [
      'number', 'date', 'vendor_id', 'cover', 'status', 'lines:j', 'note', 'entry_ids:j',
      'approved_by', 'approved_at', 'closed_reason', 'entered_by',
    ],
  },
  // Staff records. user_id links the person's sign-in, if they have one.
  // Hours: work_start/work_end ("HH:MM") and days_off (0 Sunday … 6
  // Saturday). The private parts are shown only with their permission:
  // nid, birth_date, address (staff.identity); emergency:j [{name, relation,
  // phone}] (staff.emergency); family (staff.family); salary (salary.view).
  // The punch PIN is kept only as a PBKDF2 hash.
  Staff: {
    group: 'hr',
    prefix: 'STF',
    columns: [
      'name', 'name_bn', 'phone', 'position', 'user_id', 'joined_on', 'left_on', 'status',
      'work_start', 'work_end', 'days_off:j',
      'nid', 'birth_date', 'address', 'emergency:j', 'family', 'salary:n',
      'pin_hash', 'pin_salt', 'pin_iter:n', 'pin_failed:n', 'pin_locked_until',
    ],
    secret: ['pin_hash', 'pin_salt', 'pin_iter'],
  },
  // Attendance punches. at: when it happened (server clock); device_ts: what
  // the phone recorded. source: phone, device (a shop punch device) or fix
  // (an approved correction). flags: outside, no_location, offline, skew.
  // Status: ok, check (waits for a manager), rejected, replaced.
  Punches: {
    group: 'hr',
    prefix: 'PUN',
    columns: [
      'staff_id', 'date', 'type', 'at', 'device_ts', 'source', 'device_id', 'lat:n', 'lng:n', 'accuracy:n', 'distance_m:n',
      'flags:j', 'reason', 'status', 'decided_by', 'decided_at', 'decide_note', 'fix_id', 'entered_by',
    ],
  },
  // Corrections: a missing or wrong punch, asked for with a reason.
  // replaces: the punch it corrects, if any. Status: waiting, approved,
  // declined, withdrawn.
  Attendance_Fixes: {
    group: 'hr',
    prefix: 'AFX',
    columns: ['staff_id', 'date', 'type', 'time', 'replaces', 'reason', 'status', 'decided_by', 'decided_at', 'decide_note', 'asked_by'],
  },
  // Shop punch devices. The secret is shown once, to the device that
  // registers, and signs every punch made on it.
  Punch_Devices: {
    group: 'hr',
    prefix: 'PDV',
    columns: ['name', 'secret', 'status'],
    secret: ['secret'],
  },
  // Named shifts for the rota. self_confirm: a person who chooses this
  // shift for a coming day gets it without a manager.
  Shifts: {
    group: 'hr',
    prefix: 'SHF',
    columns: ['name', 'name_bn', 'start', 'end', 'self_confirm:b', 'status'],
  },
  // The rota: one row per person and date where the day differs from (or
  // is set back to) their usual hours. mode: usual, off, or hours (start,
  // end, and the shift they came from, if any). source: manager, choice,
  // swap or dayoff.
  Rota: {
    group: 'hr',
    prefix: 'ROT',
    columns: ['date', 'staff_id', 'mode', 'start', 'end', 'shift_id', 'source', 'request_id'],
  },
  // Requests about the rota. kind: shift (choose a shift for a coming day),
  // swap (swap the day with a colleague, who agrees first) or dayoff (move
  // the weekly day off from `date` to `other_date`). Status: partner (waits
  // for the colleague), waiting (for a manager), approved, declined,
  // withdrawn.
  Rota_Requests: {
    group: 'hr',
    prefix: 'RRQ',
    columns: [
      'kind', 'staff_id', 'date', 'other_date', 'partner_id', 'shift_id', 'reason', 'status',
      'partner_at', 'decided_by', 'decided_at', 'decide_note', 'asked_by',
    ],
  },
  Holidays: {
    group: 'hr',
    prefix: 'HOL',
    columns: ['date', 'name', 'name_bn', 'status'],
  },
  // Leave. kind: paid (from the balance) or unpaid. days: how many days it
  // takes, counted when asked. Status: waiting, approved, declined, cancelled.
  Leaves: {
    group: 'hr',
    prefix: 'LEV',
    columns: ['staff_id', 'kind', 'from', 'to', 'days:n', 'reason', 'status', 'decided_by', 'decided_at', 'decide_note', 'cancel_reason', 'asked_by'],
  },
  // A shareholder's change to someone's leave balance, with a reason.
  Leave_Adjustments: {
    group: 'hr',
    prefix: 'LAD',
    columns: ['staff_id', 'date', 'days:n', 'reason'],
  },
  // A month's payslip for one person, kept as issued: the figures don't
  // change if the salary or attendance changes later. Status: issued, or
  // cancelled (with a reason) so it can be issued again.
  Payslips: {
    group: 'hr',
    prefix: 'PSL',
    columns: [
      'month', 'staff_id', 'salary:n', 'month_days:n', 'divisor:n', 'employed_days:n', 'base:n',
      'unpaid_leave_days:n', 'absent_days:n', 'unpaid_absent_days:n', 'unpaid_cut:n', 'net:n', 'note',
      'status', 'cancel_reason', 'issued_by', 'issued_at',
    ],
  },
  // What the shop owed each person, and what they owed back, when the app
  // started being used.
  Pay_Openings: {
    group: 'hr',
    prefix: 'POP',
    columns: ['staff_id', 'owed:n', 'advance:n'],
  },
  // Repeating tasks. repeat: daily, weekly (days:j, 0 Sunday … 6 Saturday)
  // or monthly (day_of_month). link: a screen the task opens
  // (shared/tasks/tasks.js). needs_check: a manager checks it when done.
  // Status: active, paused, ended.
  Task_Templates: {
    group: 'hr',
    prefix: 'TTP',
    columns: [
      'title', 'details', 'staff_id', 'repeat', 'days:j', 'day_of_month:n', 'due_time', 'link', 'needs_check:b',
      'start_date', 'end_date', 'status',
    ],
  },
  // Tasks, one-off or made from a template for one date. Status: open,
  // to_check (done, waiting for a manager's check), done, not_done (with
  // the person's reason), skipped (cancelled, or the person was on leave).
  // comments:j [{by, name, at, text}]. moved_from: the date it was due
  // before approved leave moved it.
  Tasks: {
    group: 'hr',
    prefix: 'TSK',
    columns: [
      'template_id', 'title', 'details', 'staff_id', 'due_date', 'due_time', 'link', 'needs_check:b', 'status',
      'note', 'done_at', 'done_by', 'checked_by', 'checked_at', 'check_note', 'skip_reason', 'moved_from', 'comments:j', 'created_by',
    ],
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
