// Setup → Money: money accounts, expense categories, due contacts and
// shareholders. Nothing here is deleted; a record no longer used is made
// inactive, so old entries still show its name.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox, latestOnly } from '../ui/feedback.js';
import { confirmDialog, formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { money } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { ACCOUNT_KINDS } from './money-common.js';

const STATUS_OPTIONS = () => [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }];
const AREAS = { books: 'setup.area.books', cafe: 'setup.area.cafe', shared: 'setup.area.shared' };
const options = (map) => Object.keys(map).map((value) => ({ value, label: t(map[value]) }));

// Each section: the list key in setup.money, its save action, fields and columns.
const SECTIONS = [
  {
    key: 'accounts', action: 'setup.account.save', title: 'setup.accounts', add: 'setup.add_account', help: 'setup.accounts_help',
    fields: () => [
      { name: 'name', label: t('users.name'), required: true },
      { name: 'kind', label: t('setup.account_kind'), type: 'select', required: true, options: options(ACCOUNT_KINDS), help: t('setup.account_kind_help') },
      { name: 'opening', label: t('setup.opening'), inputmode: 'numeric', help: t('setup.opening_help') },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: STATUS_OPTIONS() },
    ],
    defaults: { kind: 'bank', status: 'active' },
    columns: () => [
      { label: t('users.name'), cell: (r) => r.name },
      { label: t('setup.account_kind'), cell: (r) => t(ACCOUNT_KINDS[r.kind]) },
      { label: t('setup.opening'), cell: (r) => money(r.opening || 0), kind: 'nowrap num' },
    ],
  },
  {
    key: 'categories', action: 'setup.category.save', title: 'setup.categories', add: 'setup.add_category', help: 'setup.categories_help',
    fields: () => [
      { name: 'name', label: t('users.name'), required: true },
      { name: 'area', label: t('setup.area'), type: 'select', required: true, options: options(AREAS), help: t('setup.area_help') },
      { name: 'needs_shareholder', label: t('setup.needs_shareholder'), type: 'checkbox', help: t('setup.needs_shareholder_help') },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: STATUS_OPTIONS() },
    ],
    defaults: { area: 'shared', status: 'active' },
    columns: () => [
      { label: t('users.name'), cell: (r) => r.name },
      { label: t('setup.area'), cell: (r) => t(AREAS[r.area]) },
      { label: t('setup.needs_shareholder_short'), cell: (r) => (r.needs_shareholder ? t('common.yes') : '') },
    ],
  },
  {
    key: 'contacts', action: 'setup.contact.save', title: 'setup.contacts', add: 'setup.add_contact', help: 'setup.contacts_help',
    fields: () => [
      { name: 'name', label: t('users.name'), required: true },
      { name: 'phone', label: t('setup.phone'), inputmode: 'tel' },
      { name: 'opening_due', label: t('setup.opening_due'), inputmode: 'numeric', help: t('setup.opening_due_help') },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: STATUS_OPTIONS() },
    ],
    defaults: { status: 'active' },
    columns: () => [
      { label: t('users.name'), cell: (r) => r.name },
      { label: t('setup.phone'), cell: (r) => r.phone, kind: 'nowrap' },
      { label: t('setup.opening_due'), cell: (r) => money(r.opening_due || 0), kind: 'nowrap num' },
    ],
  },
  {
    key: 'shareholders', action: 'setup.shareholder.save', title: 'setup.shareholders', add: 'setup.add_shareholder', help: 'setup.shareholders_help',
    fields: () => [
      { name: 'name', label: t('users.name'), required: true },
      { name: 'phone', label: t('setup.phone'), inputmode: 'tel' },
      { name: 'salary', label: t('sh.salary'), inputmode: 'decimal', help: t('sh.salary_help') },
      { name: 'opening_held', label: t('sh.opening_held'), inputmode: 'decimal', help: t('sh.opening_held_help') },
      { name: 'opening_owed', label: t('sh.opening_owed'), inputmode: 'decimal', help: t('sh.opening_owed_help') },
      { name: 'opening_owes', label: t('sh.opening_owes'), inputmode: 'decimal', help: t('sh.opening_owes_help') },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: STATUS_OPTIONS() },
    ],
    defaults: { status: 'active' },
    columns: () => [
      { label: t('users.name'), cell: (r) => r.name },
      { label: t('setup.phone'), cell: (r) => r.phone, kind: 'nowrap' },
      { label: t('sh.salary'), cell: (r) => money(r.salary || 0), kind: 'nowrap num' },
    ],
  },
];

