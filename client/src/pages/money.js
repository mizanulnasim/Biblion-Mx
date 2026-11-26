// Money: every entry (or, for a manager, their own), newest first, with
// the balance of each account for people who may see them.

import { html, render } from '../ui/html.js';
import { mountList } from '../ui/list.js';
import { t } from '../core/i18n.js';
import { read } from '../core/api.js';
import { can } from '../core/state.js';
import { dateShort, money } from '../core/format.js';
import { onArea } from '../core/live.js';
import { KINDS } from '../../../shared/money/kinds.js';
import { ACCOUNT_KINDS, amountCell, details, kindLabel, stateChip } from './money-common.js';
import { openEntry } from './money-entry.js';

function balancesView(accounts) {
  return html`<ul class="balances">${accounts.map((a) => html`<li class="balance">
    <span class="balance-name">${a.name}</span>
    <span class="muted">${t(ACCOUNT_KINDS[a.kind])}</span>
    <strong class="balance-amount ${a.balance < 0 ? 'is-negative' : ''}">${money(a.balance)}</strong>
  </li>`)}</ul>`;
}

export const moneyPage = {
  path: '/money',
  title: 'nav.money',
  perm: 'acc.entry',
  mount(el, { query }) {
    render(el, html`<div class="balances-slot"></div><div class="money-list"></div>`);
    const slot = el.querySelector('.balances-slot');
    const showBalances = can('acc.view_all');
    const drawBalances = async () => {
      if (!showBalances) return;
      try {
        const { data } = await read('money.boot');
        render(slot, data.accounts.length ? balancesView(data.accounts) : '');
      } catch (err) {
        // The list below shows the connection problem.
      }
    };

    const columns = [
      { label: t('money.field.date'), cell: (e) => dateShort(e.date), kind: 'nowrap' },
      { label: t('money.what'), cell: (e) => kindLabel(e.kind) },
      { label: t('money.field.details'), cell: details },
      { label: t('money.field.amount'), cell: amountCell, kind: 'nowrap num' },
      { label: t('money.field.state'), cell: stateChip, kind: 'nowrap' },
    ];
    if (showBalances) columns.push({ label: t('money.field.entered_by'), cell: (e) => e.entered_by_name });

    const list = mountList(el.querySelector('.money-list'), {
      key: 'money',
      action: 'money.list',
      area: 'money',
      searchLabel: t('money.search'),
      empty: t('money.empty'),
      emptySearch: t('list.no_match'),
      initial: { state: query.state },
      filters: [
        { name: 'kind', label: t('money.filter.all_kinds'), options: Object.keys(KINDS).map((k) => ({ value: k, label: kindLabel(k) })) },
        {
          name: 'state', label: t('money.filter.all_states'),
          options: [
            { value: 'waiting', label: t('money.state.waiting') },
            { value: 'final', label: t('money.state.final') },
            { value: 'cancelled', label: t('money.filter.cancelled') },
          ],
        },
      ],
      tools: html`<a class="btn btn-primary" href="#/money/new">${t('money.new')}</a>`,
      columns,
      onRow: (e) => openEntry(e.id, () => {
        list.reload();
        drawBalances();
      }),
    });
    const offArea = onArea('money', drawBalances);
    drawBalances();
    return () => {
      list.destroy();
      offArea();
    };
  },
};
