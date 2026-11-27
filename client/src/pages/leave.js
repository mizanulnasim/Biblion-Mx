// Leave: my balance and my leave, asking for leave (with the days it takes
// shown before sending), and, for managers, leave waiting for them, leave
// coming up, everyone's balance, recording leave for someone, and (for
// shareholders) adjusting a balance with a reason.

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
import { decideRequest } from './rota.js';

const STATUS = { waiting: ['hr.fix.waiting', 'warn'], approved: ['hr.fix.approved', 'ok'], declined: ['hr.fix.declined', 'danger'], cancelled: ['leave.cancelled', 'muted'] };
const KIND = { paid: 'leave.kind.paid', unpaid: 'leave.kind.unpaid' };
const shortDate = (date) => dateShort(`${date}T06:00:00Z`);
const days = (n) => t('leave.days', { count: n });

function span(l) {
  return l.from === l.to ? shortDate(l.from) : t('leave.span', { from: shortDate(l.from), to: shortDate(l.to) });
}

function leaveLine(l, { who = false, actions = '' } = {}) {
  return html`<li class="check-item">
    <span><strong>${who ? `${l.staff_name} · ` : ''}${span(l)}</strong> · ${t(KIND[l.kind])} · ${days(l.days)} ${chip(t(STATUS[l.status][0]), STATUS[l.status][1])}</span>
    <span>“${l.reason}”</span>
    ${l.decide_note ? html`<span class="muted">${t('hr.note', { note: l.decide_note })}</span>` : ''}
    ${l.cancel_reason ? html`<span class="muted">${t('leave.cancel_note', { note: l.cancel_reason })}</span>` : ''}
    ${actions ? html`<span class="check-actions">${actions}</span>` : ''}
  </li>`;
}

function balanceView(b) {
  return html`<p class="leave-left"><strong>${t('leave.balance', { days: days(b.balance) })}</strong></p>
    <p class="muted">${t('leave.balance_parts', { earned: days(b.earned), adjusted: days(b.adjusted), used: days(b.used), waiting: days(b.waiting) })}</p>
    <p class="muted">${b.earning_from > today() ? t('leave.earning_from', { date: shortDate(b.earning_from) }) : t('leave.earning_since', { date: shortDate(b.earning_from) })}</p>`;
}

function mineView(mine) {
  const now = today();
  return html`<section class="panel">
    <h2 class="section-title">${t('leave.mine')}</h2>
    ${balanceView(mine.balance)}
    <div class="form-actions"><button type="button" class="btn btn-primary" data-act="apply">${t('leave.ask')}</button></div>
    ${mine.items.length ? html`<ul class="waiting-list">${mine.items.map((l) => leaveLine(l, {
      actions: l.status === 'waiting' || (l.status === 'approved' && l.from > now)
        ? html`<button type="button" class="btn btn-small" data-act="cancel" data-id="${l.id}">${t('leave.cancel')}</button>` : '',
    }))}</ul>` : emptyState(t('leave.none'))}
  </section>`;
}

function overviewView(o) {
  return html`
    ${o.waiting.length ? html`<section class="panel waiting"><h2 class="section-title">${t('leave.waiting', { count: o.waiting.length })}</h2>
      <ul class="waiting-list">${o.waiting.map((l) => leaveLine(l, { who: true, actions: html`
        <button type="button" class="btn btn-small btn-primary" data-act="decide" data-id="${l.id}" data-decision="accept">${t('hr.accept')}</button>
        <button type="button" class="btn btn-small" data-act="decide" data-id="${l.id}" data-decision="reject">${t('hr.reject')}</button>` }))}</ul></section>` : ''}
    <section class="panel"><h2 class="section-title">${t('leave.upcoming')}</h2>
      ${o.upcoming.length ? html`<ul class="waiting-list">${o.upcoming.map((l) => leaveLine(l, { who: true, actions: html`
        <button type="button" class="btn btn-small" data-act="cancel" data-id="${l.id}">${t('leave.cancel')}</button>` }))}</ul>` : emptyState(t('leave.none_upcoming'))}
      <div class="form-actions"><button type="button" class="btn" data-act="record">${t('leave.record')}</button></div>
    </section>
    <section class="panel"><h2 class="section-title">${t('leave.balances')}</h2>
      <div class="list-body"><table class="table">
        <thead><tr><th scope="col">${t('users.name')}</th><th scope="col">${t('leave.left')}</th><th scope="col">${t('leave.earned')}</th><th scope="col">${t('leave.used')}</th><th scope="col">${t('leave.waiting_col')}</th>${can('leave.adjust') ? html`<th scope="col"></th>` : ''}</tr></thead>
        <tbody>${o.balances.map((b) => html`<tr>
          <td data-label="${t('users.name')}"><span><strong>${b.staff.name}</strong></span></td>
          <td data-label="${t('leave.left')}" class="num"><span>${days(b.balance)}</span></td>
          <td data-label="${t('leave.earned')}" class="num"><span>${days(b.earned)}${b.adjusted ? ` (${b.adjusted > 0 ? '+' : ''}${days(b.adjusted)})` : ''}</span></td>
          <td data-label="${t('leave.used')}" class="num"><span>${days(b.used)}</span></td>
          <td data-label="${t('leave.waiting_col')}" class="num"><span>${days(b.waiting)}</span></td>
          ${can('leave.adjust') ? html`<td><span><button type="button" class="btn btn-small" data-act="adjust" data-id="${b.staff.id}">${t('leave.adjust')}</button></span></td>` : ''}
        </tr>`)}</tbody></table></div>
    </section>`;
}