function sectionView(section, rows) {
  const columns = [...section.columns(), { label: t('users.status'), cell: (r) => (r.status === 'active' ? chip(t('users.active'), 'ok') : chip(t('users.inactive'), 'muted')), kind: 'nowrap' }];
  return html`<section class="panel">
    <div class="panel-head">
      <h2 class="section-title">${t(section.title)}</h2>
      <button type="button" class="btn" data-act="add" data-key="${section.key}">${t(section.add)}</button>
    </div>
    <p class="help">${t(section.help)}</p>
    <div class="list-body">${rows.length ? html`<table class="table">
      <thead><tr>${columns.map((c) => html`<th scope="col">${c.label}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr data-act="edit" data-key="${section.key}" data-id="${r.id}" tabindex="0">
        ${columns.map((c) => html`<td data-label="${c.label}" class="${c.kind || ''}"><span>${c.cell(r)}</span></td>`)}</tr>`)}</tbody>
    </table>` : emptyState(t('setup.empty'))}</div>
  </section>`;
}

function openRecord(section, record, onSaved) {
  const values = record ? { ...record } : { ...section.defaults };
  const dialog = formDialog(t(section.add), formView({ fields: section.fields(), values, submit: t('common.save') }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS[section.action].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => {
      const out = { ...v, id: record ? record.id : null, version: record ? record.version : null };
      for (const key of ['opening', 'opening_due', 'salary', 'opening_held', 'opening_owed', 'opening_owes']) if (key in out && out[key] === '') out[key] = null;
      return out;
    },
    onSubmit: async (payload) => {
      const reply = await write(section.action, payload);
      const similar = reply.status === 'rejected' && reply.error.fields && reply.error.fields.name && reply.error.fields.name.code === 'val.similar';
      if (!similar) return reply;
      // "Utility" when "Utilities" exists: offer to use the existing one.
      const existing = reply.error.fields.name.params.name;
      const saveNew = await confirmDialog({
        title: t('setup.similar_title'),
        body: t('setup.similar_body', { name: payload.name, existing }),
        ok: t('setup.similar_save_new'),
      });
      if (!saveNew) {
        toast(t('setup.similar_use', { name: existing }));
        dialog.close();
        return { status: 'closed' };
      }
      return write(section.action, { ...payload, confirm_similar: true });
    },
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onSaved();
    },
  });
}

export const setupMoneyPage = {
  path: '/setup/money',
  title: 'nav.setup_money',
  perm: 'acc.setup',
  mount(el) {
    let data = null;
    render(el, html`<div class="setup-notice"></div><div class="setup-body" aria-busy="true"></div>`);
    const body = el.querySelector('.setup-body');
    const notice = el.querySelector('.setup-notice');
    const load = latestOnly(body);
    const reload = () => load(
      () => read('setup.money'),
      (reply) => {
        data = reply.data;
        render(notice, '');
        render(body, SECTIONS.map((s) => sectionView(s, data[s.key])));
      },
      (err) => render(notice, errorBox(errorText(err))),
    );
    const section = (btn) => SECTIONS.find((s) => s.key === btn.dataset.key);
    const off = on(el, 'click', {
      add: (e, btn) => openRecord(section(btn), null, reload),
      edit: (e, tr) => openRecord(section(tr), data[tr.dataset.key].find((r) => r.id === tr.dataset.id), reload),
    });
    const onKey = (e) => {
      if (e.key === 'Enter' && e.target.matches('tr[data-act="edit"]')) e.target.click();
    };
    el.addEventListener('keydown', onKey);
    reload();
    return () => {
      off();
      el.removeEventListener('keydown', onKey);
    };
  },
};
