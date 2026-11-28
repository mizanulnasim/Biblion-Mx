// Café items: stock (counted at every daily closing) and supplies (checked
// when ordering), with their ordering rules; and the checklist of common
// items to add in one go.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { itemName } from './cafe-common.js';

const KIND = { stock: 'cafe.kind.stock', supply: 'cafe.kind.supply' };

function editItem(item, vendors, onSaved) {
  const values = item ? Object.fromEntries(Object.entries(item).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])) : { kind: 'stock', status: 'active', order_multiple: '1', cover_days: '7', lead_days: '1' };
  const dialog = formDialog(item ? itemName(item) : t('cafe.add_item'), formView({
    submit: t('common.save'),
    values,
    fields: [
      { name: 'name', label: t('users.name'), required: true },
      { name: 'name_bn', label: t('cafe.name_bn') },
      { name: 'kind', label: t('cafe.kind'), type: 'select', required: true, options: Object.keys(KIND).map((k) => ({ value: k, label: t(KIND[k]) })), help: t('cafe.kind_help') },
      { name: 'unit', label: t('cafe.unit'), required: true, help: t('cafe.unit_help') },
      { name: 'vendor_id', label: t('money.field.vendor'), type: 'select', placeholder: t('money.choose'), options: vendors.map((v) => ({ value: v.id, label: v.name })) },
      { name: 'shelf_life_days', label: t('cafe.shelf_life'), inputmode: 'numeric', help: t('cafe.shelf_life_help') },
      { name: 'cover_days', label: t('cafe.cover_days'), inputmode: 'numeric', help: t('cafe.cover_days_help') },
      { name: 'lead_days', label: t('cafe.lead_days'), inputmode: 'numeric' },
      { name: 'min_order', label: t('cafe.min_order'), inputmode: 'numeric' },
      { name: 'order_multiple', label: t('cafe.order_multiple'), inputmode: 'numeric', help: t('cafe.order_multiple_help') },
      { name: 'aliases', label: t('books.aliases'), help: t('cafe.aliases_help') },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }] },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['cafe.item.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => {
      const out = { ...v, id: item ? item.id : null, version: item ? item.version : null };
      for (const k of ['shelf_life_days', 'cover_days', 'lead_days', 'min_order', 'order_multiple', 'vendor_id']) if (out[k] === '') out[k] = null;
      return out;
    },
    onSubmit: (v) => write('cafe.item.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onSaved();
    },
  });
}

function checklist(starter, items, onSaved) {
  const have = new Set(items.map((i) => i.name.toLowerCase()));
  const group = (kind) => html`<fieldset class="starter"><legend>${t(KIND[kind])}</legend>
    ${starter.filter((s) => s.kind === kind).map((s) => html`<label class="field-check"><input type="checkbox" name="${s.key}" ${have.has(s.name.toLowerCase()) ? 'disabled checked' : ''}>
      ${s.name} · ${s.name_bn} <span class="muted">(${s.unit})</span></label>`)}</fieldset>`;
  const dialog = formDialog(t('cafe.checklist'), html`<form class="form starter-form"><p class="help">${t('cafe.checklist_help')}</p>
    ${group('stock')}${group('supply')}
    <div class="form-actions"><button type="submit" class="btn btn-primary">${t('cafe.add_checked')}</button></div></form>`);
  const form = dialog.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const keys = [...form.querySelectorAll('input:checked:not(:disabled)')].map((i) => ({ key: i.name }));
    whileBusy(form.querySelector('[type="submit"]'), t('common.saving'), async () => {
      const reply = await write('cafe.starter.add', { keys });
      if (reply.status === 'saved') {
        dialog.close();
        toast(t('cafe.added', { count: reply.data.added }));
        onSaved();
      }
    });
  });
}

export const cafeItemsPage = {
  path: '/cafe/items',
  title: 'nav.cafe_items',
  perm: 'cafe.view',
  mount(el) {
    let data = null;
    let vendors = [];
    async function load() {
      try {
        [data, vendors] = await Promise.all([
          read('cafe.items').then((r) => r.data),
          read('money.boot').then((r) => r.data.suppliers.filter((s) => s.kind === 'vendor')).catch(() => []),
        ]);
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    function section(kind) {
      const rows = data.items.filter((i) => i.kind === kind);
      const vendorName = (id) => (vendors.find((v) => v.id === id) || {}).name || '';
      return html`<section class="panel"><h2 class="section-title">${t(KIND[kind])}</h2>
        ${rows.length ? html`<div class="list-body"><table class="table">
          <thead><tr><th scope="col">${t('users.name')}</th><th scope="col">${t('cafe.unit')}</th><th scope="col">${t('money.field.vendor')}</th><th scope="col">${t('cafe.shelf_life')}</th><th scope="col">${t('users.status')}</th></tr></thead>
          <tbody>${rows.map((i) => html`<tr data-act="${can('cafe.setup') ? 'edit' : ''}" data-id="${i.id}" tabindex="0">
            <td data-label="${t('users.name')}"><span><strong>${itemName(i)}</strong>${i.name_bn && itemName(i) !== i.name_bn ? html` <span class="muted">${i.name_bn}</span>` : ''}</span></td>
            <td data-label="${t('cafe.unit')}"><span>${i.unit}</span></td>
            <td data-label="${t('money.field.vendor')}"><span>${vendorName(i.vendor_id)}</span></td>
            <td data-label="${t('cafe.shelf_life')}" class="nowrap"><span>${i.shelf_life_days ? t('cafe.days', { count: i.shelf_life_days }) : '—'}</span></td>
            <td data-label="${t('users.status')}" class="nowrap"><span>${i.status === 'active' ? chip(t('users.active'), 'ok') : chip(t('users.inactive'), 'muted')}</span></td>
          </tr>`)}</tbody></table></div>` : emptyState(t('setup.empty'))}</section>`;
    }
    function draw() {
      render(el, html`${can('cafe.setup') ? html`<div class="list-bar">
          <button type="button" class="btn btn-primary" data-act="add">${t('cafe.add_item')}</button>
          <button type="button" class="btn" data-act="checklist">${t('cafe.checklist')}</button></div>` : ''}
        ${section('stock')}${section('supply')}`);
    }
    const off = on(el, 'click', {
      add: () => editItem(null, vendors, load),
      checklist: () => checklist(data.starter, data.items, load),
      edit: (e, tr) => editItem(data.items.find((i) => i.id === tr.dataset.id), vendors, load),
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return off;
  },
};
