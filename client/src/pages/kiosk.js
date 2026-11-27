// The shop's punch device. Nobody is signed in: each person taps their
// name, types their PIN, and the device signs the punch with its own secret
// and a key made from the PIN, so the server knows who punched and on which
// device. Punches made without a connection are kept on the device (for the
// device, not for a person) and sent when it is back. The staff list is
// kept on the device so punching works offline too.

import { html, on, render } from '../ui/html.js';
import { emptyState } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { ApiError, queueItems, read, removeItem, sendQueue, write } from '../core/api.js';
import { device, getState, subscribe } from '../core/state.js';
import { pinKey, signHex } from '../core/sign.js';
import { timeOf } from '../core/format.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { punchText } from '../../../shared/hr/attendance.js';
import { TYPE } from './attendance-common.js';

const REFRESH_MS = 5 * 60000;
const SEND_MS = 60000;
const CLOCK_MS = 15000;

async function loadStaff(kiosk) {
  const ts = new Date().toISOString();
  const sig = await signHex(`${kiosk.id}|${ts}`, kiosk.secret);
  const { data } = await read('attendance.device.staff', { device_id: kiosk.id, ts, sig });
  device.set('kiosk.staff', data.staff);
  return data.staff;
}

function pinDialog(person, onPunch) {
  const other = person.next === 'in' ? 'out' : 'in';
  const dialog = formDialog(person.name, html`<form class="form kiosk-pin" novalidate>
    <div class="field"><label for="f-pin">${t('hr.pin')}</label>
      <input id="f-pin" name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="6" required autofocus></div>
    <div class="form-error" role="alert"></div>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary btn-large" value="${person.next}">${t(person.next === 'in' ? 'hr.punch_in' : 'hr.punch_out')}</button>
      <button type="submit" class="btn" value="${other}">${t(other === 'in' ? 'hr.punch_in' : 'hr.punch_out')}</button>
    </div></form>`);
  const form = dialog.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = form.elements.pin.value.trim();
    if (!/^\d{4,6}$/.test(pin)) {
      form.querySelector('.form-error').textContent = t('val.pin');
      return;
    }
    for (const b of form.querySelectorAll('button')) b.disabled = true;
    const ok = await onPunch(person, e.submitter ? e.submitter.value : person.next, pin);
    if (ok) dialog.close();
    else {
      for (const b of form.querySelectorAll('button')) b.disabled = false;
      form.elements.pin.value = '';
      form.elements.pin.focus();
    }
  });
}