// Asks for leave (staffId: recording it for someone). The days it takes and
// what's left are shown as the dates are picked.
function applyDialog({ staff = null, onDone }) {
  const fields = [
    { name: 'kind', label: t('leave.kind'), type: 'select', required: true, options: Object.keys(KIND).map((k) => ({ value: k, label: t(KIND[k]) })) },
    { name: 'from', label: t('leave.from'), type: 'date', required: true },
    { name: 'to', label: t('leave.to'), type: 'date', required: true },
    { name: 'reason', label: t('hr.fix_reason'), type: 'textarea', required: true },
  ];
  if (staff) fields.unshift({ name: 'staff_id', label: t('nav.staff'), type: 'select', required: true, placeholder: t('money.choose'), options: staff.map((s) => ({ value: s.staff.id, label: s.staff.name })) });
  const dialog = formDialog(t(staff ? 'leave.record' : 'leave.ask'), formView({
    submit: t(staff ? 'leave.record' : 'hr.send_fix'),
    values: { kind: 'paid', from: today(), to: today() },
    fields,
    extra: html`<p class="notice" data-role="preview" hidden></p>`,
  }));
  const form = dialog.querySelector('form.form');
  const slot = form.querySelector('[data-role="preview"]');
  async function preview() {
    const v = { staff_id: form.elements.staff_id ? form.elements.staff_id.value || null : null, from: form.elements.from.value, to: form.elements.to.value };
    if (!v.from || !v.to || v.to < v.from || (staff && !v.staff_id)) {
      slot.hidden = true;
      return;
    }
    try {
      const { data } = await read('leave.preview', v);
      slot.textContent = t('leave.preview', { days: days(data.days), left: days(data.balance.balance) });
      slot.hidden = false;
    } catch (err) {
      slot.hidden = true;
    }
  }
  form.addEventListener('change', preview);
  preview();
  bindForm(form, {
    schema: ACTIONS['leave.apply'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, staff_id: v.staff_id || null }),
    onSubmit: (v) => write('leave.apply', v),
    onSaved: (reply) => {
      dialog.close();
      toast(t(reply.data && reply.data.final ? 'leave.recorded' : 'hr.fix_sent'));
      onDone();
    },
  });
}

function cancelDialog(id, onDone) {
  const dialog = formDialog(t('leave.cancel'), formView({
    submit: t('leave.cancel'),
    fields: [{ name: 'reason', label: t('hr.fix_reason'), type: 'textarea', required: true }],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['leave.cancel'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id }),
    onSubmit: (v) => write('leave.cancel', v),
    onSaved: () => {
      dialog.close();
      toast(t('leave.cancelled_toast'));
      onDone();
    },
  });
}

function adjustDialog(person, onDone) {
  const dialog = formDialog(t('leave.adjust_title', { name: person.staff.name }), formView({
    submit: t('common.save'),
    fields: [
      { name: 'days', label: t('leave.adjust_days'), inputmode: 'decimal', required: true, help: t('leave.adjust_help') },
      { name: 'reason', label: t('hr.fix_reason'), type: 'textarea', required: true },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['leave.adjust'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, staff_id: person.staff.id }),
    onSubmit: (v) => write('leave.adjust', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

export const leavePage = {
  path: '/leave',
  title: 'nav.leave',
  perm: 'leave.approve|self.staff',
  mount(el) {
    let overview = null;
    async function load() {
      try {
        const [mine, over] = await Promise.all([
          can('self.staff') ? read('leave.mine') : null,
          can('leave.approve') ? read('leave.overview').then((r) => r.data) : null,
        ]);
        overview = over;
        render(el, html`${mine ? staleNotice(mine.cachedAt) : ''}
          ${overview ? overviewView(overview) : ''}
          ${mine ? mineView(mine.data) : ''}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      apply: () => applyDialog({ onDone: load }),
      record: () => applyDialog({ staff: overview.balances, onDone: load }),
      cancel: (e, btn) => cancelDialog(btn.dataset.id, load),
      decide: (e, btn) => decideRequest('leave.decide', btn, load),
      adjust: (e, btn) => adjustDialog(overview.balances.find((b) => b.staff.id === btn.dataset.id), load),
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
