// Settings → Payroll: the day the accounting month starts, when a salary is
// overdue, how a day's pay is worked out, and the food allowance (a rate a
// day from each date on, and which days earn it).

import { html, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

// Saved rates plus empty rows for new ones.
const SPARE_ROWS = 2;

export const settingsPayrollPage = {
  path: '/settings/payroll',
  title: 'nav.settings_payroll',
  perm: 'settings.manage',
  mount(el) {
    render(el, html`<div aria-busy="true"></div>`);
    read('settings.payroll').then(({ data }) => {
      const rows = data.food_rates.length + SPARE_ROWS;
      const values = { divisor: data.divisor, food_rule: data.food_rule, month_start_day: String(data.month_start_day), overdue_days: String(data.overdue_days), start_date: data.start_date };
      data.food_rates.forEach((r, i) => {
        values[`rate_from_${i}`] = r.from;
        values[`rate_amount_${i}`] = String(r.amount);
      });
      const rateFields = [];
      for (let i = 0; i < rows; i++) {
        rateFields.push(
          { name: `rate_from_${i}`, label: t('pay.set.rate_from', { n: i + 1 }), type: 'date' },
          { name: `rate_amount_${i}`, label: t('pay.set.rate_amount'), inputmode: 'decimal' },
        );
      }
      render(el, html`<section class="panel">${formView({
        submit: t('common.save'),
        values,
        fields: [
          { name: 'month_start_day', label: t('pay.set.month_start'), inputmode: 'numeric', required: true, help: t('pay.set.month_start_help') },
          { name: 'overdue_days', label: t('pay.set.overdue_days'), inputmode: 'numeric', required: true },
          { name: 'start_date', label: t('pay.set.start_date'), type: 'date', help: t('pay.set.start_date_help') },
          { name: 'divisor', label: t('pay.set.divisor'), type: 'select', required: true, help: t('pay.set.divisor_help'), options: [{ value: 'period_days', label: t('pay.set.divisor_month') }, { value: 'fixed_30', label: t('pay.set.divisor_30') }] },
          {
            name: 'food_rule', label: t('pay.set.food_rule'), type: 'select', required: true,
            options: [{ value: 'every_day', label: t('pay.set.food_every') }, { value: 'skip_unpaid', label: t('pay.set.food_skip_unpaid') }, { value: 'worked_days', label: t('pay.set.food_worked') }],
          },
          ...rateFields,
        ],
        extra: html`<p class="help">${t('pay.set.rates_help')}</p>`,
      })}</section>`);
      bindForm(el.querySelector('form'), {
        schema: ACTIONS['settings.payroll.save'].schema,
        busyLabel: t('common.saving'),
        mapValues: (v) => {
          const rates = [];
          for (let i = 0; i < rows; i++) if (v[`rate_from_${i}`]) rates.push({ from: v[`rate_from_${i}`], amount: v[`rate_amount_${i}`] || 0 });
          return { divisor: v.divisor, food_rule: v.food_rule, food_rates: rates, month_start_day: v.month_start_day, overdue_days: v.overdue_days, start_date: v.start_date || null };
        },
        onSubmit: (v) => write('settings.payroll.save', v),
        onSaved: () => toast(t('setup.saved')),
      });
    }).catch((err) => render(el, errorBox(errorText(err))));
  },
};
