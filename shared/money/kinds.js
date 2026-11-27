// The kinds on the one money screen ("What is this?"). Each kind has a
// label and help text (message ids), and says:
//   group       where it sits in the list
//   perm        the permission that lets a person enter it directly
//   requestable whether someone without `perm` may send it as a request
//               (saved and counted now, waiting for a shareholder)
//   rule        which approval switch in Settings → Approvals applies
//   party       who or what it is about: category, contact (a person with
//               a due), shareholder, vendor, publisher, staff, or nothing
//   period      the month it is for (salary paid)
//   instalment  repaid in instalments of a set amount (an advance)
//   loan        belongs to a loan (with its interest rate)
//   cash        how it moves money: in, out, none, transfer, or
//               either (loan repayment, by its direction)
//   limit       false when the amount limit doesn't apply (a day's sales)
// The daily shift is a kind of its own, entered on the Daily shift page,
// not on the money screen; it is stored and approved like any money entry.
// Vendor and publisher kinds keep their own payables ledger: a payment only
// pays off what is owed and is never an expense (book cost is counted as
// copies sell, a vendor's when goods are bought).
// Staff and shareholder pay keep a pay account per person (what the shop
// owes them, and any advance they owe back); see payEffect below. Staff pay
// can never be sent as a request.

export const KINDS = Object.freeze({
  expense: { group: 'money', label: 'money.kind.expense', help: 'money.help.expense', perm: 'acc.expense', requestable: true, rule: 'expense', party: 'category', cash: 'out' },
  income: { group: 'money', label: 'money.kind.income', help: 'money.help.income', perm: 'acc.income', requestable: true, rule: 'income', party: null, cash: 'in' },
  due_taken: { group: 'money', label: 'money.kind.due_taken', help: 'money.help.due_taken', perm: 'acc.dues', requestable: true, rule: 'other', party: 'contact', cash: 'none' },
  due_collected: { group: 'money', label: 'money.kind.due_collected', help: 'money.help.due_collected', perm: 'acc.dues', requestable: true, rule: 'other', party: 'contact', cash: 'in' },
  loan_to_shareholder: { group: 'money', label: 'money.kind.loan_to_shareholder', help: 'money.help.loan_to_shareholder', perm: 'acc.loans', requestable: true, rule: 'other', party: 'shareholder', cash: 'out', loan: true },
  loan_from_shareholder: { group: 'money', label: 'money.kind.loan_from_shareholder', help: 'money.help.loan_from_shareholder', perm: 'acc.loans', requestable: true, rule: 'other', party: 'shareholder', cash: 'in', loan: true },
  loan_repayment: { group: 'money', label: 'money.kind.loan_repayment', help: 'money.help.loan_repayment', perm: 'acc.loans', requestable: true, rule: 'other', party: 'shareholder', cash: 'either', loan: true },
  transfer: { group: 'money', label: 'money.kind.transfer', help: 'money.help.transfer', perm: 'acc.transfer', requestable: true, rule: 'transfer', party: null, cash: 'transfer' },
  owner_salary: { group: 'shareholders', label: 'money.kind.owner_salary', help: 'money.help.owner_salary', perm: 'acc.shareholders', requestable: false, rule: 'other', party: 'shareholder', cash: 'out' },
  profit_share: { group: 'shareholders', label: 'money.kind.profit_share', help: 'money.help.profit_share', perm: 'acc.shareholders', requestable: false, rule: 'other', party: 'shareholder', cash: 'out' },
  owner_withdrawal: { group: 'shareholders', label: 'money.kind.owner_withdrawal', help: 'money.help.owner_withdrawal', perm: 'acc.shareholders', requestable: false, rule: 'other', party: 'shareholder', cash: 'out' },
  vendor_purchase_credit: { group: 'vendors', label: 'money.kind.vendor_purchase_credit', help: 'money.help.vendor_purchase_credit', perm: 'acc.vendor.purchase', requestable: true, rule: 'vendor', party: 'vendor', cash: 'none', bill: true },
  vendor_purchase_paid: { group: 'vendors', label: 'money.kind.vendor_purchase_paid', help: 'money.help.vendor_purchase_paid', perm: 'acc.vendor.purchase', requestable: true, rule: 'vendor', party: 'vendor', cash: 'out', bill: true },
  vendor_payment: { group: 'vendors', label: 'money.kind.vendor_payment', help: 'money.help.vendor_payment', perm: 'acc.vendor.pay', requestable: true, rule: 'vendor', party: 'vendor', cash: 'out' },
  vendor_credit_note: { group: 'vendors', label: 'money.kind.vendor_credit_note', help: 'money.help.vendor_credit_note', perm: 'acc.vendor.purchase', requestable: true, rule: 'vendor', party: 'vendor', cash: 'none' },
  publisher_payment: { group: 'publishers', label: 'money.kind.publisher_payment', help: 'money.help.publisher_payment', perm: 'acc.publisher.pay', requestable: true, rule: 'publisher', party: 'publisher', cash: 'out', covers: true },
  publisher_refund: { group: 'publishers', label: 'money.kind.publisher_refund', help: 'money.help.publisher_refund', perm: 'acc.publisher.pay', requestable: true, rule: 'publisher', party: 'publisher', cash: 'in' },
  publisher_writeoff: { group: 'publishers', label: 'money.kind.publisher_writeoff', help: 'money.help.publisher_writeoff', perm: 'acc.publisher.pay', requestable: true, rule: 'publisher', party: 'publisher', cash: 'none' },
  salary_paid: { group: 'staff', label: 'money.kind.salary_paid', help: 'money.help.salary_paid', perm: 'acc.staffpay', requestable: false, rule: 'other', party: 'staff', cash: 'out', period: true },
  food_paid: { group: 'staff', label: 'money.kind.food_paid', help: 'money.help.food_paid', perm: 'acc.staffpay', requestable: false, rule: 'other', party: 'staff', cash: 'out' },
  bonus_paid: { group: 'staff', label: 'money.kind.bonus_paid', help: 'money.help.bonus_paid', perm: 'acc.staffpay', requestable: false, rule: 'other', party: 'staff', cash: 'out' },
  staff_advance: { group: 'staff', label: 'money.kind.staff_advance', help: 'money.help.staff_advance', perm: 'acc.staffpay', requestable: false, rule: 'other', party: 'staff', cash: 'out', instalment: true },
  staff_deduction: { group: 'staff', label: 'money.kind.staff_deduction', help: 'money.help.staff_deduction', perm: 'acc.staffpay', requestable: false, rule: 'other', party: 'staff', cash: 'none' },
  shareholder_advance: { group: 'shareholders', label: 'money.kind.shareholder_advance', help: 'money.help.shareholder_advance', perm: 'acc.shareholders', requestable: false, rule: 'other', party: 'shareholder', cash: 'out' },
  shareholder_deduction: { group: 'shareholders', label: 'money.kind.shareholder_deduction', help: 'money.help.shareholder_deduction', perm: 'acc.shareholders', requestable: false, rule: 'other', party: 'shareholder', cash: 'none' },
  daily_shift: { group: 'daily', label: 'money.kind.daily_shift', help: 'money.help.daily_shift', perm: 'acc.daily', requestable: false, rule: 'daily', party: null, cash: 'shift', limit: false },
});

