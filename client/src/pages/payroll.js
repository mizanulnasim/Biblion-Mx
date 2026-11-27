// Payroll: a month's payslips for everyone employed in it (a draft until a
// shareholder issues it), what has been paid for the month and what is
// left; and each person's pay account, with buttons that open the money
// screen ready to pay.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { onArea } from '../core/live.js';
import { money } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { slipLines, monthName, thisMonthKey } from './payslip.js';

const payLink = (fields) => `#/money/new?${new URLSearchParams(fields).toString()}`;

function slipDialog(row, month, onDone) {
  const s = row.slip;
  const issuing = !row.issued && can('payroll.manage');
  const actions = html`<div class="form-actions">
    ${row.issued ? html`<a class="btn" href="#/payslip?id=${s.id}">${t('pay.view_slip')}</a>` : ''}
    ${row.issued && can('acc.staffpay') && row.to_pay ? html`<a class="btn btn-primary" href="${payLink({ kind: 'salary_paid', party_id: row.staff.id, amount: row.to_pay, period: month })}">${t('pay.pay_amount', { amount: money(row.to_pay) })}</a>` : ''}
    ${row.issued && can('payroll.manage') ? html`<button type="button" class="btn" data-role="cancel">${t('pay.cancel_slip')}</button>` : ''}
  </div>`;
  const body = html`${slipLines(s)}
    ${row.paid ? html`<p class="muted">${t('pay.paid_for_month', { amount: money(row.paid) })}</p>` : ''}
    ${issuing ? formView({
      submit: t('pay.issue'),
      values: { unpaid_absent_days: '0' },
      fields: [
        { name: 'unpaid_absent_days', label: t('pay.unpaid_absent'), inputmode: 'numeric', required: true, help: t('pay.unpaid_absent_help', { count: s.absent_days }) },
        { name: 'note', label: t('pay.note'), type: 'textarea' },
      ],
    }) : actions}`;
  const dialog = formDialog(t('pay.slip_title', { name: row.staff.name, month: monthName(month) }), body);
  if (issuing) {
    bindForm(dialog.querySelector('form.form'), {
      schema: ACTIONS['payroll.issue'].schema,
      busyLabel: t('common.saving'),
      mapValues: (v) => ({ ...v, staff_id: row.staff.id, month }),
      onSubmit: (v) => write('payroll.issue', v),
      onSaved: () => {
        dialog.close();
        toast(t('pay.issued'));
        onDone();
      },
    });
  }
  const cancel = dialog.querySelector('[data-role="cancel"]');
  if (cancel) {
    cancel.addEventListener('click', () => {
      dialog.close();
      cancelSlip(s.id, onDone);
    });
  }
}

function cancelSlip(id, onDone) {
  const dialog = formDialog(t('pay.cancel_slip'), formView({
    submit: t('pay.cancel_slip'),
    fields: [{ name: 'reason', label: t('hr.fix_reason'), type: 'textarea', required: true, help: t('pay.cancel_help') }],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['payroll.cancel'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id }),
    onSubmit: (v) => write('payroll.cancel', v),
    onSaved: () => {
      dialog.close();
      toast(t('pay.cancelled'));
      onDone();
    },
  });
}

