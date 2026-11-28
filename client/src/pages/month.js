// Month closing: an accounting month's figures as v1 works them out
// (income, costs, salaries, profit, the loss carried and each share), what
// has to be done first, closing it (shareholders), and reopening the latest
// closed month with a reason. And Shareholders: their shares from a date,
// loans with their yearly interest, and each one's account.

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
import { reportView } from '../ui/report.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { dataUrl } from '../ui/files.js';
import { onTick, skipField, tickButton, tickedBy } from '../ui/steps.js';

const day = (d) => dateShort(`${d}T06:00:00Z`);
const STEP = {
  ended: 'month.step.ended', days: 'month.step.days', salaries: 'steps.month.salaries', vendors: 'steps.month.vendors', publishers: 'steps.month.publishers',
  cafe_stock: 'steps.month.cafe_stock', utilities: 'steps.month.utilities', reports: 'steps.month.reports', data_check: 'steps.month.data_check',
};
const STATE_CHIP = { done: ['month.done', 'ok'], todo: ['month.todo', 'danger'], warn: ['steps.optional', 'warn'] };

// The month's checklist: what the app sees, and the reviews people tick.
function stepsView(data) {
  return html`<ul class="waiting-list">${data.steps.map((s) => html`<li class="check-item"><span>${chip(t(STATE_CHIP[s.state][0]), STATE_CHIP[s.state][1])}
      ${t(STEP[s.id], { date: day(s.params.date || today()), count: s.params.count || 0 })}</span>
      ${s.manual ? html`${tickedBy(s)} ${tickButton('month', data.month, s)}` : ''}</li>`)}</ul>
    ${data.steps.some((s) => s.required && s.state === 'todo') ? html`<p class="help">${t('steps.left', { count: data.steps.filter((s) => s.required && s.state === 'todo').length })}</p>` : ''}
    <div class="form-actions"><button type="button" class="btn btn-primary" data-act="close" ${data.steps[0].state === 'done' ? '' : 'disabled'}>${t('month.close')}</button></div>`;
}

