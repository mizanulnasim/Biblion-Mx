// What every checklist page shares (server/kernel/steps.js): the button
// that ticks a step done or not, who ticked it, and the reason asked for
// when going ahead without a required step.

import { html } from './html.js';
import { whileBusy } from './form.js';
import { toast } from './toast.js';
import { t } from '../core/i18n.js';
import { write } from '../core/api.js';
import { dateShortTime } from '../core/format.js';

export function tickButton(list, ref, step) {
  return html`<button type="button" class="btn btn-small" data-act="tick" data-list="${list}" data-ref="${ref}" data-step="${step.id}" data-done="${step.state === 'done' ? '' : '1'}">
    ${t(step.state === 'done' ? 'steps.untick' : 'steps.tick')}</button>`;
}

export const tickedBy = (step) => (step.by ? html`<span class="muted">${t('steps.ticked_by', { name: step.by, time: dateShortTime(step.at) })}</span>` : '');

// For on(el, 'click', {tick: …}).
export function onTick(btn, reload) {
  return whileBusy(btn, t('common.saving'), async () => {
    try {
      const reply = await write('steps.tick', { list: btn.dataset.list, ref: btn.dataset.ref, step: btn.dataset.step, done: Boolean(btn.dataset.done) });
      if (reply.status === 'saved') await reload();
    } catch (err) {
      toast(t('err.server'), 'error');
    }
  });
}

// Asked only when required steps are left: why go ahead without them.
export function skipField(count) {
  return count ? [{ name: 'skip_reason', label: t('steps.skip_reason'), type: 'textarea', required: true, help: t('steps.skip_help', { count }) }] : [];
}