export const KIND_GROUPS = Object.freeze([
  { id: 'money', label: 'money.group.money' },
  { id: 'vendors', label: 'money.group.vendors' },
  { id: 'publishers', label: 'money.group.publishers' },
  { id: 'staff', label: 'money.group.staff' },
  { id: 'shareholders', label: 'money.group.shareholders' },
]);

// The kinds offered on the money screen.
export const SCREEN_KINDS = Object.freeze(Object.keys(KINDS).filter((id) => KIND_GROUPS.some((g) => g.id === KINDS[id].group)));

// May this person use this kind at all? Directly, or as a request.
export function kindAccess(permissions, kindId) {
  const kind = KINDS[kindId];
  if (!kind || !permissions.includes('acc.entry')) return 'none';
  if (permissions.includes(kind.perm)) return 'direct';
  return kind.requestable ? 'request' : 'none';
}

// How much an entry moves one account's balance (+ in, − out).
// A loan repayment's direction is 'in' (a shareholder pays the shop back)
// or 'out' (the shop pays a shareholder back).
//
// A daily shift moves several accounts at once (its `details`):
//   cash drawer (account_id): cash sales − cash handed over + short/over,
//     so after the shift the drawer holds exactly what was counted
//   bKash and card accounts: their sales
//   the account the cash was handed to: the amount handed
export function cashEffect(entry, accountId) {
  const cash = KINDS[entry.kind].cash;
  if (cash === 'shift') {
    const d = entry.details;
    let sum = 0;
    if (entry.account_id === accountId) sum += d.cash - d.handed + d.short_over;
    if (d.bkash_account_id === accountId) sum += d.bkash;
    if (d.card_account_id === accountId) sum += d.card;
    if (d.handed_to === accountId) sum += d.handed;
    return sum;
  }
  if (cash === 'transfer') {
    if (entry.account_id === accountId) return -entry.amount;
    return entry.to_account_id === accountId ? entry.amount : 0;
  }
  if (entry.account_id !== accountId || cash === 'none') return 0;
  const direction = cash === 'either' ? entry.direction : cash;
  return direction === 'in' ? entry.amount : -entry.amount;
}

