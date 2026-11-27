// Vendors and publishers: their terms and what the shop owes each. A row
// opens the statement; "Pay" opens the money screen with the kind chosen.
// Adding and editing are for people who set up books (shareholders).

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox, latestOnly } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { dateShort, money } from '../core/format.js';
import { onArea } from '../core/live.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { KINDS } from '../../../shared/money/kinds.js';

const AREAS = { books: 'setup.area.books', cafe: 'setup.area.cafe', shared: 'setup.area.shared' };
const PAYS_ON = { sale: 'suppliers.pays_on_sale', delivery: 'suppliers.pays_on_delivery' };
const LINE_KINDS = { book_receive: 'suppliers.line.receive', book_returned: 'suppliers.line.returned', book_sale: 'suppliers.line.sale' };

function fields(kind) {
  const base = [
    { name: 'name', label: t('users.name'), required: true },
    { name: 'phone', label: t('setup.phone'), inputmode: 'tel' },
  ];
  const vendor = kind === 'vendor' ? [
    { name: 'area', label: t('setup.area'), type: 'select', required: true, options: ['books', 'cafe', 'shared'].map((v) => ({ value: v, label: t(AREAS[v]) })), help: t('suppliers.area_help') },
  ] : [];
  const publisher = kind === 'publisher' ? [
    { name: 'commission', label: t('suppliers.commission'), inputmode: 'numeric', help: t('suppliers.commission_help') },
    { name: 'sell_discount', label: t('suppliers.sell_discount'), inputmode: 'numeric', help: t('suppliers.sell_discount_help') },
    { name: 'pays_on', label: t('suppliers.pays_on'), type: 'select', required: true, options: Object.keys(PAYS_ON).map((v) => ({ value: v, label: t(PAYS_ON[v]) })) },
    { name: 'pay_every', label: t('suppliers.pay_every'), inputmode: 'numeric', help: t('suppliers.pay_every_help') },
  ] : [];
  return [
    ...base, ...vendor, ...publisher,
    { name: 'opening_due', label: t('suppliers.opening_due'), inputmode: 'numeric', help: t('suppliers.opening_due_help') },
    { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }] },
  ];
}

function edit(kind, supplier, onSaved) {
  const values = supplier
    ? { ...supplier, commission: String(supplier.commission), sell_discount: String(supplier.sell_discount), opening_due: String(supplier.opening_due), pay_every: supplier.pay_every ? String(supplier.pay_every) : '' }
    : { status: 'active', pays_on: 'sale', area: 'shared' };
  const dialog = formDialog(t(kind === 'vendor' ? 'suppliers.vendor' : 'suppliers.publisher'), formView({ fields: fields(kind), values, submit: t('common.save') }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['setup.supplier.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => {
      const out = { ...v, kind, id: supplier ? supplier.id : null, version: supplier ? supplier.version : null };
      for (const k of ['commission', 'sell_discount', 'opening_due', 'pay_every']) if (out[k] === '') out[k] = null;
      return out;
    },
    onSubmit: (v) => write('setup.supplier.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onSaved();
    },
  });
}

function lineText(l) {
  if (LINE_KINDS[l.kind]) return t(LINE_KINDS[l.kind], { title: l.book, qty: l.qty });
  return t(KINDS[l.kind].label);
}

