// Settings → Reading documents: whether the optional Gemini key is used for
// receipts and bills, and the key itself (kept on the server, never shown).

import { html, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

export const settingsIntakePage = {
  path: '/settings/intake',
  title: 'nav.settings_intake',
  perm: 'settings.manage',
  mount(el) {
    const draw = (data) => {
      render(el, html`<p class="intro">${t('settings.intake_intro')}</p><section class="panel">${formView({
        submit: t('common.save'),
        values: { ai: data.ai },
        fields: [
          { name: 'ai', label: t('settings.ai'), type: 'select', required: true, options: [{ value: 'off', label: t('settings.ai_off') }, { value: 'bills', label: t('settings.ai_bills') }] },
          { name: 'key', label: t('settings.ai_key'), type: 'password', autocomplete: 'off', help: data.has_key ? t('settings.ai_key_set') : t('settings.ai_key_help') },
          ...(data.has_key ? [{ name: 'clear_key', label: t('settings.ai_key_clear'), type: 'checkbox' }] : []),
        ],
      })}</section>`);
      bindForm(el.querySelector('form'), {
        schema: ACTIONS['settings.intake.save'].schema,
        busyLabel: t('common.saving'),
        mapValues: (v) => ({ ai: v.ai, key: v.key || null, clear_key: Boolean(v.clear_key) }),
        onSubmit: (v) => write('settings.intake.save', v),
        onSaved: (reply) => {
          toast(t('setup.saved'));
          draw(reply.data);
        },
      });
    };
    render(el, html`<div aria-busy="true"></div>`);
    read('settings.intake').then(({ data }) => draw(data)).catch((err) => render(el, errorBox(errorText(err))));
  },
};
