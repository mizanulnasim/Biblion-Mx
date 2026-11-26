// Settings → Approvals: when a manager's money entry waits for a shareholder.

import { html, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

const RULES = [
  { name: 'expense', label: 'approvals.expense' },
  { name: 'income', label: 'approvals.income' },
  { name: 'transfer', label: 'approvals.transfer' },
  { name: 'other', label: 'approvals.other' },
];

function form(settings) {
  const choices = [{ value: 'final', label: t('approvals.final') }, { value: 'shareholder', label: t('approvals.shareholder') }];
  return formView({
    submit: t('common.save'),
    values: { limit: String(settings.limit), ...settings.rules },
    fields: [
      { name: 'limit', label: t('approvals.limit'), inputmode: 'decimal', required: true, help: t('approvals.limit_help') },
      ...RULES.map((r) => ({ name: r.name, label: t(r.label), type: 'select', required: true, options: choices })),
    ],
  });
}

export const approvalsPage = {
  path: '/settings/approvals',
  title: 'nav.approvals',
  perm: 'settings.manage',
  mount(el) {
    render(el, html`<div aria-busy="true"></div>`);
    (async () => {
      try {
        const { data } = await read('settings.approvals');
        render(el, html`<p class="intro">${t('approvals.intro')}</p><section class="panel">${form(data)}</section>`);
        bindForm(el.querySelector('form'), {
          schema: ACTIONS['settings.approvals.save'].schema,
          busyLabel: t('common.saving'),
          onSubmit: (values) => write('settings.approvals.save', values),
          onSaved: () => toast(t('approvals.saved')),
        });
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    })();
  },
};
