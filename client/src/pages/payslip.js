// A payslip as a document (letterhead, figures, what was paid in the
// month), ready to print; and My pay: the person's own pay account and
// payslips. Nobody sees anyone else's payslip without payroll.view.

import { html, on, render } from '../ui/html.js';
import { letterhead, signatures } from '../ui/letterhead.js';
import { emptyState, errorBox, staleNotice } from '../ui/feedback.js';
import { errorText } from '../ui/form.js';
import { t } from '../core/i18n.js';
import { read } from '../core/api.js';
import { onArea } from '../core/live.js';
import { dateShort, money, monthLabel } from '../core/format.js';
import { kindLabel } from './money-common.js';

export const monthName = monthLabel;

// An accounting month by its dates.
export const periodText = (s) => t('pay.period', { from: dateShort(`${s.period_from}T06:00:00Z`), to: dateShort(`${s.period_to}T06:00:00Z`) });

// The figures of a payslip (draft or issued), as label and amount lines.
export function slipLines(s) {
  const cut = s.unpaid_leave_days + s.unpaid_absent_days;
  const named = s.parts.filter((p) => p.name);
  return html`<dl class="slip">
    <dt>${t('pay.line.salary')}</dt><dd>${money(s.salary)}</dd>
    ${named.map((p) => html`<dt class="muted">${p.name}</dt><dd class="muted">${money(p.amount)}</dd>`)}
    <dt>${t('pay.line.days')}</dt><dd>${t('pay.days_of', { days: s.employed_days, of: s.month_days })}</dd>
    <dt>${t('pay.line.base')}</dt><dd>${money(s.base)}</dd>
    ${s.leave_days ? html`<dt>${t('pay.line.unpaid_leave')}</dt><dd>${t('pay.leave_cut', { leave: s.leave_days, cut: s.unpaid_leave_days })}</dd>` : ''}
    ${s.absent_days ? html`<dt>${t('pay.line.absent')}</dt><dd>${t('pay.absent_cut', { absent: s.absent_days, cut: s.unpaid_absent_days || 0 })}</dd>` : ''}
    ${cut ? html`<dt>${t('pay.line.cut', { days: cut, divisor: s.divisor })}</dt><dd>− ${money(s.unpaid_cut)}</dd>` : ''}
    ${s.overtime_pay ? html`<dt>${t('pay.line.overtime', { hours: s.overtime_hours, rate: money(s.overtime_rate) })}</dt><dd>+ ${money(s.overtime_pay)}</dd>` : ''}
    <dt class="slip-total">${t('pay.line.net')}</dt><dd class="slip-total">${money(s.net)}</dd>
  </dl>
  ${s.note ? html`<p class="muted">${t('hr.note', { note: s.note })}</p>` : ''}`;
}

// Food allowance earned by week (Saturday to Friday), newest first.
function foodWeeksView(weeks) {
  const earning = weeks.filter((w) => w.earned);
  if (!earning.length) return '';
  return html`<h3 class="subhead">${t('pay.food_weeks')}</h3>
    <dl class="slip">${earning.slice().reverse().map((w) => html`<dt>${t('pay.period', { from: dateShort(`${w.from}T06:00:00Z`), to: dateShort(`${w.to}T06:00:00Z`) })}</dt><dd>${money(w.earned)}</dd>`)}</dl>`;
}

function documentView(data) {
  const { staff, slip, entries } = data;
  return html`<article class="doc">
    ${letterhead()}
    <h2 class="doc-title">${t('pay.payslip')}</h2><p class="muted">${monthName(slip.month)} · ${periodText(slip)}</p>
    <p><strong>${staff.name}</strong>${staff.number ? ` · ${staff.number}` : ''}${staff.position ? ` · ${staff.position}` : ''}<br>
      <span class="muted">${t('pay.joined', { date: dateShort(`${staff.joined_on}T06:00:00Z`) })}</span></p>
    ${slip.status === 'cancelled' ? html`<p class="notice notice-warn">${t('pay.slip_cancelled', { reason: slip.cancel_reason })}</p>` : ''}
    ${slipLines(slip)}
    <h3 class="section-title">${t('pay.this_month')}</h3>
    ${entries.length ? html`<dl class="slip">${entries.map((e) => html`<dt>${kindLabel(e.kind)} <span class="muted">${dateShort(`${e.date}T06:00:00Z`)}</span></dt><dd>${money(e.amount)}</dd>`)}</dl>`
      : html`<p class="muted">${t('pay.nothing_paid')}</p>`}
    <p class="muted doc-foot">${t('pay.issued_on', { date: dateShort(slip.issued_at) })}</p>
    ${signatures([t('pay.sign_issued'), t('pay.sign_received')])}
  </article>`;
}

export const payslipPage = {
  path: '/payslip',
  title: 'pay.payslip',
  perm: 'payroll.view|self.staff',
  mount(el, { query }) {
    read('payroll.payslip', { id: query.id }).then(({ data, cachedAt }) => {
      render(el, html`${staleNotice(cachedAt)}
        <div class="list-bar no-print"><button type="button" class="btn btn-primary" data-act="print">${t('pay.print')}</button></div>
        ${documentView(data)}`);
    }).catch((err) => render(el, errorBox(errorText(err))));
    return on(el, 'click', { print: () => window.print() });
  },
};

export const myPayPage = {
  path: '/me/pay',
  title: 'nav.my_pay',
  perm: 'self.staff',
  mount(el) {
    async function load() {
      try {
        const { data, cachedAt } = await read('payroll.mine');
        const a = data.account;
        render(el, html`${staleNotice(cachedAt)}
          <section class="panel">
            <h2 class="section-title">${t('pay.my_account')}</h2>
            ${data.overdue.map((o) => html`<p class="notice notice-warn">${t('pay.overdue_mine', { month: monthName(o.month), amount: money(o.left), date: dateShort(`${o.due_by}T06:00:00Z`) })}</p>`)}
            <p class="leave-left"><strong>${t('pay.owed_to_you', { amount: money(a.owed) })}</strong></p>
            ${a.advance ? html`<p>${t('pay.advance_to_return', { amount: money(a.advance) })}</p>` : ''}
            <p class="muted">${t('pay.account_parts', { payslips: money(a.payslips), food: money(a.food_earned), salary: money(a.salary_paid), food_paid: money(a.food_paid), deductions: money(a.deductions) })}</p>
            ${foodWeeksView(a.food_weeks)}
          </section>
          <section class="panel"><h2 class="section-title">${t('pay.my_payslips')}</h2>
            ${data.payslips.length ? html`<ul class="punches">${data.payslips.map((s) => html`<li class="punch">
              <span><strong>${monthName(s.month)}</strong> · ${money(s.net)}</span>
              <a class="btn btn-small" href="#/payslip?id=${s.id}">${t('pay.view_slip')}</a></li>`)}</ul>` : emptyState(t('pay.no_payslips'))}
          </section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offArea = onArea('hr', load);
    const offMoney = onArea('money', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offArea();
      offMoney();
    };
  },
};
