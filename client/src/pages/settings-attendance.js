// Settings → Attendance: the shop's position and how far from it a phone
// may punch, grace minutes, punches kept on a phone; and the shop's punch
// devices (making this device one, renaming, stopping one).

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { confirmDialog, formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can, device } from '../core/state.js';
import { currentPlace } from '../core/place.js';
import { dateShortTime } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

const NUMBERS = ['radius_m', 'max_accuracy_m', 'late_grace', 'early_grace', 'incomplete_after', 'duplicate_window_sec', 'clock_skew_flag_min', 'offline_max_age_days'];

function settingsForm(data) {
  const values = { ...data };
  for (const k of [...NUMBERS, 'lat', 'lng']) values[k] = data[k] === null ? '' : String(data[k]);
  const num = (name, label, help) => ({ name, label: t(label), inputmode: 'numeric', required: true, help: help ? t(help) : '' });
  return formView({
    submit: t('common.save'),
    values,
    fields: [
      { name: 'lat', label: t('hr.shop_lat'), inputmode: 'decimal', help: t('hr.shop_place_help') },
      { name: 'lng', label: t('hr.shop_lng'), inputmode: 'decimal' },
      num('radius_m', 'hr.radius', 'hr.radius_help'),
      num('max_accuracy_m', 'hr.max_accuracy', 'hr.max_accuracy_help'),
      { name: 'exception', label: t('hr.exception'), type: 'select', required: true, options: [{ value: 'check', label: t('hr.exception.check') }, { value: 'block', label: t('hr.exception.block') }] },
      num('late_grace', 'hr.late_grace'),
      num('early_grace', 'hr.early_grace'),
      num('incomplete_after', 'hr.incomplete_after', 'hr.incomplete_after_help'),
      num('duplicate_window_sec', 'hr.duplicate_window', 'hr.duplicate_window_help'),
      num('clock_skew_flag_min', 'hr.clock_skew', 'hr.clock_skew_help'),
      num('offline_max_age_days', 'hr.offline_max_age', 'hr.offline_max_age_help'),
      { name: 'offline_auto_validate', label: t('hr.offline_auto'), type: 'checkbox', help: t('hr.offline_auto_help') },
      { name: 'shop_open', label: t('hr.shop_open'), type: 'time', required: true, help: t('hr.shop_hours_help') },
      { name: 'shop_close', label: t('hr.shop_close'), type: 'time', required: true },
      { name: 'device_enabled', label: t('hr.device_enabled'), type: 'checkbox', help: t('hr.device_enabled_help') },
    ],
    extra: html`<p><button type="button" class="btn" data-act="here">${t('hr.use_here')}</button></p>`,
  });
}

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
  title: 'nav.settings_attendance',
  perm: 'settings.manage',
  mount(el) {
    let devices = [];
    async function load() {
      try {
        const [settings, list] = await Promise.all([
          read('settings.attendance').then((r) => r.data),
          can('attendance.manage') ? read('attendance.devices').then((r) => r.data.items) : [],
        ]);
        devices = list;
        render(el, html`<section class="panel">${settingsForm(settings)}</section>
          ${can('attendance.manage') && settings.device_enabled ? devicesView(devices) : ''}`);
        bindForm(el.querySelector('form.form'), {
          schema: ACTIONS['settings.attendance.save'].schema,
          busyLabel: t('common.saving'),
          mapValues: (v) => ({ ...v, lat: v.lat === '' ? null : v.lat, lng: v.lng === '' ? null : v.lng }),
          onSubmit: (v) => write('settings.attendance.save', v),
          onSaved: () => {
            toast(t('setup.saved'));
            load();
          },
        });
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      here: (e, btn) => whileBusy(btn, t('hr.finding_place'), async () => {
        const place = await currentPlace();
        if (!place) {
          toast(t('hr.no_place'), 'error');
          return;
        }
        const form = el.querySelector('form.form');
        form.elements.lat.value = place.lat.toFixed(6);
        form.elements.lng.value = place.lng.toFixed(6);
        form.dispatchEvent(new Event('input'));
        toast(t('hr.place_filled', { accuracy: place.accuracy }));
      }),
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
