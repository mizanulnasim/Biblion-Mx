// Settings → Books: when requisitions are drafted automatically, and how
// far back a first requisition looks at sales.

import { html, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

export const settingsBooksPage = {
  path: '/settings/books',
  title: 'nav.settings_books',
  perm: 'settings.books',
  mount(el) {
    render(el, html`<div aria-busy="true"></div>`);
    read('settings.books').then(({ data }) => {
      render(el, html`<section class="panel">${formView({
        submit: t('common.save'),
        values: { req_auto: data.req_auto, req_days: String(data.req_days) },
        fields: [
          {
            name: 'req_auto', label: t('settings.req_auto'), type: 'select', required: true, help: t('settings.req_auto_help'),
            options: [{ value: 'off', label: t('settings.req_off') }, { value: 'weekly', label: t('settings.req_weekly') }, { value: 'monthly', label: t('settings.req_monthly') }],
          },
          { name: 'req_days', label: t('settings.req_days'), inputmode: 'numeric', required: true, help: t('settings.req_days_help') },
        ],
      })}</section>`);
      bindForm(el.querySelector('form'), {
        schema: ACTIONS['settings.books.save'].schema,
        busyLabel: t('common.saving'),
        onSubmit: (v) => write('settings.books.save', v),
        onSaved: () => toast(t('setup.saved')),
      });
    }).catch((err) => render(el, errorBox(errorText(err))));
  },
};
