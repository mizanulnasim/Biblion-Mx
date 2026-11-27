// Settings → Shop: the shop's name, description, address, phone and email,
// as they appear on the letterhead of letters, payslips and reports.

import { html, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { getState, setState } from '../core/state.js';
import { letterhead } from '../ui/letterhead.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

export const settingsShopPage = {
  path: '/settings/shop',
  title: 'nav.settings_shop',
  perm: 'settings.manage',
  mount(el) {
    render(el, html`<div aria-busy="true"></div>`);
    const draw = (data) => {
      render(el, html`<section class="panel">${formView({
        submit: t('common.save'),
        values: data,
        fields: [
          { name: 'name', label: t('shop.name'), required: true },
          { name: 'tagline', label: t('shop.tagline'), help: t('shop.tagline_help') },
          { name: 'address', label: t('shop.address'), type: 'textarea' },
          { name: 'phone', label: t('shop.phone'), inputmode: 'tel' },
          { name: 'email', label: t('shop.email'), inputmode: 'email' },
        ],
      })}</section>
        <section class="panel"><h2 class="section-title">${t('shop.preview')}</h2><article class="doc">${letterhead()}</article></section>`);
      el.querySelector('textarea').rows = 2;
      bindForm(el.querySelector('form'), {
        schema: ACTIONS['settings.shop.save'].schema,
        busyLabel: t('common.saving'),
        onSubmit: (v) => write('settings.shop.save', v),
        onSaved: (reply) => {
          setState({ meta: { ...getState().meta, shop: reply.data } });
          toast(t('setup.saved'));
          draw(reply.data);
        },
      });
    };
    read('settings.shop').then(({ data }) => draw(data)).catch((err) => render(el, errorBox(errorText(err))));
  },
};