// root: the whole screen. onSignIn: a manager wants to sign in on this device.
export function mountKiosk(root, { onSignIn }) {
  const kiosk = device.get('kiosk');
  let staff = device.get('kiosk.staff') || [];
  let queued = 0;
  let failed = [];
  const owner = `device:${kiosk.id}`;

  function draw() {
    const now = new Date().toISOString();
    render(root, html`<div class="kiosk">
      <header class="kiosk-head">
        <img class="kiosk-logo" src="assets/biblion-logo.png" alt="Biblion">
        <div><strong class="kiosk-time">${timeOf(now)}</strong><br><span class="muted">${kiosk.name}</span></div>
        <span class="conn ${getState().online ? 'is-online' : 'is-offline'}"><span class="conn-dot" aria-hidden="true"></span>
          <span class="conn-label">${t(getState().online ? 'shell.online' : 'shell.offline')}</span>
          ${queued ? html`<span class="badge">${t('shell.queued', { count: queued })}</span>` : ''}</span>
      </header>
      <h1 class="kiosk-title">${t('hr.kiosk_title')}</h1>
      ${staff.length ? html`<ul class="kiosk-grid">${staff.map((p) => html`<li>
        <button type="button" class="kiosk-person" data-act="person" data-id="${p.id}">
          <span class="kiosk-name">${p.name}</span>
          <span class="kiosk-next">${t(p.next === 'in' ? 'hr.punch_in' : 'hr.punch_out')}</span>
        </button></li>`)}</ul>` : emptyState(t('hr.kiosk_empty'))}
      ${failed.length ? html`<section class="panel"><h2 class="section-title">${t('hr.kiosk_failed', { count: failed.length })}</h2>
        <ul class="punches">${failed.map((i) => html`<li class="punch"><span><strong>${i.label}</strong> <span class="muted">${timeOf(i.payload.device_ts)}</span></span>
          <span class="muted">${t(errorMessageId(i.last_error.code), i.last_error.params || {})}</span>
          <button type="button" class="btn btn-small" data-act="drop" data-id="${i.op_id}">${t('saved.remove')}</button></li>`)}</ul></section>` : ''}
      <p class="kiosk-foot"><button type="button" class="btn btn-small" data-act="signin">${t('hr.kiosk_sign_in')}</button></p>
    </div>`);
  }

  // Punches that could not be sent (a wrong PIN typed offline, say) are
  // listed so a manager can see them and remove them.
  async function countQueued() {
    const items = await queueItems(owner);
    failed = items.filter((i) => i.status === 'failed');
    queued = items.length - failed.length;
  }

  async function refresh() {
    try {
      staff = await loadStaff(kiosk);
    } catch (err) {
      // A device that was stopped in Settings goes back to the sign-in screen.
      if (err instanceof ApiError && err.code === 'DEVICE') {
        device.remove('kiosk');
        device.remove('kiosk.staff');
        stop();
        toast(t('err.device'), 'error');
        onSignIn();
        return;
      }
    }
    await countQueued();
    draw();
  }

  async function send() {
    if (!getState().online) return;
    await sendQueue(owner);
    await countQueued();
    draw();
  }

  // Signs and sends one punch. Resolves true when it is done (or kept on
  // the device), false when the person should try again.
  async function punch(person, type, pin) {
    const key = await pinKey(pin, person.pin_salt, person.pin_iter);
    const p = { punch_id: crypto.randomUUID(), staff_id: person.id, type, device_ts: new Date().toISOString(), lat: null, lng: null, accuracy: null, device_id: kiosk.id };
    const sig = await signHex(punchText(p), `${kiosk.secret}${key}`);
    const reply = await write('attendance.device.punch', { ...p, sig }, { opId: p.punch_id, owner, label: `${person.name} · ${t(TYPE[type])}` });
    if (reply.status === 'rejected') {
      toast(t(errorMessageId(reply.error.code), reply.error.params), 'error');
      return reply.error.code !== 'PIN_WRONG';
    }
    person.next = type === 'in' ? 'out' : 'in';
    device.set('kiosk.staff', staff);
    if (reply.status === 'queued') toast(t('hr.kiosk_queued', { name: person.name, type: t(TYPE[type]) }));
    else if (reply.data.duplicate) toast(t('hr.punch_twice', { type: t(TYPE[reply.data.type]), time: timeOf(reply.data.at) }));
    else toast(t('hr.kiosk_done', { name: person.name, type: t(TYPE[type]), time: timeOf(reply.data.at) }));
    await countQueued();
    draw();
    return true;
  }

  const offClick = on(root, 'click', {
    person: (e, btn) => pinDialog(staff.find((p) => p.id === btn.dataset.id), punch),
    drop: async (e, btn) => {
      await removeItem(btn.dataset.id);
      await countQueued();
      draw();
    },
    signin: () => {
      stop();
      onSignIn();
    },
  });
  const unsubscribe = subscribe(draw);
  const onOnline = () => send().then(refresh);
  window.addEventListener('online', onOnline);
  const timers = [setInterval(refresh, REFRESH_MS), setInterval(send, SEND_MS), setInterval(draw, CLOCK_MS)];
  function stop() {
    offClick();
    unsubscribe();
    window.removeEventListener('online', onOnline);
    for (const id of timers) clearInterval(id);
  }
  draw();
  send().then(refresh);
}
