// Setup pages drawn from the list descriptions in shared/lists/lists.js:
// one section per list, a table of its records and a form to add or edit
// one. A shareholder can delete a record nothing refers to; otherwise a
// record no longer used is made inactive.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { confirmDialog, formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { getLang, t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { LISTS, listFields } from '../../../shared/lists/lists.js';

const STATUS_OPTIONS = () => [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }];
const nameOf = (r) => (getLang() === 'bn' && r.name_bn ? r.name_bn : r.name);

const CONTROL = {
  text: () => ({}),
  long: () => ({ type: 'textarea' }),
  bool: () => ({ type: 'checkbox' }),
  int: () => ({ inputmode: 'numeric' }),
  number: () => ({ inputmode: 'decimal' }),
  choice: (f) => ({ type: 'select', options: Object.keys(f.choices).map((value) => ({ value, label: t(f.choices[value]) })) }),
  ref: (f, data, value) => ({
    type: 'select', placeholder: '—',
    options: data.refs[f.ref].filter((r) => r.status === 'active' || r.id === value).map((r) => ({ value: r.id, label: nameOf(r) })),
  }),
};

function formFields(key, data, record) {
  const fields = Object.entries(listFields(key)).map(([name, f]) => ({
    name, label: t(f.label), required: Boolean(f.required), help: f.help ? t(f.help) : '', ...CONTROL[f.kind](f, data, record && record[name]),
  }));
  return [...fields, { name: 'status', label: t('users.status'), type: 'select', required: true, options: STATUS_OPTIONS() }];
}

function cell(f, value, data) {
  if (f.kind === 'bool') return value ? t('common.yes') : '';
  if (f.kind === 'choice') return value ? t(f.choices[value]) : '';
  if (f.kind === 'ref') return nameOf(data.refs[f.ref].find((r) => r.id === value) || { name: '' });
  return value ?? '';
}

function sectionView(key, data) {
  const list = LISTS[key];
  const fields = listFields(key);
  const columns = ['name', ...list.columns];
  return html`<section class="panel">
    <div class="panel-head">
      <h2 class="section-title">${t(list.title)}</h2>
      <button type="button" class="btn" data-act="add" data-key="${key}">${t(list.add)}</button>
    </div>
    <p class="help">${t(list.help)}</p>
    <div class="list-body">${data.rows.length ? html`<table class="table">
      <thead><tr>${columns.map((c) => html`<th scope="col">${t(fields[c].label)}</th>`)}<th scope="col">${t('users.status')}</th></tr></thead>
      <tbody>${data.rows.map((r) => html`<tr data-act="edit" data-key="${key}" data-id="${r.id}" tabindex="0">
        <td data-label="${t(fields.name.label)}"><span>${nameOf(r)}</span></td>
        ${list.columns.map((c) => html`<td data-label="${t(fields[c].label)}"><span>${cell(fields[c], r[c], data)}</span></td>`)}
        <td data-label="${t('users.status')}" class="nowrap">${r.status === 'active' ? chip(t('users.active'), 'ok') : chip(t('users.inactive'), 'muted')}</td>
      </tr>`)}</tbody>
    </table>` : emptyState(t('setup.empty'))}</div>
  </section>`;
}

function openRecord(key, record, data, onSaved) {
  const action = `list.${key}.save`;
  const values = record ? { ...record } : { status: 'active' };
  const remove = record && data.can_delete ? html`<button type="button" class="btn" data-act="remove">${t('lists.delete')}</button>` : '';
  const dialog = formDialog(record ? nameOf(record) : t(LISTS[key].add), formView({ fields: formFields(key, data, record), values, submit: t('common.save'), extra: remove }));
  const done = (message) => {
    dialog.close();
    toast(message);
    onSaved();
  };
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS[action].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id: record ? record.id : null, version: record ? record.version : null }),
    onSubmit: async (payload) => {
      const reply = await write(action, payload);
      const similar = reply.status === 'rejected' && reply.error.fields && reply.error.fields.name && reply.error.fields.name.code === 'val.similar';
      if (!similar) return reply;
      const existing = reply.error.fields.name.params.name;
      const saveNew = await confirmDialog({ title: t('setup.similar_title'), body: t('setup.similar_body', { name: payload.name, existing }), ok: t('setup.similar_save_new') });
      if (!saveNew) {
        toast(t('setup.similar_use', { name: existing }));
        dialog.close();
        return { status: 'closed' };
      }
      return write(action, { ...payload, confirm_similar: true });
    },
    onSaved: () => done(t('setup.saved')),
  });
  const off = on(dialog, 'click', {
    remove: async () => {
      const sure = await confirmDialog({ title: t('lists.delete_title'), body: t('lists.delete_body', { name: nameOf(record) }), ok: t('lists.delete'), tone: 'danger' });
      if (!sure) return;
      try {
        const reply = await write(`list.${key}.remove`, { id: record.id, version: record.version });
        if (reply.status === 'saved') done(t('lists.deleted'));
        else toast(t(errorMessageId(reply.error.code), reply.error.params), 'error');
      } catch (err) {
        toast(errorText(err), 'error');
      }
    },
  });
  dialog.addEventListener('close', off, { once: true });
}

function mountLists(el, page) {
  const keys = Object.keys(LISTS).filter((k) => LISTS[k].page === page);
  const data = {};
  render(el, html`<div class="setup-notice"></div>${keys.map((k) => html`<div data-list="${k}" aria-busy="true"></div>`)}`);
  const notice = el.querySelector('.setup-notice');
  const load = async (key) => {
    const region = el.querySelector(`[data-list="${key}"]`);
    try {
      data[key] = (await read(`list.${key}`)).data;
      render(region, sectionView(key, data[key]));
      region.removeAttribute('aria-busy');
    } catch (err) {
      render(notice, errorBox(errorText(err)));
    }
  };
  // A designation names its department: after a change, reload the lists
  // that refer to the changed one too.
  const reload = (key) => {
    for (const k of keys) if (k === key || Object.values(LISTS[k].fields).some((f) => f.ref === key)) load(k);
  };
  const off = on(el, 'click', {
    add: (e, btn) => openRecord(btn.dataset.key, null, data[btn.dataset.key], () => reload(btn.dataset.key)),
    edit: (e, tr) => openRecord(tr.dataset.key, data[tr.dataset.key].rows.find((r) => r.id === tr.dataset.id), data[tr.dataset.key], () => reload(tr.dataset.key)),
  });
  const onKey = (e) => {
    if (e.key === 'Enter' && e.target.matches('tr[data-act="edit"]')) e.target.click();
  };
  el.addEventListener('keydown', onKey);
  keys.forEach(load);
  return () => {
    off();
    el.removeEventListener('keydown', onKey);
  };
}

export const setupHrPage = {
  path: '/setup/hr',
  title: 'nav.setup_hr',
  perm: 'setup.hr',
  mount: (el) => mountLists(el, 'hr'),
};

export const setupTasksPage = {
  path: '/setup/tasks',
  title: 'nav.setup_tasks',
  perm: 'setup.tasks',
  mount: (el) => mountLists(el, 'tasks'),
};
