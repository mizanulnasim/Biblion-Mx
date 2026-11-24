// Saved on this phone: entries made without a connection, waiting to be
// sent. Each can be sent now, answered (when the server asked a question),
// or removed.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { confirmDialog, formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { dateShortTime } from '../core/format.js';
import { queueItems, removeItem, retryItem, sendQueue } from '../core/api.js';
import { getState, subscribe } from '../core/state.js';
import { errorMessageId } from '../../../shared/contract/errors.js';

const STATUS = {
  pending: ['saved.waiting', 'muted'],
  sending: ['saved.sending', 'muted'],
  needs_input: ['saved.needs_input', 'warn'],
  failed: ['saved.failed', 'danger'],
};

const REASON_SCHEMA = { reason: { type: 'text', required: true, max: 500 } };

function itemView(item) {
  const [statusLabel, tone] = STATUS[item.status];
  const problem = item.status === 'failed' && item.last_error
    ? t(errorMessageId(item.last_error.code), item.last_error.params)
    : '';
  return html`<li class="card">
    <div class="card-head">
      <strong>${item.label || item.action}</strong>
      ${chip(t(statusLabel), tone)}
    </div>
    <p class="muted">${t('saved.made_at', { time: dateShortTime(new Date(item.created_at).toISOString()) })}</p>
    ${item.prompt ? html`<ul class="warnings">${(item.prompt.warnings || []).map((w) => html`<li>${t(w.code, w.params)}</li>`)}</ul>` : ''}
    ${problem ? html`<p class="field-error">${problem}</p>` : ''}
    <div class="card-actions">
      ${item.status === 'needs_input'
        ? html`<button type="button" class="btn btn-primary" data-act="answer" data-id="${item.op_id}">${t('saved.answer')}</button>`
        : html`<button type="button" class="btn" data-act="send" data-id="${item.op_id}">${t('saved.send_now')}</button>`}
      <button type="button" class="btn btn-danger-quiet" data-act="remove" data-id="${item.op_id}">${t('saved.remove')}</button>
    </div>
  </li>`;
}

export const savedPage = {
  path: '/saved',
  title: 'nav.saved',
  mount(el) {
    let items = [];
    render(el, html`
      <p class="intro">${t('saved.intro')}</p>
      <div class="list-bar"><button type="button" class="btn btn-primary" data-act="send-all">${t('saved.send_all')}</button></div>
      <div class="saved-notice"></div>
      <ul class="cards"></ul>`);
    const list = el.querySelector('.cards');
    const notice = el.querySelector('.saved-notice');
    const sendAll = el.querySelector('[data-act="send-all"]');

    async function draw() {
      items = await queueItems();
      sendAll.hidden = !items.length;
      render(list, items.length ? items.map(itemView) : html`<li>${emptyState(t('saved.empty'))}</li>`);
    }

    async function send(button) {
      if (!getState().online) {
        render(notice, errorBox(t('saved.offline')));
        return;
      }
      render(notice, '');
      await whileBusy(button, t('saved.sending'), async () => {
        try {
          const report = await sendQueue();
          if (report && report.sent) toast(t('sync.sent', { count: report.sent }));
        } catch (err) {
          render(notice, errorBox(errorText(err)));
        }
      });
      await draw();
    }

    function answer(item) {
      const dialog = formDialog(t('saved.answer_title'), formView({
        fields: [{ name: 'reason', label: t('saved.reason'), help: t('saved.reason_help'), required: true }],
        submit: t('saved.send_now'),
      }));
      bindForm(dialog.querySelector('form.form'), {
        schema: REASON_SCHEMA,
        busyLabel: t('saved.sending'),
        onSubmit: async ({ reason }) => {
          await retryItem(item.op_id, { ...item.payload, reason });
          return { status: 'saved' };
        },
        onSaved: async () => {
          dialog.close();
          await draw();
        },
      });
    }

    const find = (btn) => items.find((i) => i.op_id === btn.dataset.id);
    const off = on(el, 'click', {
      'send-all': (e, btn) => send(btn),
      send: async (e, btn) => {
        await retryItem(btn.dataset.id);
        await draw();
      },
      answer: (e, btn) => answer(find(btn)),
      remove: async (e, btn) => {
        const item = find(btn);
        const ok = await confirmDialog({
          title: t('saved.remove_title'),
          body: t('saved.remove_body', { label: item.label || item.action }),
          ok: t('saved.remove'),
          tone: 'danger',
        });
        if (!ok) return;
        await removeItem(item.op_id);
        await draw();
      },
    });
    const unsubscribe = subscribe(() => draw());
    draw();
    return () => {
      off();
      unsubscribe();
    };
  },
};
