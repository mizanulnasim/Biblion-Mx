// Staff records: the basic record (with its staff number), work hours and
// days off, and the punch PIN. Identity, emergency contacts, family and
// salary appear only for people allowed to see them (the server never sends
// them otherwise). And people's changes to their own contact details,
// waiting for a decision.

import { html, on, render } from '../ui/html.js';
import { mountList } from '../ui/list.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { money } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { hoursText } from './attendance-common.js';
import { decideRequest } from './rota.js';
import { onArea } from '../core/live.js';

const WEEKDAYS = ['date.wd.sun', 'date.wd.mon', 'date.wd.tue', 'date.wd.wed', 'date.wd.thu', 'date.wd.fri', 'date.wd.sat'];
const STATUS = { active: ['users.active', 'ok'], left: ['hr.left', 'muted'] };
const EMERGENCY_ROWS = 2;

function fieldsFor(staff, users, shifts) {
  const fields = [
    { name: 'name', label: t('users.name'), required: true },
    { name: 'name_bn', label: t('cafe.name_bn') },
    { name: 'phone', label: t('setup.phone'), inputmode: 'tel' },
    { name: 'email', label: t('shop.email'), inputmode: 'email' },
    { name: 'position', label: t('hr.position') },
    {
      name: 'user_id', label: t('hr.sign_in'), type: 'select', placeholder: t('hr.no_sign_in'), help: t('hr.sign_in_help'),
      options: users.filter((u) => !u.linked || (staff && staff.user_id === u.id)).map((u) => ({ value: u.id, label: u.name })),
    },
    { name: 'joined_on', label: t('hr.joined_on'), type: 'date' },
    { name: 'left_on', label: t('hr.left_on'), type: 'date', help: t('hr.left_on_help') },
    { name: 'work_start', label: t('hr.work_start'), type: 'time', help: t('hr.work_help') },
    { name: 'work_end', label: t('hr.work_end'), type: 'time' },
    ...WEEKDAYS.map((wd, day) => ({ name: `off_${day}`, label: t('hr.day_off', { day: t(wd) }), type: 'checkbox' })),
    ...shifts.map((s, i) => ({ name: `shift_${s.id}`, label: t('hr.may_choose', { shift: s.name }), type: 'checkbox', help: i ? '' : t('hr.shift_list_help') })),
    { name: 'pin', label: t(staff && staff.pin_set ? 'hr.new_pin' : 'hr.pin'), type: 'password', inputmode: 'numeric', autocomplete: 'new-password', help: t(staff && staff.pin_set ? 'hr.new_pin_help' : 'hr.pin_help') },
    { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'left', label: t('hr.left') }] },
  ];
  if (can('staff.identity')) {
    fields.push(
      { name: 'nid', label: t('hr.nid') },
      { name: 'birth_date', label: t('hr.birth_date'), type: 'date' },
      { name: 'address', label: t('hr.address'), type: 'textarea' },
    );
  }
  if (can('staff.emergency')) {
    for (let i = 0; i < EMERGENCY_ROWS; i++) {
      fields.push(
        { name: `em_name_${i}`, label: t('hr.emergency_name', { n: i + 1 }) },
        { name: `em_relation_${i}`, label: t('hr.emergency_relation') },
        { name: `em_phone_${i}`, label: t('setup.phone'), inputmode: 'tel' },
      );
    }
  }
  if (can('staff.family')) fields.push({ name: 'family', label: t('hr.family'), type: 'textarea', help: t('hr.family_help') });
  if (can('salary.edit')) {
    fields.push(
      { name: 'salary', label: t('hr.salary'), inputmode: 'decimal', help: t('hr.salary_help') },
      { name: 'overtime_rate', label: t('hr.overtime_rate'), inputmode: 'decimal', help: t('hr.overtime_rate_help') },
    );
  }
  return fields;
}

function valuesOf(staff) {
  if (!staff) return { status: 'active', off_5: true };
  const values = { ...staff, salary: staff.salary ? String(staff.salary) : '', overtime_rate: staff.overtime_rate ? String(staff.overtime_rate) : '' };
  for (const day of staff.days_off) values[`off_${day}`] = true;
  for (const id of staff.shift_ids) values[`shift_${id}`] = true;
  (staff.emergency || []).forEach((e, i) => {
    values[`em_name_${i}`] = e.name;
    values[`em_relation_${i}`] = e.relation;
    values[`em_phone_${i}`] = e.phone;
  });
  return values;
}

