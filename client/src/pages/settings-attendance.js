// The shop's punch devices: making this device one, renaming, stopping one.
// Whether the shop uses one at all is a setting (Setup → Attendance).

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { confirmDialog, formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { device } from '../core/state.js';
import { dateShortTime } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

function devicesView(items) {
  const mine = device.get('kiosk');
  return html`<section class="panel"><h2 class="section-title">${t('hr.devices')}</h2>
    <p class="help">${t('hr.devices_help')}</p>
    ${items.length ? html`<ul class="punches">${items.map((d) => html`<li class="punch">
      <span><strong>${d.name}</strong> ${mine && mine.id === d.id ? html`<span class="muted">${t('hr.this_device')}</span>` : ''}</span>
      ${d.status === 'active' ? chip(t('users.active'), 'ok') : chip(t('users.inactive'), 'muted')}
      <span class="muted">${d.last_punch_at ? t('hr.last_punch', { time: dateShortTime(d.last_punch_at) }) : t('hr.no_punch_yet')}</span>
      <button type="button" class="btn btn-small" data-act="device" data-id="${d.id}">${t('common.edit')}</button>
    </li>`)}</ul>` : emptyState(t('hr.no_devices'))}
    <div class="form-actions">
      ${mine ? html`<button type="button" class="btn" data-act="unregister">${t('hr.stop_this_device')}</button>`
        : html`<button type="button" class="btn btn-primary" data-act="register">${t('hr.make_device')}</button>`}
    </div></section>`;
}

function editDevice(d, onSaved) {
  const dialog = formDialog(d.name, formView({
    submit: t('common.save'),
    values: d,
    fields: [
      { name: 'name', label: t('users.name'), required: true },
      { name: 'status', label: t('users.status'), type: 'select', required: true, help: t('hr.device_status_help'), options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }] },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['attendance.device.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id: d.id, version: d.version }),
    onSubmit: (v) => write('attendance.device.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onSaved();
    },
  });
}

function registerDevice(onSaved) {
  const dialog = formDialog(t('hr.make_device'), formView({
    submit: t('hr.make_device'),
    values: { name: t('hr.device_default_name') },
    fields: [{ name: 'name', label: t('hr.device_name'), required: true, help: t('hr.device_name_help') }],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['attendance.device.register'].schema,
    busyLabel: t('common.saving'),
    onSubmit: (v) => write('attendance.device.register', v),
    onSaved: (reply) => {
      device.set('kiosk', { id: reply.data.device_id, name: reply.data.name, secret: reply.data.secret });
      dialog.close();
      toast(t('hr.device_ready'));
      onSaved();
    },
  });
}

export const settingsAttendancePage = {
  path: '/settings/attendance',
  title: 'hr.devices',
  perm: 'attendance.manage',
  mount(el) {
    let devices = [];
    async function load() {
      try {
        devices = (await read('attendance.devices')).data.items;
        render(el, devicesView(devices));
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      device: (e, btn) => editDevice(devices.find((d) => d.id === btn.dataset.id), load),
      register: () => registerDevice(load),
      unregister: async () => {
        const ok = await confirmDialog({ title: t('hr.stop_this_device'), body: t('hr.stop_this_device_body'), ok: t('hr.stop_this_device'), tone: 'danger' });
        if (!ok) return;
        device.remove('kiosk');
        toast(t('hr.device_stopped'));
        load();
      },
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return offClick;
  },
};
