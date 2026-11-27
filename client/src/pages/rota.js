// The rota: a week at a time. Managers see everyone and set any day; staff
// see their own week and ask to choose a shift, swap a day with a
// colleague, or move their day off. Requests waiting on this person (to
// agree to, or to decide) are listed above the week. Managers keep the
// list of shifts here too.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox, staleNotice } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { onArea } from '../core/live.js';
import { dateShort, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { planText } from './attendance-common.js';

const REQUEST_STATUS = { partner: ['rota.status.partner', 'warn'], waiting: ['rota.status.waiting', 'warn'], approved: ['rota.status.approved', 'ok'], declined: ['rota.status.declined', 'danger'], withdrawn: ['rota.status.withdrawn', 'muted'] };
const ASK = {
  shift: { title: 'rota.ask.shift', hint: 'rota.ask.shift_hint' },
  swap: { title: 'rota.ask.swap', hint: 'rota.ask.swap_hint' },
  dayoff: { title: 'rota.ask.dayoff', hint: 'rota.ask.dayoff_hint' },
};
const KIND_TONE = { work: '', off: 'muted', leave: 'muted', holiday: 'muted' };
const shortDate = (date) => dateShort(`${date}T06:00:00Z`);
const shiftLabel = (s) => `${s.name} ${t('hr.hours', { start: s.start, end: s.end })}`;

function requestText(r) {
  if (r.kind === 'shift') return t('rota.req.shift', { name: r.staff_name, date: shortDate(r.date), shift: r.shift });
  if (r.kind === 'swap') return t('rota.req.swap', { name: r.staff_name, partner: r.partner_name, date: shortDate(r.date) });
  return t('rota.req.dayoff', { name: r.staff_name, from: shortDate(r.date), to: shortDate(r.other_date) });
}

function requestsView(week) {
  if (!week.requests.length) return '';
  const mine = (r) => r.staff_id === week.me;
  return html`<section class="panel"><h2 class="section-title">${t('rota.requests')}</h2>
    <ul class="waiting-list">${week.requests.map((r) => html`<li class="check-item">
      <span><strong>${requestText(r)}</strong> ${chip(t(REQUEST_STATUS[r.status][0]), REQUEST_STATUS[r.status][1])}</span>
      ${r.reason ? html`<span>“${r.reason}”</span>` : ''}
      ${r.decide_note ? html`<span class="muted">${t('hr.note', { note: r.decide_note })}</span>` : ''}
      <span class="check-actions">
        ${r.status === 'partner' && r.partner_id === week.me ? html`
          <button type="button" class="btn btn-small btn-primary" data-act="answer" data-id="${r.id}" data-answer="accept">${t('rota.agree')}</button>
          <button type="button" class="btn btn-small" data-act="answer" data-id="${r.id}" data-answer="decline">${t('rota.disagree')}</button>` : ''}
        ${r.status === 'waiting' && !mine(r) && r.partner_id !== week.me && can('schedule.manage') ? html`
          <button type="button" class="btn btn-small btn-primary" data-act="decide" data-id="${r.id}" data-decision="accept">${t('hr.accept')}</button>
          <button type="button" class="btn btn-small" data-act="decide" data-id="${r.id}" data-decision="reject">${t('hr.reject')}</button>` : ''}
        ${mine(r) && (r.status === 'partner' || r.status === 'waiting') ? html`
          <button type="button" class="btn btn-small" data-act="withdraw" data-id="${r.id}">${t('hr.withdraw')}</button>` : ''}
      </span></li>`)}</ul></section>`;
}

function weekView(week) {
  const holiday = new Map(week.holidays.map((h) => [h.date, h.name]));
  const editable = (row) => can('schedule.manage') || row.staff.id === week.me;
  return html`<section class="panel">
    ${week.rows.length ? html`<div class="list-body"><table class="table rota">
      <thead><tr><th scope="col">${t('users.name')}</th>${week.dates.map((d) => html`<th scope="col">${shortDate(d)}${holiday.has(d) ? html`<br><span class="muted">${holiday.get(d)}</span>` : ''}</th>`)}</tr></thead>
      <tbody>${week.rows.map((row) => html`<tr>
        <td data-label="${t('users.name')}"><span><strong>${row.staff.name}</strong></span></td>
        ${row.days.map((d) => html`<td data-label="${shortDate(d.date)}" class="rota-cell ${KIND_TONE[d.kind]}"><span>
          ${editable(row) ? html`<button type="button" class="rota-day" data-act="day" data-staff="${row.staff.id}" data-date="${d.date}">${planText(d)}</button>` : planText(d)}
        </span></td>`)}
      </tr>`)}</tbody></table></div>` : emptyState(t('hr.no_staff_yet'))}
  </section>`;
}

function shiftsView(shifts) {
  return html`<section class="panel"><h2 class="section-title">${t('rota.shifts')}</h2>
    <p class="help">${t('rota.shifts_help')}</p>
    ${shifts.length ? html`<ul class="punches">${shifts.map((s) => html`<li class="punch">
      <span><strong>${shiftLabel(s)}</strong></span>
      <button type="button" class="btn btn-small" data-act="shift" data-id="${s.id}">${t('common.edit')}</button></li>`)}</ul>` : emptyState(t('rota.no_shifts'))}
    <div class="form-actions"><button type="button" class="btn" data-act="shift">${t('rota.add_shift')}</button></div></section>`;
}

function saveWith(dialog, action, { schema, mapValues, done }) {
  bindForm(dialog.querySelector('form.form'), {
    schema,
    busyLabel: t('common.saving'),
    mapValues,
    onSubmit: (v) => write(action, v),
    onSaved: (reply) => {
      dialog.close();
      done(reply);
    },
  });
}

// A manager sets a day: usual hours, a day off, or a shift.
function setDay(week, staffId, date, onDone) {
  const row = week.rows.find((r) => r.staff.id === staffId);
  const day = row.days.find((d) => d.date === date);
  const current = day.set ? (day.kind === 'off' ? 'off' : (week.shifts.find((s) => s.name === day.shift) || {}).id || 'usual') : 'usual';
  const dialog = formDialog(t('rota.set_title', { name: row.staff.name, date: shortDate(date) }), formView({
    submit: t('common.save'),
    values: { value: current },
    fields: [{
      name: 'value', label: t('rota.day'), type: 'select', required: true,
      options: [
        { value: 'usual', label: t('rota.usual', { hours: row.staff.work_start ? t('hr.hours', { start: row.staff.work_start, end: row.staff.work_end }) : t('hr.no_hours') }) },
        { value: 'off', label: t('hr.state.off') },
        ...week.shifts.map((s) => ({ value: s.id, label: shiftLabel(s) })),
      ],
    }],
  }));
  saveWith(dialog, 'rota.set', {
    schema: ACTIONS['rota.set'].schema,
    mapValues: (v) => ({ ...v, staff_id: staffId, date }),
    done: () => {
      toast(t('setup.saved'));
      onDone();
    },
  });
}

const minDate = (n) => new Date(Date.parse(`${today()}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// The person asks: a shift for a coming day, a swap, or moving a day off.
function askChange(week, kind, date, onDone) {
  const fields = [{ name: 'date', label: t(kind === 'dayoff' ? 'rota.dayoff_from' : 'money.field.date'), type: 'date', required: true }];
  if (kind === 'shift') fields.push({ name: 'shift_id', label: t('rota.shift'), type: 'select', required: true, placeholder: t('money.choose'), options: week.shifts.map((s) => ({ value: s.id, label: shiftLabel(s) })), help: t('rota.shift_help', { days: week.rules.advance_days }) });
  if (kind === 'swap') fields.push({ name: 'partner_id', label: t('rota.partner'), type: 'select', required: true, placeholder: t('money.choose'), options: week.colleagues.map((c) => ({ value: c.id, label: c.name })), help: t('rota.swap_help') });
  if (kind === 'dayoff') fields.push({ name: 'other_date', label: t('rota.dayoff_to'), type: 'date', required: true, help: t('rota.dayoff_help', { days: week.rules.min_notice_days }) });
  fields.push({ name: 'reason', label: t('hr.fix_reason'), type: 'textarea' });
  const dialog = formDialog(t(ASK[kind].title), formView({ submit: t('hr.send_fix'), values: { date: date || minDate(1) }, fields }));
  saveWith(dialog, 'rota.request', {
    schema: ACTIONS['rota.request'].schema,
    mapValues: (v) => ({ kind, reason: v.reason, date: v.date, shift_id: v.shift_id || null, partner_id: v.partner_id || null, other_date: v.other_date || null }),
    done: (reply) => {
      toast(t('rota.sent'));
      onDone();
    },
  });
}

function pickChange(week, date, onDone) {
  const kinds = ['dayoff', 'swap'];
  if (week.rules.self_select && week.shifts.length) kinds.unshift('shift');
  const dialog = formDialog(t('rota.ask_title'), html`<div class="kind-grid">${kinds.map((k) => html`
    <button type="button" class="btn kind-btn" data-kind="${k}"><strong>${t(ASK[k].title)}</strong><span class="muted">${t(ASK[k].hint)}</span></button>`)}</div>`);
  dialog.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-kind]');
    if (!btn) return;
    dialog.close();
    askChange(week, btn.dataset.kind, date, onDone);
  });
}

function editShift(shift, onDone) {
  const dialog = formDialog(shift ? shift.name : t('rota.add_shift'), formView({
    submit: t('common.save'),
    values: shift || { status: 'active' },
    fields: [
      { name: 'name', label: t('users.name'), required: true },
      { name: 'name_bn', label: t('cafe.name_bn') },
      { name: 'start', label: t('hr.work_start'), type: 'time', required: true },
      { name: 'end', label: t('hr.work_end'), type: 'time', required: true },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }] },
    ],
  }));
  saveWith(dialog, 'rota.shift.save', {
    schema: ACTIONS['rota.shift.save'].schema,
    mapValues: (v) => ({ ...v, id: shift ? shift.id : null, version: shift ? shift.version : null }),
    done: () => {
      toast(t('setup.saved'));
      onDone();
    },
  });
}

function rejectWithNote(action, id, onDone) {
  const dialog = formDialog(t('hr.reject'), formView({
    submit: t('hr.reject'),
    fields: [{ name: 'note', label: t('hr.reject_note'), type: 'textarea', required: true }],
  }));
  saveWith(dialog, action, {
    schema: { note: { ...ACTIONS[action].schema.note, required: true } },
    mapValues: (v) => ({ id, decision: 'reject', note: v.note }),
    done: () => {
      toast(t('hr.rejected'));
      onDone();
    },
  });
}

// Shared with the leave page: accept at once, or ask for a note first.
export async function decideRequest(action, btn, onDone) {
  if (btn.dataset.decision === 'reject') {
    rejectWithNote(action, btn.dataset.id, onDone);
    return;
  }
  const reply = await write(action, { id: btn.dataset.id, decision: 'accept' });
  if (reply.status === 'saved') {
    toast(t('hr.accepted'));
    onDone();
  } else if (reply.status === 'rejected') toast(t(errorMessageId(reply.error.code), reply.error.params), 'error');
}

const startOfWeek = (date) => {
  // Weeks start on Saturday in Bangladesh.
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 1) % 7) * 86400000).toISOString().slice(0, 10);
};

export const rotaPage = {
  path: '/rota',
  title: 'nav.rota',
  perm: 'schedule.view|self.staff',
  mount(el, { query }) {
    let from = startOfWeek(query.from || today());
    let week = null;
    async function load() {
      try {
        const reply = await read('rota.week', { from });
        week = reply.data;
        render(el, html`${staleNotice(reply.cachedAt)}
          ${requestsView(week)}
          <div class="list-bar">
            <button type="button" class="btn" data-act="move" data-by="-7">${t('rota.previous')}</button>
            <button type="button" class="btn" data-act="move" data-by="0">${t('rota.this_week')}</button>
            <button type="button" class="btn" data-act="move" data-by="7">${t('rota.next')}</button>
            ${week.me ? html`<button type="button" class="btn btn-primary" data-act="ask">${t('rota.ask_title')}</button>` : ''}
          </div>
          ${weekView(week)}
          ${can('schedule.manage') ? shiftsView(week.shifts) : ''}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      move: (e, btn) => {
        const by = Number(btn.dataset.by);
        from = by ? new Date(Date.parse(`${from}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10) : startOfWeek(today());
        load();
      },
      day: (e, btn) => {
        if (can('schedule.manage')) setDay(week, btn.dataset.staff, btn.dataset.date, load);
        else pickChange(week, btn.dataset.date, load);
      },
      ask: () => pickChange(week, null, load),
      shift: (e, btn) => editShift(btn.dataset.id ? week.shifts.find((s) => s.id === btn.dataset.id) : null, load),
      answer: async (e, btn) => {
        const reply = await write('rota.answer', { id: btn.dataset.id, answer: btn.dataset.answer });
        if (reply.status === 'saved') {
          toast(t(btn.dataset.answer === 'accept' ? 'rota.agreed' : 'rota.disagreed'));
          load();
        }
      },
      decide: (e, btn) => decideRequest('rota.decide', btn, load),
      withdraw: async (e, btn) => {
        const reply = await write('rota.withdraw', { id: btn.dataset.id });
        if (reply.status === 'saved') load();
      },
    });
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
    };
  },
};