export const monthClosingPage = {
  path: '/closing/month',
  title: 'nav.month_closing',
  perm: 'closing.month',
  mount(el, { query }) {
    let month = query.month || '';
    let data = null;
    async function load() {
      try {
        data = (await read('month.view', month ? { month } : {})).data;
        month = data.month;
        // The report itself is the shared monthly report.
        const report = (await read('reports.get', { report: 'monthly', month })).data.model;
        render(el, html`<div class="list-bar no-print">
            <label class="field-inline">${t('hr.month')} <input type="month" data-role="month" value="${month}" max="${data.current}"></label>
            <button type="button" class="btn" data-act="print">${t('pay.print')}</button>
          </div>
          <section class="panel no-print">
            ${data.closed ? html`<p>${chip(t('month.closed'), 'ok')} ${t('month.closed_on', { date: dateShort(data.closed_at) })}</p>
              ${data.files.length ? html`<p class="help">${t('month.files')}</p><div class="check-actions">${data.files.map((f) => html`<button type="button" class="btn btn-small" data-act="file" data-id="${f.id}">${f.name}</button>`)}</div>` : ''}
              <div class="form-actions"><button type="button" class="btn" data-act="reopen">${t('month.reopen')}</button></div>`
              : stepsView(data)}
          </section>
          ${reportView(report)}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const ask = (title, fields, action, done) => {
      const dialog = formDialog(title, formView({ submit: title, fields }));
      bindForm(dialog.querySelector('form.form'), {
        schema: ACTIONS[action].schema,
        busyLabel: t('common.saving'),
        mapValues: (v) => ({ ...v, month }),
        onSubmit: async (v) => {
          const reply = await write(action, v);
          // Closing the month from a task is what the task is done with.
          if (action === 'month.close' && query.task && reply.status === 'saved') await write('tasks.record', { id: query.task, record_id: reply.record_id });
          return reply;
        },
        onSaved: () => {
          dialog.close();
          toast(done);
          load();
        },
      });
    };
    const offClick = on(el, 'click', {
      // Printing is noted, so a report-printing task can be done with it.
      print: async () => {
        window.print();
        const reply = await write('reports.printed', { report: 'monthly', ref: month });
        if (query.task && reply.status === 'saved') await write('tasks.record', { id: query.task, record_id: reply.record_id });
      },
      file: async (e, btn) => {
        // Opened in a new tab; the browser shows the PDF or saves the Excel file.
        const tab = window.open('', '_blank');
        try {
          const { data: f } = await read('files.get', { id: btn.dataset.id });
          tab.location.href = dataUrl(f.mime, f.data);
        } catch (err) {
          tab.close();
          toast(errorText(err), 'error');
        }
      },
      tick: (e, btn) => onTick(btn, load),
      close: () => ask(t('month.close'), [{ name: 'note', label: t('pay.note'), type: 'textarea' }, ...skipField(data.steps.filter((s) => s.required && s.state === 'todo').length)], 'month.close', t('month.closed_done')),
      reopen: () => ask(t('month.reopen'), [{ name: 'reason', label: t('hr.fix_reason'), type: 'textarea', required: true }], 'month.reopen', t('month.reopened')),
    });
    const onMonth = (e) => {
      if (e.target.dataset.role !== 'month' || !e.target.value) return;
      month = e.target.value;
      load();
    };
    el.addEventListener('change', onMonth);
    const offArea = onArea('money', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
      el.removeEventListener('change', onMonth);
    };
  },
};

// ---- Shareholders ---------------------------------------------------------------

function sharesDialog(data, onDone) {
  const active = data.shareholders.filter((s) => s.status === 'active');
  const current = data.history[0] ? Object.fromEntries(data.history[0].shares.map((x) => [x.shareholder_id, String(x.percent)])) : {};
  const values = { from: today() };
  for (const s of active) values[`p_${s.id}`] = current[s.id] || '';
  const dialog = formDialog(t('sh.change_shares'), formView({
    submit: t('common.save'),
    values,
    fields: [
      { name: 'from', label: t('sh.from'), type: 'date', required: true, help: t('sh.from_help') },
      ...active.map((s) => ({ name: `p_${s.id}`, label: t('sh.percent', { name: s.name }), inputmode: 'decimal' })),
      { name: 'note', label: t('pay.note'), type: 'textarea' },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['shareholders.shares.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ from: v.from, note: v.note, shares: active.filter((s) => v[`p_${s.id}`]).map((s) => ({ shareholder_id: s.id, percent: v[`p_${s.id}`] })) }),
    onSubmit: (v) => write('shareholders.shares.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

function loanDialog(loan, data, onDone) {
  const dialog = formDialog(loan ? loan.number : t('sh.add_loan'), formView({
    submit: t('common.save'),
    values: loan ? { ...loan, rate: String(loan.rate) } : { opened: today(), direction: 'given', status: 'open' },
    fields: [
      { name: 'shareholder_id', label: t('money.field.shareholder'), type: 'select', required: true, placeholder: t('money.choose'), options: data.shareholders.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'direction', label: t('sh.direction'), type: 'select', required: true, options: [{ value: 'given', label: t('sh.given') }, { value: 'taken', label: t('sh.taken') }] },
      { name: 'rate', label: t('sh.rate'), inputmode: 'decimal', help: t('sh.rate_help') },
      { name: 'opened', label: t('sh.opened'), type: 'date', required: true },
      { name: 'note', label: t('pay.note'), type: 'textarea' },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'open', label: t('sh.open') }, { value: 'closed', label: t('sh.closed') }] },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['shareholders.loan.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, rate: v.rate || 0, id: loan ? loan.id : null, version: loan ? loan.version : null }),
    onSubmit: (v) => write('shareholders.loan.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

function statementsView(rows) {
  return html`<div class="list-body"><table class="table">
    <thead><tr><th scope="col">${t('users.name')}</th><th scope="col">${t('sh.owed_to_them')}</th><th scope="col">${t('sh.owes_business')}</th><th scope="col">${t('sh.settle')}</th></tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td data-label="${t('users.name')}"><span><strong>${r.name}</strong>${r.profit_overdue ? html` ${chip(t('sh.profit_overdue', { amount: money(r.profit_overdue) }), 'danger')}` : ''}<br><span class="muted">${t('sh.owed_parts', { salary: money(r.salary), profit: money(r.profit), interest: money(r.interest_earned), paid: money(r.salary_paid + r.profit_paid + r.withdrawn) })}${r.opening_owed || r.opening_owes ? html`<br>${t('sh.opening_parts', { owed: money(r.opening_owed), owes: money(r.opening_owes) })}` : ''}</span></span></td>
      <td data-label="${t('sh.owed_to_them')}" class="num"><span>${money(r.owed_to_them)}</span></td>
      <td data-label="${t('sh.owes_business')}" class="num"><span>${money(r.owes_business)}</span></td>
      <td data-label="${t('sh.settle')}" class="num"><span><strong>${money(r.settle)}</strong></span></td>
    </tr>`)}</tbody></table></div>`;
}

export const shareholdersPage = {
  path: '/shareholders',
  title: 'nav.shareholders',
  perm: 'acc.shareholders',
  mount(el) {
    let data = null;
    async function load() {
      try {
        data = (await read('shareholders.view')).data;
        render(el, html`
          <section class="panel"><h2 class="section-title">${t('sh.accounts')}</h2><p class="help">${t('sh.accounts_help')}</p>${statementsView(data.statements)}</section>
          <section class="panel"><h2 class="section-title">${t('sh.shares')}</h2>
            ${data.history.length ? html`<ul class="punches">${data.history.map((h) => html`<li class="punch"><span><strong>${t('sh.from_date', { date: day(h.from) })}</strong>
              <span class="muted">${h.shares.map((x) => `${x.name} ${x.percent}%`).join(' · ')}</span></span></li>`)}</ul>` : emptyState(t('sh.no_shares'))}
            ${can('closing.month') ? html`<div class="form-actions"><button type="button" class="btn" data-act="shares">${t('sh.change_shares')}</button></div>` : ''}</section>
          <section class="panel"><h2 class="section-title">${t('sh.loans')}</h2><p class="help">${t('sh.loans_help')}</p>
            ${data.loans.length ? html`<ul class="punches">${data.loans.map((l) => html`<li class="punch"><span><strong>${l.number} · ${l.name}</strong>
              <span class="muted">${t(l.direction === 'given' ? 'sh.given' : 'sh.taken')} · ${t('sh.rate_line', { rate: l.rate })} · ${t('sh.balance', { amount: money(l.balance) })}</span></span>
              ${l.status === 'open' ? '' : chip(t('sh.closed'), 'muted')}
              ${can('acc.loans') ? html`<button type="button" class="btn btn-small" data-act="loan" data-id="${l.id}">${t('common.edit')}</button>` : ''}</li>`)}</ul>` : emptyState(t('sh.no_loans'))}
            ${can('acc.loans') ? html`<div class="form-actions"><button type="button" class="btn" data-act="loan">${t('sh.add_loan')}</button></div>` : ''}</section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      shares: () => sharesDialog(data, load),
      loan: (e, btn) => loanDialog(btn.dataset.id ? data.loans.find((l) => l.id === btn.dataset.id) : null, data, load),
    });
    const offArea = onArea('money', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
    };
  },
};