function openStaff(staff, users, shifts, onSaved) {
  const dialog = formDialog(staff ? staff.name : t('hr.add_staff'), formView({
    submit: staff ? t('common.save') : t('hr.add_staff'),
    values: valuesOf(staff),
    fields: fieldsFor(staff, users, shifts),
    extra: staff ? html`<p><a href="#/staff/letters?id=${staff.id}">${t('nav.letters')}</a></p>` : '',
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['staff.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => {
      const out = { ...v, id: staff ? staff.id : null, version: staff ? staff.version : null };
      out.days_off = WEEKDAYS.map((wd, day) => day).filter((day) => v[`off_${day}`]).map((day) => ({ day }));
      out.shift_ids = shifts.filter((s) => v[`shift_${s.id}`]).map((s) => ({ id: s.id }));
      out.emergency = [];
      for (let i = 0; i < EMERGENCY_ROWS; i++) {
        if (`em_name_${i}` in v) out.emergency.push({ name: v[`em_name_${i}`], relation: v[`em_relation_${i}`], phone: v[`em_phone_${i}`] });
      }
      for (const k of ['email', 'user_id', 'joined_on', 'left_on', 'work_start', 'work_end', 'pin', 'birth_date', 'salary', 'overtime_rate']) if (out[k] === '') out[k] = null;
      return out;
    },
    onSubmit: (v) => write('staff.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onSaved();
    },
  });
}

export const staffPage = {
  path: '/staff',
  title: 'nav.staff',
  perm: 'staff.view',
  mount(el) {
    let users = [];
    let shifts = [];
    const columns = [
      { label: t('hr.number'), cell: (s) => s.number || '—', kind: 'nowrap' },
      { label: t('users.name'), cell: (s) => html`<strong>${s.name}</strong>${s.position ? html` <span class="muted">${s.position}</span>` : ''}` },
      { label: t('hr.sign_in'), cell: (s) => s.user_name || '—' },
      { label: t('hr.hours_label'), cell: (s) => hoursText(s), kind: 'nowrap' },
      { label: t('hr.pin'), cell: (s) => (s.pin_set ? chip(t('hr.pin_set'), 'ok') : chip(t('hr.pin_missing'), 'muted')), kind: 'nowrap' },
      { label: t('users.status'), cell: (s) => chip(t(STATUS[s.status][0]), STATUS[s.status][1]), kind: 'nowrap' },
    ];
    if (can('salary.view')) columns.splice(3, 0, { label: t('hr.salary'), cell: (s) => (s.salary ? money(s.salary) : '—'), kind: 'num' });
    const list = mountList(el, {
      key: 'staff',
      action: 'staff.list',
      area: 'hr',
      searchLabel: t('hr.search'),
      empty: t('hr.no_staff_yet'),
      emptySearch: t('list.no_match'),
      filters: [{ name: 'status', label: t('hr.all_staff'), options: [{ value: 'active', label: t('users.active') }, { value: 'left', label: t('hr.left') }] }],
      initial: { status: 'active' },
      onData: (data) => {
        users = data.users;
        shifts = data.shifts;
      },
      tools: can('staff.edit') ? html`<button type="button" class="btn btn-primary" data-act="tool" data-tool="add">${t('hr.add_staff')}</button>` : '',
      columns,
      onRow: (staff) => (can('staff.edit') ? openStaff(staff, users, shifts, () => list.reload()) : null),
      onTool: () => openStaff(null, users, shifts, () => list.reload()),
    });
    return () => list.destroy();
  },
};

// A change's fields, before → after, where they differ.
const CHANGE_FIELDS = [['phone', 'setup.phone'], ['email', 'shop.email'], ['address', 'hr.address']];
function changeLines(c) {
  return CHANGE_FIELDS.filter(([k]) => c[k] !== c.before[k]).map(([k, label]) => html`<span>${t(label)}: <span class="muted">${c.before[k] || '—'}</span> → <strong>${c[k] || '—'}</strong></span>`);
}

export const staffChangesPage = {
  path: '/staff/changes',
  title: 'nav.staff_changes',
  perm: 'staff.edit',
  mount(el) {
    async function load() {
      try {
        const { items } = (await read('staff.details.waiting')).data;
        render(el, html`<section class="panel"><p class="help">${t('hr.changes_help')}</p>
          ${items.length ? html`<ul class="waiting-list">${items.map((c) => html`<li class="check-item">
            <span><strong>${c.staff_name}</strong></span>${changeLines(c)}
            <span class="check-actions">
              <button type="button" class="btn btn-small btn-primary" data-act="decide" data-id="${c.id}" data-decision="accept">${t('hr.accept')}</button>
              <button type="button" class="btn btn-small" data-act="decide" data-id="${c.id}" data-decision="reject">${t('hr.reject')}</button>
            </span></li>`)}</ul>` : emptyState(t('hr.no_changes'))}</section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', { decide: (e, btn) => decideRequest('staff.details.decide', btn, load) });
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
    };
  },
};
