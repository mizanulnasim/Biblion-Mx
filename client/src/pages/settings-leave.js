// Leave types and holidays: the kinds of leave, and the public holidays of
// a year. How leave is earned is in Setup → Leave and rota.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { dateShort, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { leaveTypeName } from './leave.js';

// The kinds of leave: Paid and Unpaid are built in; shareholders add others.
function typesView(types) {
  const yes = (on, id) => (on ? html`<span class="muted">${t(id)}</span>` : '');
  return html`<section class="panel"><h2 class="section-title">${t('leave.types')}</h2>
    <p class="help">${t('leave.types_help')}</p>
    <ul class="punches">${types.map((x) => html`<li class="punch">
      <span><strong>${leaveTypeName(x)}</strong> ${yes(x.paid, 'leave.type.paid')} ${yes(x.from_balance, 'leave.type.from_balance')} ${yes(x.half_days, 'leave.type.half_days')}</span>
      ${x.status === 'active' ? '' : chip(t('users.inactive'), 'muted')}
      ${x.built_in ? html`<span class="muted">${t('leave.type.built_in')}</span>` : html`<button type="button" class="btn btn-small" data-act="type" data-id="${x.id}">${t('common.edit')}</button>`}</li>`)}</ul>
    <div class="form-actions"><button type="button" class="btn" data-act="type">${t('leave.add_type')}</button></div></section>`;
}

function editType(type, onDone) {
  const dialog = formDialog(type ? type.name : t('leave.add_type'), formView({
    submit: t('common.save'),
    values: type || { status: 'active', paid: true, half_days: true },
    fields: [
      { name: 'name', label: t('users.name'), required: true, help: t('leave.type.name_help') },
      { name: 'name_bn', label: t('cafe.name_bn') },
      { name: 'paid', label: t('leave.type.paid'), type: 'checkbox' },
      { name: 'from_balance', label: t('leave.type.from_balance'), type: 'checkbox', help: t('leave.type.from_balance_help') },
      { name: 'half_days', label: t('leave.type.half_days'), type: 'checkbox' },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }] },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['leave.type.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id: type ? type.id : null, version: type ? type.version : null }),
    onSubmit: (v) => write('leave.type.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

function holidaysView(data) {
  return html`<section class="panel"><h2 class="section-title">${t('leave.holidays', { year: data.year })}</h2>
    <div class="list-bar">
      <button type="button" class="btn" data-act="year" data-by="-1">${t('leave.year_before')}</button>
      <button type="button" class="btn" data-act="year" data-by="1">${t('leave.year_after')}</button>
      <button type="button" class="btn btn-primary" data-act="holiday">${t('leave.add_holiday')}</button>
    </div>
    ${data.items.length ? html`<ul class="punches">${data.items.map((h) => html`<li class="punch">
      <span><strong>${dateShort(`${h.date}T06:00:00Z`)}</strong> ${h.name}${h.name_bn ? html` <span class="muted">${h.name_bn}</span>` : ''}</span>
      ${h.status === 'active' ? '' : chip(t('users.inactive'), 'muted')}
      <button type="button" class="btn btn-small" data-act="holiday" data-id="${h.id}">${t('common.edit')}</button></li>`)}</ul>` : emptyState(t('leave.no_holidays'))}
  </section>`;
}

function editHoliday(h, onDone) {
  const dialog = formDialog(h ? h.name : t('leave.add_holiday'), formView({
    submit: t('common.save'),
    values: h || { status: 'active' },
    fields: [
      { name: 'date', label: t('money.field.date'), type: 'date', required: true },
      { name: 'name', label: t('users.name'), required: true },
      { name: 'name_bn', label: t('cafe.name_bn') },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }] },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['holidays.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id: h ? h.id : null, version: h ? h.version : null }),
    onSubmit: (v) => write('holidays.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

export const settingsLeavePage = {
  path: '/settings/leave',
  title: 'nav.leave_types',
  perm: 'settings.manage',
  mount(el) {
    let year = Number(today().slice(0, 4));
    let holidays = null;
    let types = [];
    async function load() {
      try {
        const [list, kinds] = await Promise.all([read('holidays.list', { year }).then((r) => r.data), read('leave.types').then((r) => r.data.types)]);
        holidays = list;
        types = kinds;
        render(el, html`${typesView(types)}${holidaysView(holidays)}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      year: (e, btn) => {
        year += Number(btn.dataset.by);
        load();
      },
      type: (e, btn) => editType(btn.dataset.id ? types.find((x) => x.id === btn.dataset.id) : null, load),
      holiday: (e, btn) => editHoliday(btn.dataset.id ? holidays.items.find((h) => h.id === btn.dataset.id) : null, load),
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return offClick;
  },
};
