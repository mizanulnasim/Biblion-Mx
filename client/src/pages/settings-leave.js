// Settings → Leave and rota: how leave is earned and counted, what public
// holidays mean for the shop, what staff may ask of the rota; the kinds of
// leave; and the public holidays of a year.

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

const NUMBERS = ['probation_months', 'rate', 'advance_days', 'min_rest_hours', 'min_notice_days'];
// options: [[value, message id], …]
const choice = (name, label, options, help) => ({
  name, label: t(label), type: 'select', required: true, help: help ? t(help) : '',
  options: options.map(([value, id]) => ({ value, label: t(id) })),
});

function settingsForm(data) {
  const values = { ...data };
  for (const k of NUMBERS) values[k] = String(data[k]);
  const num = (name, label, help) => ({ name, label: t(label), inputmode: name === 'rate' ? 'decimal' : 'numeric', required: true, help: help ? t(help) : '' });
  return formView({
    submit: t('common.save'),
    values,
    fields: [
      num('probation_months', 'leave.set.probation', 'leave.set.probation_help'),
      num('rate', 'leave.set.rate', 'leave.set.rate_help'),
      choice('timing', 'leave.set.timing', [['service_month', 'leave.set.timing_service'], ['calendar_month', 'leave.set.timing_calendar']]),
      choice('partial', 'leave.set.partial', [['prorate_days', 'leave.set.partial_prorate'], ['none', 'leave.set.partial_none']], 'leave.set.partial_help'),
      choice('day_counting', 'leave.set.counting', [['working', 'leave.set.counting_working'], ['calendar', 'leave.set.counting_calendar']]),
      { name: 'allow_negative', label: t('leave.set.negative'), type: 'checkbox', help: t('leave.set.negative_help') },
      choice('holidays', 'leave.set.holidays', [['open_scheduled', 'leave.set.holidays_open'], ['closed', 'leave.set.holidays_closed']]),
      { name: 'self_select', label: t('leave.set.self_select'), type: 'checkbox', help: t('leave.set.self_select_help') },
      num('advance_days', 'leave.set.advance'),
      num('min_rest_hours', 'leave.set.rest'),
      num('min_notice_days', 'leave.set.notice', 'leave.set.notice_help'),
    ],
  });
}

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
  title: 'nav.settings_leave',
  perm: 'settings.manage',
  mount(el) {
    let year = Number(today().slice(0, 4));
    let holidays = null;
    let types = [];
    async function load() {
      try {
        const [settings, list] = await Promise.all([read('settings.leave').then((r) => r.data), read('holidays.list', { year }).then((r) => r.data)]);
        holidays = list;
        types = settings.types;
        render(el, html`<section class="panel">${settingsForm(settings)}</section>${typesView(types)}${holidaysView(holidays)}`);
        bindForm(el.querySelector('form.form'), {
          schema: ACTIONS['settings.leave.save'].schema,
          busyLabel: t('common.saving'),
          onSubmit: (v) => write('settings.leave.save', v),
          onSaved: () => toast(t('setup.saved')),
        });
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
