// The attendance board: everyone's day, the checks and corrections waiting
// for this person, and one person's month.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { onArea } from '../core/live.js';
import { dateShort, timeOf, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { TYPE, dayFacts, fixesView, flagsText, hoursText, monthView, openFix, stateChip, thisMonth } from './attendance-common.js';

function boardView(board) {
  const counts = {};
  for (const r of board.rows) counts[r.state] = (counts[r.state] || 0) + 1;
  return html`<section class="panel">
    <p class="month-totals">${t('hr.board_counts', { in: (counts.in || 0) + (counts.out || 0), absent: counts.absent || 0, incomplete: counts.incomplete || 0 })}</p>
    ${board.rows.length ? html`<div class="list-body"><table class="table">
      <thead><tr><th scope="col">${t('users.name')}</th><th scope="col">${t('users.status')}</th><th scope="col">${t('hr.day')}</th><th scope="col">${t('hr.hours_label')}</th></tr></thead>
      <tbody>${board.rows.map((r) => html`<tr data-act="person" data-id="${r.staff.id}" tabindex="0">
        <td data-label="${t('users.name')}"><span><strong>${r.staff.name}</strong></span></td>
        <td data-label="${t('users.status')}" class="nowrap"><span>${stateChip(r.state)} ${r.waiting ? chip(t('hr.punch.check'), 'warn') : ''}</span></td>
        <td data-label="${t('hr.day')}"><span>${dayFacts(r) || '—'}</span></td>
        <td data-label="${t('hr.hours_label')}" class="nowrap"><span class="muted">${hoursText(r.staff)}</span></td>
      </tr>`)}</tbody></table></div>` : emptyState(t('hr.no_staff_yet'))}
  </section>`;
}

function checksView(checks) {
  if (!checks.punches.length && !checks.fixes.length) return '';
  return html`<section class="panel waiting">
    <h2 class="section-title">${t('hr.checks_waiting', { count: checks.punches.length + checks.fixes.length })}</h2>
    <ul class="waiting-list">
      ${checks.punches.map((p) => html`<li class="check-item">
        <span><strong>${p.staff_name} · ${t(TYPE[p.type])} ${timeOf(p.at)}</strong> <span class="muted">${dateShort(p.at)}</span></span>
        <span class="muted">${flagsText(p.flags)}${p.distance_m ? ` · ${t('hr.metres_away', { distance: p.distance_m })}` : ''}</span>
        ${p.reason ? html`<span>“${p.reason}”</span>` : ''}
        <span class="check-actions">
          <button type="button" class="btn btn-small btn-primary" data-act="decide" data-kind="punch" data-id="${p.id}" data-decision="accept">${t('hr.accept')}</button>
          <button type="button" class="btn btn-small" data-act="decide" data-kind="punch" data-id="${p.id}" data-decision="reject">${t('hr.reject')}</button>
        </span></li>`)}
      ${checks.fixes.map((f) => html`<li class="check-item">
        <span><strong>${f.staff_name} · ${t('hr.fix_line', { type: t(TYPE[f.type]), time: f.time })}</strong> <span class="muted">${dateShort(`${f.date}T06:00:00Z`)}</span></span>
        ${f.replaces_at ? html`<span class="muted">${t('hr.fix_replaces', { time: timeOf(f.replaces_at) })}</span>` : ''}
        <span>“${f.reason}”</span>
        <span class="check-actions">
          <button type="button" class="btn btn-small btn-primary" data-act="decide" data-kind="fix" data-id="${f.id}" data-decision="accept">${t('hr.accept')}</button>
          <button type="button" class="btn btn-small" data-act="decide" data-kind="fix" data-id="${f.id}" data-decision="reject">${t('hr.reject')}</button>
        </span></li>`)}
    </ul></section>`;
}

// Accepting is one tap; rejecting asks for a note the person will see.
async function decide(btn, onDone) {
  const payload = { kind: btn.dataset.kind, id: btn.dataset.id, decision: btn.dataset.decision };
  if (payload.decision === 'accept') {
    const reply = await write('attendance.decide', payload);
    if (reply.status === 'saved') {
      toast(t('hr.accepted'));
      onDone();
    } else toast(t(errorMessageId(reply.error.code), reply.error.params), 'error');
    return;
  }
  const dialog = formDialog(t('hr.reject'), formView({
    submit: t('hr.reject'),
    fields: [{ name: 'note', label: t('hr.reject_note'), type: 'textarea', required: true }],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: { note: { ...ACTIONS['attendance.decide'].schema.note, required: true } },
    busyLabel: t('common.saving'),
    onSubmit: (v) => write('attendance.decide', { ...payload, note: v.note }),
    onSaved: () => {
      dialog.close();
      toast(t('hr.rejected'));
      onDone();
    },
  });
}

export const attendancePage = {
  path: '/attendance',
  title: 'nav.attendance',
  perm: 'attendance.view',
  mount(el, { query }) {
    let date = query.date || today();
    async function load() {
      try {
        const [board, checks] = await Promise.all([
          read('attendance.board', { date }).then((r) => r.data),
          can('attendance.manage') ? read('attendance.checks').then((r) => r.data) : { punches: [], fixes: [] },
        ]);
        render(el, html`${checksView(checks)}
          <div class="list-bar"><label class="field-inline">${t('money.field.date')} <input type="date" data-role="date" value="${date}" max="${today()}"></label></div>
          ${boardView(board)}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      person: (e, tr) => { location.hash = `#/attendance/person?id=${tr.dataset.id}`; },
      decide: (e, btn) => decide(btn, load),
    });
    const onDate = (e) => {
      if (e.target.dataset.role !== 'date' || !e.target.value) return;
      date = e.target.value;
      load();
    };
    el.addEventListener('change', onDate);
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
      el.removeEventListener('change', onDate);
    };
  },
};

export const attendancePersonPage = {
  path: '/attendance/person',
  title: 'nav.attendance',
  perm: 'attendance.view',
  mount(el, { query }) {
    let month = query.month || thisMonth();
    let data = null;
    async function load() {
      try {
        data = (await read('attendance.staff', { staff_id: query.id, month })).data;
        render(el, html`<section class="panel">
            <h2 class="section-title">${data.staff.name}</h2>
            <p class="muted">${hoursText(data.staff)}</p>
            <div class="list-bar"><label class="field-inline">${t('hr.month')} <input type="month" data-role="month" value="${month}" max="${thisMonth()}"></label></div>
            ${monthView(data, { fixLabel: can('attendance.manage') ? t('hr.add_punch') : '' })}
          </section>
          ${fixesView(data.fixes, { canWithdraw: false })}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      fix: (e, btn) => openFix({ date: btn.dataset.date, day: data.days.find((d) => d.date === btn.dataset.date), staffId: data.staff.id, onSaved: load }),
    });
    const onMonth = (e) => {
      if (e.target.dataset.role !== 'month' || !e.target.value) return;
      month = e.target.value;
      load();
    };
    el.addEventListener('change', onMonth);
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
      el.removeEventListener('change', onMonth);
    };
  },
};
