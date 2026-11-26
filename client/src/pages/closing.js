// Day closing: the checklist for a day, closing it, and (for shareholders)
// reopening it with a reason. The last seven days show at a glance.

import { html, on, render } from '../ui/html.js';
import { chip, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { getState } from '../core/state.js';
import { dateShort, dateShortTime, money, today } from '../core/format.js';
import { onArea } from '../core/live.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

const STATE = { done: ['closing.state.done', 'ok'], todo: ['closing.state.todo', 'danger'], warn: ['closing.state.warn', 'warn'] };

function stepText(step) {
  if (step.id === 'shift') return step.state === 'done' ? t('closing.step.shift_done') : t('closing.step.shift_todo');
  if (step.id === 'drawer') {
    if (step.state === 'todo') return t('closing.step.drawer_todo');
    if (step.state === 'done') return t('closing.step.drawer_done');
    return t(step.params.short ? 'closing.step.drawer_short' : 'closing.step.drawer_over', { amount: money(step.params.amount) });
  }
  if (step.id === 'phone') return step.state === 'done' ? t('closing.step.phone_done') : t('closing.step.phone_warn', { count: step.params.count });
  return step.state === 'done' ? t('closing.step.waiting_done') : t('closing.step.waiting_warn', { count: step.params.count });
}

function stepLink(step, date) {
  if (step.id === 'shift' || step.id === 'drawer') return `#/daily?date=${date}`;
  if (step.id === 'waiting') return '#/money?state=waiting';
  return '#/saved';
}

function view(data, phoneStep) {
  const steps = [...data.steps, phoneStep];
  return html`
    <ul class="days" aria-label="${t('closing.recent')}">${data.recent.map((d) => html`<li>
      <a class="day ${d.date === data.date ? 'is-current' : ''}" href="#/closing?date=${d.date}">
        <span>${dateShort(d.date)}</span>
        ${d.closed ? chip(t('closing.closed'), 'ok') : d.shift ? chip(t('closing.open'), 'warn') : chip(t('closing.no_shift'), 'muted')}
      </a></li>`)}</ul>
    <section class="panel">
      <div class="panel-head"><h2 class="section-title">${t('closing.day_of', { date: dateShort(data.date) })}</h2>
        ${data.closed ? chip(t('closing.closed'), 'ok') : chip(t('closing.open'), 'warn')}</div>
      <ol class="checklist">${steps.map((s) => html`<li class="check check-${s.state}">
        ${chip(t(STATE[s.state][0]), STATE[s.state][1])}
        <a href="${stepLink(s, data.date)}">${stepText(s)}</a></li>`)}</ol>
      ${data.closed ? html`<p class="muted">${t('closing.closed_by', { name: data.closed.by, time: dateShortTime(data.closed.at) })}${data.closed.note ? html` · ${data.closed.note}` : ''}</p>` : ''}
      ${data.reopened ? html`<p class="notice notice-warn">${t('closing.reopened_by', { name: data.reopened.by, time: dateShortTime(data.reopened.at), reason: data.reopened.reason })}</p>` : ''}
      <div class="closing-error"></div>
      <div class="form-actions">
        ${data.can_close ? html`<button type="button" class="btn btn-primary" data-act="close">${t('closing.close')}</button>` : ''}
        ${data.can_reopen ? html`<button type="button" class="btn" data-act="reopen">${t('closing.reopen')}</button>` : ''}
      </div>
      ${!data.closed && !data.can_close ? html`<p class="help">${t('closing.cannot_close')}</p>` : ''}
    </section>`;
}

function askAndWrite(title, field, action, date, onDone) {
  const dialog = formDialog(title, formView({ submit: title, fields: [field] }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS[action].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, date }),
    onSubmit: (values) => write(action, values),
    onSaved: () => {
      dialog.close();
      onDone();
    },
  });
}

export const closingPage = {
  path: '/closing',
  title: 'nav.closing',
  perm: 'closing.day',
  mount(el, { query }) {
    const date = query.date || today();
    render(el, html`<div class="closing-body" aria-busy="true"></div>`);
    const body = el.querySelector('.closing-body');
    async function load() {
      try {
        const { data } = await read('closing.day', { date });
        // Entries still on this phone are checked here, where they are.
        const queued = getState().queued;
        const phoneStep = { id: 'phone', state: queued ? 'warn' : 'done', params: { count: queued } };
        render(body, view(data, phoneStep));
      } catch (err) {
        render(body, errorBox(errorText(err)));
      } finally {
        body.removeAttribute('aria-busy');
      }
    }
    const off = on(body, 'click', {
      close: () => askAndWrite(t('closing.close'), { name: 'note', label: t('closing.note'), type: 'textarea' }, 'closing.day.close', date, () => {
        toast(t('closing.closed_toast'));
        load();
      }),
      reopen: () => askAndWrite(t('closing.reopen'), { name: 'reason', label: t('closing.reopen_reason'), type: 'textarea', required: true, help: t('closing.reopen_help') },
        'closing.day.reopen', date, () => {
          toast(t('closing.reopened_toast'));
          load();
        }),
    });
    const offArea = onArea('money', load);
    load();
    return () => {
      off();
      offArea();
    };
  },
};
