// The one approval policy. Every money write and every approval screen uses
// it, on the server and (to show the rule before saving) on the phone.
//
//   decide(actor, entry, settings) → {final, needsShareholder, reasons[]}
//
// actor:    {level, permissions}
// entry:    {kind, amount, category_needs_shareholder, dup_reason, short_over}
// settings: {limit, rules: {expense, income, transfer, daily, other}}, each rule
//           'final' (final for a manager) or 'shareholder' (a shareholder confirms)
//
// - A shareholder's own entries are final.
// - A manager's entry waits for a shareholder when any of these hold:
//   over the amount limit, a category ticked "always needs a shareholder",
//   the kind's switch says so, saved past a duplicate warning, or it is a
//   request for a kind outside their permissions.
// - A daily shift is final for a manager only if the cash drawer balances:
//   any short or over, however small, waits for a shareholder.
// - Every reason is returned, so the person sees all of them.

import { KINDS } from '../money/kinds.js';

export const APPROVAL_RULES = Object.freeze(['expense', 'income', 'transfer', 'daily', 'other']);

export function decide(actor, entry, settings) {
  if (actor.level >= 3) return { final: true, needsShareholder: false, reasons: [] };
  const kind = KINDS[entry.kind];
  const reasons = [];
  if (!actor.permissions.includes(kind.perm)) reasons.push({ code: 'approve.why.request', params: {} });
  if (kind.limit !== false && entry.amount > settings.limit) reasons.push({ code: 'approve.why.over_limit', params: { limit: settings.limit } });
  if (entry.category_needs_shareholder) reasons.push({ code: 'approve.why.category', params: {} });
  if (settings.rules[kind.rule] === 'shareholder') reasons.push({ code: 'approve.why.kind_rule', params: {} });
  if (entry.short_over) reasons.push({ code: entry.short_over < 0 ? 'approve.why.short' : 'approve.why.over', params: { amount: Math.abs(entry.short_over) } });
  if (entry.dup_reason) reasons.push({ code: 'approve.why.duplicate', params: {} });
  return { final: reasons.length === 0, needsShareholder: reasons.length > 0, reasons };
}
