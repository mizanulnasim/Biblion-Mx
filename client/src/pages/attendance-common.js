// Attendance pieces used on Home, My attendance and the attendance board:
// the punch card and its button, a day's line, a month, and the correction
// form.

import { html } from '../ui/html.js';
import { chip, emptyState } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { write } from '../core/api.js';
import { currentPlace } from '../core/place.js';
import { dateShort, duration, timeOf, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';

const STATE = {
  off: ['hr.state.off', 'muted'],
  not_in: ['hr.state.not_in', 'muted'],
  absent: ['hr.state.absent', 'danger'],
  in: ['hr.state.in', 'ok'],
  break: ['hr.state.break', 'warn'],
  out: ['hr.state.out', 'ok'],
  incomplete: ['hr.state.incomplete', 'warn'],
  leave: ['hr.state.leave', 'muted'],
  holiday: ['hr.state.holiday', 'muted'],
};
const PUNCH_STATUS = { ok: '', check: ['hr.punch.check', 'warn'], rejected: ['hr.punch.rejected', 'danger'], replaced: ['hr.punch.replaced', 'muted'] };
const FIX_STATUS = { waiting: ['hr.fix.waiting', 'warn'], approved: ['hr.fix.approved', 'ok'], declined: ['hr.fix.declined', 'danger'], withdrawn: ['hr.fix.withdrawn', 'muted'] };
const FLAG = { outside: 'hr.flag.outside', no_location: 'hr.flag.no_location', offline: 'hr.flag.offline', skew: 'hr.flag.skew', hours: 'hr.flag.hours', break_out: 'hr.flag.break_out' };
const SOURCE = { phone: 'hr.source.phone', device: 'hr.source.device', fix: 'hr.source.fix' };
export const TYPE = { in: 'hr.type.in', break: 'hr.type.break', back: 'hr.type.back', out: 'hr.type.out' };
// The button for each kind of punch.
export const PUNCH_BUTTON = { in: 'hr.punch_in', break: 'hr.punch_break', back: 'hr.punch_back', out: 'hr.punch_out' };

export function stateChip(state) {
  return chip(t(STATE[state][0]), STATE[state][1]);
}

export function hoursText(staff) {
  return staff.work_start ? t('hr.hours', { start: staff.work_start, end: staff.work_end }) : t('hr.no_hours');
}

export function flagsText(flags) {
  return flags.map((f) => t(FLAG[f])).join(' · ');
}

function punchLine(p) {
  const status = PUNCH_STATUS[p.status];
  return html`<li class="punch">
    <span><strong>${t(TYPE[p.type])} ${timeOf(p.at)}</strong> <span class="muted">${t(SOURCE[p.source])}</span></span>
    ${status ? chip(t(status[0]), status[1]) : ''}
    ${p.flags.length ? html`<span class="muted">${flagsText(p.flags)}</span>` : ''}
    ${p.reason ? html`<span class="muted">“${p.reason}”</span>` : ''}
    ${p.decide_note ? html`<span class="muted">${t('hr.note', { note: p.decide_note })}</span>` : ''}
  </li>`;
}

// The numbers of a day: in, out, worked, late, early.
// What a day was meant to be, in a few words: "Morning 07:00–13:00",
// "10:00–18:00", "Day off", "On leave", "Victory Day".
export function planText(plan) {
  let named = plan.holiday ? ` · ${plan.holiday}` : '';
  if (plan.kind === 'leave') return t(plan.leave_kind === 'unpaid' ? 'hr.plan.unpaid' : 'hr.plan.leave') + named;
  if (plan.half_leave) named = ` · ${t(plan.half_leave === 'first' ? 'hr.plan.half_first' : 'hr.plan.half_second')}${named}`;
  if (plan.kind === 'holiday') return plan.holiday;
  if (plan.kind === 'off') return t('hr.state.off') + named;
  if (!plan.start) return t('hr.no_hours') + named;
  const hours = t('hr.hours', { start: plan.start, end: plan.end });
  return (plan.shift ? `${plan.shift} ${hours}` : hours) + named;
}

export function dayFacts(d) {
  const facts = [];
  if (d.first_in) facts.push(t('hr.in_at', { time: timeOf(d.first_in) }));
  if (d.last_out) facts.push(t('hr.out_at', { time: timeOf(d.last_out) }));
  if (d.worked_min) facts.push(t('hr.worked', { time: duration(d.worked_min) }));
  if (d.break_min) facts.push(t('hr.on_breaks', { time: duration(d.break_min) }));
  if (d.late_min) facts.push(t('hr.late', { time: duration(d.late_min) }));
  if (d.early_min) facts.push(t('hr.early', { time: duration(d.early_min) }));
  if (d.short_min) facts.push(t('hr.short', { time: duration(d.short_min) }));
  if (d.overtime_min) facts.push(t('hr.overtime', { time: duration(d.overtime_min) }));
  return facts.join(' · ');
}

// One month of days (newest first) with the totals; `fixButton` adds
// "Ask for a correction" (or "Add a punch") to each day.
export function monthView(data, { fixLabel = '' } = {}) {
  const { totals } = data;
  return html`
    <p class="month-totals">${t('hr.totals', { worked: duration(totals.worked_min), late: totals.late_days, absent: totals.absent_days, incomplete: totals.incomplete_days, leave: totals.leave_days })}</p>
    ${totals.short_min || totals.overtime_min ? html`<p class="muted">${t('hr.totals_hours', { short: duration(totals.short_min), overtime: duration(totals.overtime_min) })}</p>` : ''}
    ${data.days.length ? html`<ul class="att-days">${data.days.map((d) => html`<li class="att-day">
      <div class="day-head">
        <strong>${dateShort(`${d.date}T06:00:00Z`)}</strong> ${stateChip(d.state)}
        ${d.waiting ? chip(t('hr.punch.check'), 'warn') : ''}
        <span class="muted">${dayFacts(d) || planText(d.plan)}</span>
        ${fixLabel ? html`<button type="button" class="btn btn-small" data-act="fix" data-date="${d.date}">${fixLabel}</button>` : ''}
      </div>
      ${d.punches.length ? html`<ul class="punches">${d.punches.map(punchLine)}</ul>` : ''}
    </li>`)}</ul>` : emptyState(t('hr.no_days'))}`;
}

// Newest first.
export function fixesView(fixes, { canWithdraw }) {
  if (!fixes.length) return '';
  const sorted = fixes.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return html`<section class="panel"><h2 class="section-title">${t('hr.fixes')}</h2>
    <ul class="punches">${sorted.map((f) => html`<li class="punch">
      <span><strong>${dateShort(`${f.date}T06:00:00Z`)} · ${t(TYPE[f.type])} ${f.time}</strong></span>
      ${chip(t(FIX_STATUS[f.status][0]), FIX_STATUS[f.status][1])}
      <span class="muted">“${f.reason}”</span>
      ${f.decide_note ? html`<span class="muted">${t('hr.note', { note: f.decide_note })}</span>` : ''}
      ${canWithdraw && f.status === 'waiting' ? html`<button type="button" class="btn btn-small" data-act="withdraw" data-id="${f.id}">${t('hr.withdraw')}</button>` : ''}
    </li>`)}</ul></section>`;
}

// Asks for a correction on `date` (or, with staffId, adds one for someone).
// day: that date's line, so a wrong punch can be picked to replace.
export function openFix({ date, day, staffId = null, onSaved }) {
  const counted = (day ? day.punches : []).filter((p) => p.status === 'ok' || p.status === 'check');
  const dialog = formDialog(t(staffId ? 'hr.add_punch' : 'hr.ask_fix'), formView({
    submit: t(staffId ? 'hr.add_punch' : 'hr.send_fix'),
    values: { date, type: 'in' },
    fields: [
      { name: 'date', label: t('money.field.date'), type: 'date', required: true },
      { name: 'type', label: t('hr.punch_type'), type: 'select', required: true, options: Object.keys(TYPE).map((k) => ({ value: k, label: t(TYPE[k]) })) },
      { name: 'time', label: t('hr.time'), type: 'time', required: true },
      ...(counted.length ? [{ name: 'replaces', label: t('hr.replaces'), type: 'select', placeholder: t('hr.replaces_none'), help: t('hr.replaces_help'), options: counted.map((p) => ({ value: p.id, label: `${t(TYPE[p.type])} ${timeOf(p.at)}` })) }] : []),
      { name: 'reason', label: t('hr.fix_reason'), type: 'textarea', required: true },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['attendance.fix'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, staff_id: staffId, replaces: v.replaces || null }),
    onSubmit: (v) => write('attendance.fix', v),
    onSaved: (reply) => {
      dialog.close();
      toast(t(reply.data && reply.data.final ? 'hr.fix_done' : 'hr.fix_sent'));
      onSaved();
    },
  });
}

function punchMessage(reply, type) {
  if (reply.status === 'queued') return t('hr.punch_queued');
  const time = timeOf(reply.data.at);
  if (reply.data.duplicate) return t('hr.punch_twice', { type: t(TYPE[reply.data.type]), time });
  return t(reply.data.status === 'check' ? 'hr.punch_check' : 'hr.punch_done', { type: t(TYPE[type]), time });
}

// A punch from this phone. When the server asks why the person is away
// from the shop, it asks, then sends the same punch with the reason.
async function sendPunch(payload, onDone) {
  const reply = await write('attendance.punch', payload, { label: t(PUNCH_BUTTON[payload.type]) });
  if (reply.status === 'rejected' && reply.error.fields && reply.error.fields.reason) {
    const why = reply.error.fields.reason;
    const dialog = formDialog(t('hr.why_away'), formView({
      submit: t('hr.send_for_check'),
      extra: html`<p class="notice notice-warn">${t(why.code, why.params)}</p>`,
      fields: [{ name: 'reason', label: t('hr.away_reason'), type: 'textarea', required: true }],
    }));
    bindForm(dialog.querySelector('form.form'), {
      schema: { reason: ACTIONS['attendance.punch'].schema.reason },
      busyLabel: t('common.saving'),
      onSubmit: (v) => write('attendance.punch', { ...payload, reason: v.reason }),
      onSaved: (again) => {
        dialog.close();
        toast(punchMessage(again, payload.type));
        onDone();
      },
    });
    return;
  }
  if (reply.status === 'rejected') {
    toast(t(errorMessageId(reply.error.code), reply.error.params), 'error');
    return;
  }
  toast(punchMessage(reply, payload.type));
  onDone();
}

// The card on Home and My attendance. today: what attendance.today returned.
export function punchCard(todayData) {
  const { day, next } = todayData;
  return html`<section class="panel punch-card">
    <div class="punch-state">
      ${stateChip(day.state)}
      <span class="muted">${dayFacts(day) || planText(day.plan)}</span>
    </div>
    <div class="form-actions">${next.map((type, i) => html`<button type="button" class="btn ${i ? '' : 'btn-primary btn-large'}" data-act="punch" data-type="${type}">
      ${t(PUNCH_BUTTON[type])}</button>`)}</div>
  </section>`;
}

// Runs a punch from the card's button: finds the phone's position, then sends.
export function startPunch(button, onDone) {
  const type = button.dataset.type;
  const deviceTs = new Date().toISOString();
  return whileBusy(button, t('hr.finding_place'), async () => {
    try {
      const place = await currentPlace();
      await sendPunch({ type, device_ts: deviceTs, lat: place ? place.lat : null, lng: place ? place.lng : null, accuracy: place ? place.accuracy : null }, onDone);
    } catch (err) {
      toast(errorText(err), 'error');
    }
  });
}

export const thisMonth = () => today().slice(0, 7);
