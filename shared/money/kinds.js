// The kinds on the one money screen ("What is this?"). Each kind says:
//   group       where it sits in the list
//   perm        the permission that lets a person enter it directly
//   requestable whether someone without `perm` may send it as a request
//               (saved and counted now, waiting for a shareholder)
//   rule        which approval switch in Settings → Approvals applies
//   party       who or what it is about: category, contact (a person with
//               a due), shareholder, or nothing
//   cash        how it moves money: in, out, none, transfer, or
//               either (loan repayment, by its direction)
// Vendor, publisher and staff pay kinds are added with the Books and HR
// milestones; their ledgers are separate from these.

export const KINDS = Object.freeze({
  expense: { group: 'money', label: 'money.kind.expense', perm: 'acc.expense', requestable: true, rule: 'expense', party: 'category', cash: 'out' },
  income: { group: 'money', label: 'money.kind.income', perm: 'acc.income', requestable: true, rule: 'income', party: null, cash: 'in' },
  due_taken: { group: 'money', label: 'money.kind.due_taken', perm: 'acc.dues', requestable: true, rule: 'other', party: 'contact', cash: 'none' },
  due_collected: { group: 'money', label: 'money.kind.due_collected', perm: 'acc.dues', requestable: true, rule: 'other', party: 'contact', cash: 'in' },
  loan_to_shareholder: { group: 'money', label: 'money.kind.loan_to_shareholder', perm: 'acc.loans', requestable: true, rule: 'other', party: 'shareholder', cash: 'out' },
  loan_from_shareholder: { group: 'money', label: 'money.kind.loan_from_shareholder', perm: 'acc.loans', requestable: true, rule: 'other', party: 'shareholder', cash: 'in' },
  loan_repayment: { group: 'money', label: 'money.kind.loan_repayment', perm: 'acc.loans', requestable: true, rule: 'other', party: 'shareholder', cash: 'either' },
  transfer: { group: 'money', label: 'money.kind.transfer', perm: 'acc.transfer', requestable: true, rule: 'transfer', party: null, cash: 'transfer' },
  owner_salary: { group: 'shareholders', label: 'money.kind.owner_salary', perm: 'acc.shareholders', requestable: false, rule: 'other', party: 'shareholder', cash: 'out' },
  profit_share: { group: 'shareholders', label: 'money.kind.profit_share', perm: 'acc.shareholders', requestable: false, rule: 'other', party: 'shareholder', cash: 'out' },
  owner_withdrawal: { group: 'shareholders', label: 'money.kind.owner_withdrawal', perm: 'acc.shareholders', requestable: false, rule: 'other', party: 'shareholder', cash: 'out' },
});

export const KIND_GROUPS = Object.freeze([
  { id: 'money', label: 'money.group.money' },
  { id: 'shareholders', label: 'money.group.shareholders' },
]);

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
export function cashEffect(entry, accountId) {
  const cash = KINDS[entry.kind].cash;
  if (cash === 'transfer') {
    if (entry.account_id === accountId) return -entry.amount;
    return entry.to_account_id === accountId ? entry.amount : 0;
  }
  if (entry.account_id !== accountId || cash === 'none') return 0;
  const direction = cash === 'either' ? entry.direction : cash;
  return direction === 'in' ? entry.amount : -entry.amount;
}

// What a contact owes the shop changes with dues; positive means they owe.
export function dueEffect(entry) {
  if (entry.kind === 'due_taken') return entry.amount;
  return entry.kind === 'due_collected' ? -entry.amount : 0;
}

// A shareholder's loan balance; positive means the shareholder owes the shop.
export function loanEffect(entry) {
  if (entry.kind === 'loan_to_shareholder') return entry.amount;
  if (entry.kind === 'loan_from_shareholder') return -entry.amount;
  if (entry.kind === 'loan_repayment') return entry.direction === 'in' ? -entry.amount : entry.amount;
  return 0;
}