// What a contact owes the shop changes with dues; positive means they owe.
// A daily shift can record dues for several people.
export function dueEffect(entry, contactId) {
  if (entry.kind === 'daily_shift') return entry.details.dues.filter((d) => d.party_id === contactId).reduce((s, d) => s + d.amount, 0);
  if (entry.party_id !== contactId) return 0;
  if (entry.kind === 'due_taken') return entry.amount;
  return entry.kind === 'due_collected' ? -entry.amount : 0;
}

// What the shop owes a vendor or publisher changes with these entries;
// positive means the shop owes. (Book deliveries and sales add to what a
// publisher is owed; see server/modules/suppliers.js.)
const PAYABLE = {
  vendor_purchase_credit: 1, vendor_payment: -1, vendor_credit_note: -1,
  publisher_payment: -1, publisher_refund: 1, publisher_writeoff: 1,
};

export function payableEffect(entry) {
  return (PAYABLE[entry.kind] || 0) * entry.amount;
}

// A shareholder's loan balance; positive means the shareholder owes the shop.
export function loanEffect(entry) {
  if (entry.kind === 'loan_to_shareholder') return entry.amount;
  if (entry.kind === 'loan_from_shareholder') return -entry.amount;
  if (entry.kind === 'loan_repayment') return entry.direction === 'in' ? -entry.amount : entry.amount;
  return 0;
}

// A person's pay account (staff or shareholder): `owed` is what the shop
// owes them (salary on payslips and food allowance earned are added
// elsewhere); `advance` is what they owe back. A deduction recovers an
// advance from their pay, so it lowers both.
const PAY = {
  salary_paid: { owed: -1, advance: 0 },
  food_paid: { owed: -1, advance: 0 },
  staff_advance: { owed: 0, advance: 1 },
  staff_deduction: { owed: -1, advance: -1 },
  shareholder_advance: { owed: 0, advance: 1 },
  shareholder_deduction: { owed: 0, advance: -1 },
};

export function payEffect(entry) {
  const p = PAY[entry.kind];
  return p ? { owed: p.owed * entry.amount, advance: p.advance * entry.amount } : { owed: 0, advance: 0 };
}
