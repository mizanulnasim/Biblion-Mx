// Getting started (shareholders): the day the app's records start, then
// each kind of opening figure in order. Each step opens the screen where
// its figures are entered; a step the app can't see for itself is ticked
// done here.

import { html, on, render } from '../ui/html.js';
import { chip, errorBox } from '../ui/feedback.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { dateShort } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { onTick, tickButton, tickedBy } from '../ui/steps.js';

const TITLE = {
  date: 'start.step.date', accounts: 'start.step.accounts', shareholders: 'start.step.shareholders', dues: 'start.step.dues',
  suppliers: 'start.step.suppliers', advances: 'start.step.advances', leave: 'start.step.leave', stock: 'start.step.stock', cafe: 'start.step.cafe',
};
const HELP = {
  date: 'start.help.date', accounts: 'start.help.accounts', shareholders: 'start.help.shareholders', dues: 'start.help.dues',
  suppliers: 'start.help.suppliers', advances: 'start.help.advances', leave: 'start.help.leave', stock: 'start.help.stock', cafe: 'start.help.cafe',
};

function stateChip(step) {
  if (step.done) return chip(t('month.done'), 'ok');
  if (step.info.waiting) return chip(t('start.waiting'), 'warn');
  return chip(t('month.todo'), 'muted');
}

function stepView(step, n, startDate) {
  return html`<li class="check-item">
    <span>${stateChip(step)} <strong>${n}. ${t(TITLE[step.id])}</strong></span>
    <span class="help">${t(HELP[step.id])}</span>
    ${step.info.count !== undefined ? html`<span class="muted">${t('start.count', { count: step.info.count })}</span>` : ''}
    ${step.id === 'date' ? html`<div class="start-date">${formView({
      submit: t('common.save'),
      values: { start_date: startDate },
      fields: [{ name: 'start_date', label: t('pay.set.start_date'), type: 'date', required: true }],
    })}</div>` : html`<div class="check-actions">
      <a class="btn btn-small" href="#${step.path}">${t('start.open')}</a>
      ${step.manual ? html`${tickedBy(step)} ${tickButton('start', '', step)}` : ''}
    </div>`}
  </li>`;
}

export const startPage = {
  path: '/start',
  title: 'nav.start',
  perm: 'acc.setup',
  mount(el) {
    async function load() {
      try {
        const { data } = await read('start.view');
        render(el, html`<p class="intro">${t('start.intro')}</p>
          <section class="panel">
            <div class="panel-head"><h2 class="section-title">${t('start.progress', { done: data.done, total: data.steps.length })}</h2>
              ${data.start_date ? html`<span class="muted">${t('start.as_of', { date: dateShort(data.start_date) })}</span>` : ''}</div>
            <ol class="waiting-list">${data.steps.map((s, i) => stepView(s, i + 1, data.start_date))}</ol>
          </section>`);
        bindForm(el.querySelector('.start-date form'), {
          schema: ACTIONS['start.date.save'].schema,
          busyLabel: t('common.saving'),
          onSubmit: (v) => write('start.date.save', v),
          onSaved: () => {
            toast(t('setup.saved'));
            load();
          },
        });
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const off = on(el, 'click', {
      tick: (e, btn) => onTick(btn, load),
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return off;
  },
};
