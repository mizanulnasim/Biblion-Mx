// One money entry: its details, why it waits, its corrections, and what the
// person may do with it (approve, correct, cancel with a reason).

import { html, on, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { dateShort, dateShortTime, money } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { details, kindLabel, reasonTexts, stateChip } from './money-common.js';

const DIRECTIONS = { in: 'money.direction.in', out: 'money.direction.out' };

function row(label, value) {
  return value ? html`<dt>${label}</dt><dd>${value}</dd>` : '';
}

function detailsView({ entry: e, history, can }) {
  return html`
    <dl class="details">
      ${row(t('money.field.state'), stateChip(e))}
      ${row(t('money.field.date'), dateShort(e.date))}
      ${row(t('money.field.amount'), money(e.amount))}
      ${row(t('money.field.details'), details(e))}
      ${row(t('money.field.direction'), e.direction ? t(DIRECTIONS[e.direction]) : '')}
      ${row(t('money.field.note'), e.note)}
      ${row(t('money.field.ref'), e.ref)}
      ${row(t('money.field.entered_by'), t('money.by_at', { name: e.entered_by_name, time: dateShortTime(e.created_at) }))}
      ${e.approved_by ? row(t('money.field.approved_by'), t('money.by_at', { name: e.approved_by, time: dateShortTime(e.approved_at) })) : ''}
      ${row(t('money.field.dup_reason'), e.dup_reason)}
      ${e.cancelled_by ? row(t('money.field.cancelled'), t('money.cancelled_line', { name: e.cancelled_by, time: dateShortTime(e.cancelled_at), reason: e.cancel_reason })) : ''}
      ${e.status === 'cancelled' && e.replaced_by ? row(t('money.field.turned_into'), html`<code>${e.replaced_by}</code>`) : ''}
      ${e.status === 'replaced' ? row(t('money.field.corrected_by'), html`<code>${e.replaced_by}</code>`) : ''}
      ${row(t('money.field.id'), html`<code>${e.id}</code>`)}
    </dl>
    ${e.status === 'active' && e.approval === 'waiting' ? html`<div class="notice notice-warn"><div>
      <strong>${t('money.waits_because')}</strong>
      <ul class="reasons">${reasonTexts(e.wait_reasons).map((r) => html`<li>${r}</li>`)}</ul></div></div>` : ''}
    ${history.length ? html`<h3 class="section-title">${t('money.history')}</h3>
      <ul class="history">${history.map((h) => html`<li>${dateShort(h.date)} · ${kindLabel(h.kind)} · ${money(h.amount)} · ${details(h)} <code>${h.id}</code></li>`)}</ul>` : ''}
    <div class="entry-error"></div>
    <div class="dialog-actions">
      ${can.change ? html`<button type="button" class="btn btn-danger-quiet" data-act="cancel">${t('money.cancel_entry')}</button>
        <a class="btn" href="#/money/new?replaces=${e.id}" data-act="correct">${t('money.correct')}</a>` : ''}
      ${can.approve ? html`<button type="button" class="btn btn-primary" data-act="approve">${t('money.approve')}</button>` : ''}
    </div>`;
}

function askReason(entry) {
  return new Promise((resolve) => {
    const dialog = formDialog(t('money.cancel_title'), formView({
      submit: t('money.cancel_entry'),
      fields: [{ name: 'reason', label: t('money.cancel_reason'), type: 'textarea', required: true, help: t('money.cancel_help') }],
    }));
    let done = false;
    dialog.addEventListener('close', () => {
      if (!done) resolve(false);
    });
    bindForm(dialog.querySelector('form.form'), {
      schema: ACTIONS['money.cancel'].schema,
      busyLabel: t('common.saving'),
      onSubmit: ({ reason }) => write('money.cancel', { id: entry.id, reason }),
      onSaved: () => {
        done = true;
        dialog.close();
        resolve(true);
      },
    });
  });
}

// Opens the entry; onChanged runs after it was approved or cancelled.
export function openEntry(id, onChanged) {
  const dialog = formDialog(t('money.entry_title'), html`<div class="entry-body" aria-busy="true"></div>`);
  const body = dialog.querySelector('.entry-body');
  let current = null;

  async function load() {
    try {
      const { data } = await read('money.get', { id });
      current = data;
      dialog.querySelector('.dialog-title').textContent = `${kindLabel(data.entry.kind)} · ${money(data.entry.amount)}`;
      render(body, detailsView(data));
    } catch (err) {
      render(body, errorBox(errorText(err)));
    } finally {
      body.removeAttribute('aria-busy');
    }
  }

  on(body, 'click', {
    approve: (e, btn) => whileBusy(btn, t('common.saving'), async () => {
      try {
        const reply = await write('money.approve', { id });
        if (reply.status === 'saved') {
          toast(t('money.approved'));
          dialog.close();
          onChanged();
        } else {
          render(body.querySelector('.entry-error'), errorBox(t(errorMessageId(reply.error.code), reply.error.params)));
        }
      } catch (err) {
        render(body.querySelector('.entry-error'), errorBox(errorText(err)));
      }
    }),
    cancel: async () => {
      if (await askReason(current.entry)) {
        toast(t('money.cancelled'));
        dialog.close();
        onChanged();
      }
    },
    correct: () => dialog.close(),
  });
  load();
}
