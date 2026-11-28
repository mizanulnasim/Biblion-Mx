// Pieces shared by the money pages: the state chip, the reasons an entry
// waits, and a one-line description of an entry.

import { html } from '../ui/html.js';
import { chip } from '../ui/feedback.js';
import { t } from '../core/i18n.js';
import { money } from '../core/format.js';
import { KINDS } from '../../../shared/money/kinds.js';

export const ACCOUNT_KINDS = Object.freeze({
  drawer: 'setup.account.drawer', bkash: 'setup.account.bkash', bank: 'setup.account.bank', owner: 'setup.account.owner',
});

export function stateChip(e) {
  if (e.status === 'cancelled') return chip(t('money.state.cancelled'), 'muted');
  if (e.status === 'replaced') return chip(t('money.state.replaced'), 'muted');
  if (e.approval === 'waiting') return chip(t('money.state.waiting'), 'warn');
  return chip(t('money.state.final'), 'ok');
}

// Each reason an entry waits for a shareholder, as a sentence.
// Amounts in a reason (the limit, a short or over) are shown as money.
export function reasonTexts(reasons) {
  return (reasons || []).map((r) => {
    const params = { ...r.params };
    for (const key of ['limit', 'amount']) if (typeof params[key] === 'number') params[key] = money(params[key]);
    return t(r.code, params);
  });
}

export function kindLabel(kind) {
  return t(KINDS[kind].label);
}

// Who or what the entry is about: "Cash → bKash", "Milk · Cash", "Rahim · Cash".
export function details(e) {
  if (e.kind === 'daily_shift') {
    const so = e.details.short_over;
    return so === 0 ? t('shift.line_balanced') : t(so < 0 ? 'shift.line_short' : 'shift.line_over', { amount: money(Math.abs(so)) });
  }
  if (e.kind === 'transfer') return t('money.transfer_line', { from: e.account, to: e.to_account });
  return [e.category, e.party, e.account].filter(Boolean).join(' · ');
}

export function amountCell(e) {
  return html`<span class="amount">${money(e.amount)}</span>`;
}