function statement(supplier) {
  const dialog = formDialog(supplier.name, html`<div class="statement" aria-busy="true"></div>`);
  const body = dialog.querySelector('.statement');
  read('supplier.statement', { id: supplier.id }).then(({ data }) => {
    render(body, html`
      <p><strong>${t('suppliers.owed_now', { owed: money(data.supplier.owed) })}</strong></p>
      ${data.opening_due ? html`<p class="muted">${t('suppliers.opening_line', { amount: money(data.opening_due) })}</p>` : ''}
      ${data.lines.length ? html`<div class="list-body"><table class="table">
        <thead><tr><th scope="col">${t('money.field.date')}</th><th scope="col">${t('money.what')}</th><th scope="col">${t('money.field.amount')}</th><th scope="col">${t('suppliers.owed')}</th></tr></thead>
        <tbody>${data.lines.map((l) => html`<tr>
          <td data-label="${t('money.field.date')}" class="nowrap"><span>${dateShort(l.date)}</span></td>
          <td data-label="${t('money.what')}"><span>${lineText(l)}${l.ref ? html` <code>${l.ref}</code>` : ''}${l.covers_up_to ? html`<br><span class="muted">${t('suppliers.covers', { date: dateShort(l.covers_up_to) })}</span>` : ''}</span></td>
          <td data-label="${t('money.field.amount')}" class="num nowrap"><span>${money(l.amount)}</span></td>
          <td data-label="${t('suppliers.owed')}" class="num nowrap"><span>${money(l.owed)}</span></td></tr>`)}</tbody>
      </table></div>` : emptyState(t('suppliers.no_lines'))}`);
  }).catch((err) => render(body, errorBox(errorText(err)))).finally(() => body.removeAttribute('aria-busy'));
}

function sectionView(kind, rows) {
  const payKind = kind === 'vendor' ? 'vendor_payment' : 'publisher_payment';
  return html`<section class="panel">
    <div class="panel-head"><h2 class="section-title">${t(kind === 'vendor' ? 'suppliers.vendors' : 'suppliers.publishers')}</h2>
      ${can('setup.books') ? html`<button type="button" class="btn" data-act="add" data-kind="${kind}">${t(kind === 'vendor' ? 'suppliers.add_vendor' : 'suppliers.add_publisher')}</button>` : ''}</div>
    ${rows.length ? html`<div class="list-body"><table class="table">
      <thead><tr><th scope="col">${t('users.name')}</th><th scope="col">${t('suppliers.terms')}</th><th scope="col">${t('suppliers.owed')}</th><th scope="col"><span class="sr-only">${t('suppliers.actions')}</span></th></tr></thead>
      <tbody>${rows.map((s) => html`<tr data-act="open" data-id="${s.id}" tabindex="0">
        <td data-label="${t('users.name')}"><span><strong>${s.name}</strong> ${s.status === 'active' ? '' : chip(t('users.inactive'), 'muted')}</span></td>
        <td data-label="${t('suppliers.terms')}"><span>${kind === 'publisher' ? t('suppliers.terms_line', { commission: s.commission, discount: s.sell_discount, pays: t(PAYS_ON[s.pays_on]) }) : s.phone}</span></td>
        <td data-label="${t('suppliers.owed')}" class="num nowrap"><span class="${s.owed < 0 ? 'muted' : ''}">${money(s.owed)}</span></td>
        <td data-label="" class="nowrap"><span>
          <a class="btn btn-small" href="#/money/new?kind=${payKind}&party_id=${s.id}">${t('suppliers.pay')}</a>
          ${can('setup.books') ? html`<button type="button" class="btn btn-small" data-act="edit" data-id="${s.id}">${t('books.edit')}</button>` : ''}</span></td>
      </tr>`)}</tbody></table></div>` : emptyState(t('setup.empty'))}
  </section>`;
}

export const suppliersPage = {
  path: '/suppliers',
  title: 'nav.suppliers',
  perm: 'acc.view_all',
  mount(el) {
    let rows = [];
    render(el, html`<p class="intro">${t('suppliers.intro')}</p><div class="sup-notice"></div><div class="sup-body" aria-busy="true"></div>`);
    const body = el.querySelector('.sup-body');
    const load = latestOnly(body);
    const reload = () => load(
      () => read('suppliers.list'),
      ({ data }) => {
        rows = data.items;
        render(body, ['publisher', 'vendor'].map((k) => sectionView(k, rows.filter((s) => s.kind === k))));
      },
      (err) => render(el.querySelector('.sup-notice'), errorBox(errorText(err))),
    );
    const find = (id) => rows.find((s) => s.id === id);
    const off = on(body, 'click', {
      add: (e, btn) => edit(btn.dataset.kind, null, reload),
      edit: (e, btn) => {
        const s = find(btn.dataset.id);
        edit(s.kind, s, reload);
      },
      open: (e, tr) => statement(find(tr.dataset.id)),
    });
    const offArea = onArea('money', reload);
    reload();
    return () => {
      off();
      offArea();
    };
  },
};
