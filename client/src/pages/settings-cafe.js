// Settings → Café: who confirms a manager's café order, how early expiry is
// warned, and how many days of counts a suggestion needs.

import { html, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

export const settingsCafePage = {
  path: '/settings/cafe',
  title: 'nav.settings_cafe',
  perm: 'settings.manage',
  mount(el) {
    render(el, html`<div aria-busy="true"></div>`);
    read('settings.cafe').then(({ data }) => {
      render(el, html`<section class="panel">${formView({
        submit: t('common.save'),
        values: { approve: data.approve, expiry_warn_days: String(data.expiry_warn_days), min_history_days: String(data.min_history_days) },
        fields: [
          { name: 'approve', label: t('settings.cafe_approve'), type: 'select', required: true, options: [{ value: 'final', label: t('approvals.final') }, { value: 'shareholder', label: t('approvals.shareholder') }] },
          { name: 'expiry_warn_days', label: t('settings.cafe_warn'), inputmode: 'numeric', required: true, help: t('settings.cafe_warn_help') },
          { name: 'min_history_days', label: t('settings.cafe_history'), inputmode: 'numeric', required: true, help: t('settings.cafe_history_help') },
        ],
      })}</section>`);
      bindForm(el.querySelector('form'), {
        schema: ACTIONS['settings.cafe.save'].schema,
        busyLabel: t('common.saving'),
        onSubmit: (v) => write('settings.cafe.save', v),
        onSaved: () => toast(t('setup.saved')),
      });
    }).catch((err) => render(el, errorBox(errorText(err))));
  },
};
