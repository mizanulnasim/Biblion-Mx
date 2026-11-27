// Someone leaving. Managers: everyone leaving, recording a resignation or a
// termination, and one person's leaving step by step (accept, hand over
// tasks, final settlement, pay, complete, letters). Staff: resigning, and
// where their leaving stands.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { onArea } from '../core/live.js';
import { dateShort, money, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { LETTER_LABEL } from './letters.js';

const STATUS = {
  requested: ['leaving.status.requested', 'warn'],
  accepted: ['leaving.status.accepted', 'warn'],
  settled: ['leaving.status.settled', 'ok'],
  completed: ['leaving.status.completed', 'muted'],
  withdrawn: ['leaving.status.withdrawn', 'muted'],
};
const KIND = { resignation: 'leaving.kind.resignation', termination: 'leaving.kind.termination' };
const shortDate = (date) => dateShort(`${date}T06:00:00Z`);
const statusChip = (s) => chip(t(STATUS[s][0]), STATUS[s][1]);
const payLink = (fields) => `#/money/new?${new URLSearchParams(fields).toString()}`;

function textDialog(title, field, label, action, payload, onDone, done) {
  const dialog = formDialog(title, formView({ submit: title, fields: [{ name: field, label, type: 'textarea', required: true }] }));
  bindForm(dialog.querySelector('form.form'), {
    schema: { [field]: ACTIONS[action].schema[field] },
    busyLabel: t('common.saving'),
    onSubmit: (v) => write(action, { ...payload, [field]: v[field] }),
    onSaved: () => {
      dialog.close();
      toast(done);
      onDone();
    },
  });
}

// Recording leaving for someone (staff: null), or resigning (staff given:
// not shown, the person themselves).
function submitDialog({ staff = null, noticeDays, onDone }) {
  const fields = [];
  if (staff) {
    fields.push(
      { name: 'staff_id', label: t('nav.staff'), type: 'select', required: true, placeholder: t('money.choose'), options: staff.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'kind', label: t('leaving.kind'), type: 'select', required: true, options: Object.keys(KIND).map((k) => ({ value: k, label: t(KIND[k]) })) },
    );
  }
  fields.push(
    { name: 'notice_date', label: t('leaving.notice_date'), type: 'date', required: true },
    { name: 'last_day', label: t('leaving.last_day'), type: 'date', required: true, help: t('leaving.last_day_help', { days: noticeDays }) },
    { name: 'reason', label: t('hr.fix_reason'), type: 'textarea', required: true },
  );
  const dialog = formDialog(t(staff ? 'leaving.record' : 'leaving.resign'), formView({
    submit: t(staff ? 'leaving.record' : 'leaving.resign_send'),
    values: { notice_date: today(), kind: 'resignation' },
    fields,
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['separation.submit'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, kind: v.kind || 'resignation', staff_id: v.staff_id || null }),
    onSubmit: (v) => write('separation.submit', v),
    onSaved: (reply) => {
      dialog.close();
      toast(t(reply.data && reply.data.accepted ? 'leaving.recorded' : 'leaving.sent'));
      onDone();
    },
  });
}

export const leavingPage = {
  path: '/leaving',
  title: 'nav.leaving',
  perm: 'separation.manage',
  mount(el) {
    let staff = [];
    async function load() {
      try {
        const [{ data }, people] = await Promise.all([read('separation.list'), read('staff.list', { status: 'active', limit: 100 })]);
        staff = people.data.items;
        render(el, html`<div class="list-bar"><button type="button" class="btn btn-primary" data-act="record">${t('leaving.record')}</button></div>
          <section class="panel">${data.items.length ? html`<ul class="waiting-list">${data.items.map((s) => html`<li class="check-item">
            <span><a href="#/leaving/one?id=${s.id}"><strong>${s.staff.name}</strong></a> · ${t(KIND[s.kind])} ${statusChip(s.status)}</span>
            <span class="muted">${t('leaving.last_day_on', { date: shortDate(s.last_day) })}</span></li>`)}</ul>` : emptyState(t('leaving.none'))}</section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', { record: () => submitDialog({ staff, noticeDays: 30, onDone: load }) });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return offClick;
  },
};

function settlementView(d, leaveDays) {
  const f = d.figures;
  const a = d.account;
  const settled = d.status === 'settled' || d.status === 'completed';
  const lastMonth = d.last_day.slice(0, 7);
  return html`<section class="panel"><h2 class="section-title">${t('leaving.settlement')}</h2>
    ${f.missing_payslips && f.missing_payslips.length && !settled ? html`<p class="notice notice-warn"><a href="#/payroll?month=${f.missing_payslips[0]}">${t('leaving.issue_first', { months: f.missing_payslips.join(', ') })}</a></p>` : ''}
    <dl class="slip">
      <dt>${t('leaving.line.owed')}</dt><dd>${money(f.owed)}</dd>
      <dt>${t('leaving.line.leave', { days: f.leave_days, unused: f.unused_leave, rate: money(f.day_rate) })}</dt><dd>${money(f.leave_pay)}</dd>
      <dt>${t('leaving.line.notice', { given: f.notice_given, expected: f.notice_expected, short: f.notice_short })}</dt><dd>− ${money(f.notice_cut)}</dd>
      <dt>${t('leaving.line.advance')}</dt><dd>− ${money(f.advance)}</dd>
      <dt class="slip-total">${t('leaving.line.final')}</dt><dd class="slip-total">${money(f.final)}</dd>
    </dl>
    ${!settled && f.encash === 'ask' && can('payroll.manage') ? html`<label class="field-inline">${t('leaving.leave_days')}
      <input type="number" min="0" max="${f.unused_leave}" step="0.5" value="${leaveDays ?? f.unused_leave}" data-role="leave-days"></label>` : ''}
    <div class="form-actions">
      ${d.status === 'accepted' && can('payroll.manage') ? html`<button type="button" class="btn btn-primary" data-act="confirm">${t('leaving.confirm')}</button>` : ''}
      ${d.status === 'settled' && can('payroll.manage') ? html`<button type="button" class="btn" data-act="reopen">${t('leaving.reopen')}</button>` : ''}
      ${settled && can('acc.staffpay') && a.advance > 0 ? html`<a class="btn" href="${payLink({ kind: 'staff_deduction', party_id: d.staff.id, amount: a.advance })}">${t('leaving.take_advance', { amount: money(a.advance) })}</a>` : ''}
      ${settled && can('acc.staffpay') && a.owed > 0 && a.advance <= 0 ? html`<a class="btn btn-primary" href="${payLink({ kind: 'salary_paid', party_id: d.staff.id, amount: a.owed, period: lastMonth })}">${t('leaving.pay', { amount: money(a.owed) })}</a>` : ''}
    </div>
    ${settled ? html`<p class="muted">${t('leaving.account_now', { owed: money(a.owed), advance: money(a.advance) })}</p>` : ''}
  </section>`;
}

export const leavingOnePage = {
  path: '/leaving/one',
  title: 'nav.leaving',
  perm: 'separation.manage',
  mount(el, { query }) {
    let d = null;
    let leaveDays = null;
    let staff = [];
    async function load() {
      try {
        const [list, people] = await Promise.all([read('separation.list'), read('staff.list', { status: 'active', limit: 100 })]);
        staff = people.data.items;
        d = list.data.items.find((x) => x.id === query.id);
        if (!d) throw new Error('missing');
        if (can('payroll.view')) {
          const full = (await read('separation.settlement', { id: d.id, leave_days: leaveDays })).data;
          d = { ...d, figures: full.figures, account: full.account };
        }
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    function draw() {
      const open = ['requested', 'accepted', 'settled'].includes(d.status);
      render(el, html`<section class="panel">
          <h2 class="section-title">${d.staff.name} · ${t(KIND[d.kind])} ${statusChip(d.status)}</h2>
          <p>${t('leaving.dates', { notice: shortDate(d.notice_date), last: shortDate(d.last_day) })}</p>
          <p>“${d.reason}”</p>
          <div class="form-actions">
            ${d.status === 'requested' ? html`<button type="button" class="btn btn-primary" data-act="accept">${t('leaving.accept')}</button>` : ''}
            ${(d.status === 'requested' || d.status === 'accepted') && d.last_day >= today() ? html`<button type="button" class="btn" data-act="withdraw">${t('leaving.withdraw')}</button>` : ''}
            ${(d.status === 'settled' || (d.status === 'accepted' && !d.staff.salary)) ? html`<button type="button" class="btn btn-primary" data-act="complete" ${d.last_day > today() ? 'disabled' : ''}>${t('leaving.complete')}</button>` : ''}
          </div>
          ${(d.status === 'settled' || (d.status === 'accepted' && !d.staff.salary)) && d.last_day > today() ? html`<p class="help">${t('leaving.complete_after', { date: shortDate(d.last_day) })}</p>` : ''}
        </section>
        ${open ? html`<section class="panel"><h2 class="section-title">${t('leaving.handover')}</h2>
          <p>${t('leaving.handover_count', { tasks: d.handover.tasks, templates: d.handover.templates })}</p>
          ${d.handover.tasks + d.handover.templates ? html`<div class="list-bar"><label class="field-inline">${t('leaving.handover_to')}
            <select data-role="handover-to"><option value="">${t('money.choose')}</option>${staff.filter((s) => s.id !== d.staff.id).map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select></label>
            <button type="button" class="btn" data-act="handover">${t('leaving.handover_go')}</button></div>` : ''}</section>` : ''}
        ${d.figures && d.status !== 'requested' && d.status !== 'withdrawn' ? settlementView(d, leaveDays) : ''}
        <section class="panel"><h2 class="section-title">${t('leaving.letters')}</h2>
          <div class="form-actions">
            <button type="button" class="btn" data-act="letter" data-kind="experience" ${d.status === 'requested' || d.status === 'withdrawn' ? 'disabled' : ''}>${t('letters.kind.experience')}</button>
            <button type="button" class="btn" data-act="letter" data-kind="release" ${d.status === 'requested' || d.status === 'withdrawn' ? 'disabled' : ''}>${t('letters.kind.release')}</button>
          </div>
          ${d.letters.length ? html`<ul class="punches">${d.letters.map((l) => html`<li class="punch"><a href="#/letter?id=${l.id}">${t(LETTER_LABEL[l.kind])}</a></li>`)}</ul>` : ''}
        </section>`);
    }
    const act = async (action, payload, done) => {
      const reply = await write(action, payload);
      if (reply.status === 'saved') {
        toast(done);
        load();
      } else if (reply.status === 'rejected') {
        const field = reply.error.fields ? Object.values(reply.error.fields)[0] : null;
        toast(field ? t(field.code, field.params) : t(errorMessageId(reply.error.code), reply.error.params), 'error');
      }
      return reply;
    };
    const offClick = on(el, 'click', {
      accept: () => act('separation.accept', { id: d.id }, t('leaving.accepted')),
      withdraw: () => textDialog(t('leaving.withdraw'), 'reason', t('hr.fix_reason'), 'separation.withdraw', { id: d.id }, load, t('leaving.withdrawn')),
      complete: () => act('separation.complete', { id: d.id }, t('leaving.completed')),
      handover: () => {
        const to = el.querySelector('[data-role="handover-to"]').value;
        if (to) act('separation.handover', { id: d.id, to_staff_id: to }, t('leaving.handed_over'));
      },
      confirm: () => act('separation.confirm', { id: d.id, leave_days: leaveDays }, t('leaving.confirmed')),
      reopen: () => textDialog(t('leaving.reopen'), 'reason', t('hr.fix_reason'), 'separation.reopen', { id: d.id }, load, t('leaving.reopened')),
      letter: async (e, btn) => {
        const reply = await act('letters.issue', { staff_id: d.staff.id, kind: btn.dataset.kind }, t('letters.issued'));
        if (reply.status === 'saved') location.hash = `#/letter?id=${reply.record_id}`;
      },
    });
    const onDays = (e) => {
      if (e.target.dataset.role !== 'leave-days') return;
      leaveDays = Number(e.target.value);
      load();
    };
    el.addEventListener('change', onDays);
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
      el.removeEventListener('change', onDays);
    };
  },
};

export const myLeavingPage = {
  path: '/me/leaving',
  title: 'nav.my_leaving',
  perm: 'self.staff',
  mount(el) {
    let data = null;
    async function load() {
      try {
        data = (await read('separation.mine')).data;
        const s = data.separation;
        const open = s && ['requested', 'accepted', 'settled'].includes(s.status);
        render(el, html`<section class="panel">
          ${s ? html`<p><strong>${t(KIND[s.kind])}</strong> ${statusChip(s.status)}</p>
            <p>${t('leaving.dates', { notice: shortDate(s.notice_date), last: shortDate(s.last_day) })}</p>` : html`<p>${t('leaving.resign_help', { days: data.notice_days })}</p>`}
          <div class="form-actions">
            ${!open ? html`<button type="button" class="btn btn-primary" data-act="resign">${t('leaving.resign')}</button>` : ''}
            ${open && s.status !== 'settled' && s.last_day >= today() ? html`<button type="button" class="btn" data-act="withdraw">${t('leaving.withdraw')}</button>` : ''}
          </div></section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      resign: () => submitDialog({ noticeDays: data.notice_days, onDone: load }),
      withdraw: () => textDialog(t('leaving.withdraw'), 'reason', t('hr.fix_reason'), 'separation.withdraw', { id: data.separation.id }, load, t('leaving.withdrawn')),
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return offClick;
  },
};