function openingDialog(row, onDone) {
  const a = row.account;
  const dialog = formDialog(t('pay.opening_title', { name: row.staff.name }), formView({
    submit: t('common.save'),
    values: { owed: String(a.opening_owed), advance: String(a.opening_advance) },
    fields: [
      { name: 'owed', label: t('pay.opening_owed'), inputmode: 'decimal', help: t('pay.opening_help') },
      { name: 'advance', label: t('pay.opening_advance'), inputmode: 'decimal' },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['payroll.opening.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ staff_id: row.staff.id, owed: v.owed || 0, advance: v.advance || 0 }),
    onSubmit: (v) => write('payroll.opening.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

function monthTable(data) {
  if (!data.rows.length) return emptyState(t('pay.nobody'));
  return html`<div class="list-body"><table class="table">
    <thead><tr><th scope="col">${t('users.name')}</th><th scope="col">${t('hr.salary')}</th><th scope="col">${t('pay.days')}</th><th scope="col">${t('pay.unpaid_days')}</th><th scope="col">${t('pay.net')}</th><th scope="col">${t('pay.paid')}</th><th scope="col">${t('pay.to_pay')}</th></tr></thead>
    <tbody>${data.rows.map((r) => html`<tr data-act="slip" data-id="${r.staff.id}" tabindex="0">
      <td data-label="${t('users.name')}"><span><strong>${r.staff.name}</strong> ${r.issued ? chip(t('pay.issued_chip'), 'ok') : chip(t('pay.draft'), 'muted')}</span></td>
      <td data-label="${t('hr.salary')}" class="num"><span>${money(r.slip.salary)}</span></td>
      <td data-label="${t('pay.days')}" class="num"><span>${t('pay.days_of', { days: r.slip.employed_days, of: r.slip.month_days })}</span></td>
      <td data-label="${t('pay.unpaid_days')}" class="num"><span>${t('pay.unpaid_summary', { leave: r.slip.unpaid_leave_days, absent: r.slip.absent_days })}</span></td>
      <td data-label="${t('pay.net')}" class="num"><span><strong>${money(r.slip.net)}</strong></span></td>
      <td data-label="${t('pay.paid')}" class="num"><span>${money(r.paid)}</span></td>
      <td data-label="${t('pay.to_pay')}" class="num"><span>${r.issued ? money(r.to_pay) : '—'}</span></td>
    </tr>`)}</tbody></table></div>`;
}

function accountsTable(data) {
  return html`<div class="list-body"><table class="table">
    <thead><tr><th scope="col">${t('users.name')}</th><th scope="col">${t('pay.owed')}</th><th scope="col">${t('pay.advance')}</th><th scope="col">${t('pay.food_earned')}</th><th scope="col"></th></tr></thead>
    <tbody>${data.rows.map((r) => html`<tr>
      <td data-label="${t('users.name')}"><span><strong>${r.staff.name}</strong></span></td>
      <td data-label="${t('pay.owed')}" class="num"><span>${money(r.account.owed)}</span></td>
      <td data-label="${t('pay.advance')}" class="num"><span>${money(r.account.advance)}</span></td>
      <td data-label="${t('pay.food_earned')}" class="num"><span>${money(r.account.food_earned - r.account.food_paid)}</span></td>
      <td><span class="check-actions">
        ${can('acc.staffpay') ? html`<a class="btn btn-small" href="${payLink({ kind: 'food_paid', party_id: r.staff.id })}">${t('pay.pay_food')}</a>
          <a class="btn btn-small" href="${payLink({ kind: 'staff_advance', party_id: r.staff.id })}">${t('pay.give_advance')}</a>` : ''}
        ${can('payroll.manage') ? html`<button type="button" class="btn btn-small" data-act="opening" data-id="${r.staff.id}">${t('pay.opening')}</button>` : ''}
      </span></td>
    </tr>`)}</tbody></table></div>`;
}

export const payrollPage = {
  path: '/payroll',
  title: 'nav.payroll',
  perm: 'payroll.view',
  mount(el, { query }) {
    let month = query.month || thisMonthKey();
    let data = null;
    async function load() {
      try {
        data = (await read('payroll.month', { month })).data;
        render(el, html`<div class="list-bar"><label class="field-inline">${t('hr.month')} <input type="month" data-role="month" value="${month}" max="${thisMonthKey()}"></label></div>
          <section class="panel"><h2 class="section-title">${t('pay.payslips', { month: monthName(month) })}</h2><p class="help">${t('pay.payslips_help')}</p>${monthTable(data)}</section>
          <section class="panel"><h2 class="section-title">${t('pay.accounts')}</h2><p class="help">${t('pay.accounts_help')}</p>${data.rows.length ? accountsTable(data) : emptyState(t('pay.nobody'))}</section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const byStaff = (id) => data.rows.find((r) => r.staff.id === id);
    const offClick = on(el, 'click', {
      slip: (e, tr) => slipDialog(byStaff(tr.dataset.id), month, load),
      opening: (e, btn) => openingDialog(byStaff(btn.dataset.id), load),
    });
    const onMonth = (e) => {
      if (e.target.dataset.role !== 'month' || !e.target.value) return;
      month = e.target.value;
      load();
    };
    el.addEventListener('change', onMonth);
    const offArea = onArea('hr', load);
    const offMoney = onArea('money', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
      offMoney();
      el.removeEventListener('change', onMonth);
    };
  },
};
