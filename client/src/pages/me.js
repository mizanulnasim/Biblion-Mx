// My settings: language, theme and accent colour (kept with the person, so
// they follow them to any device), and changing the password.

import { html, render } from '../ui/html.js';
import { bindForm, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { getLang, t } from '../core/i18n.js';
import { write } from '../core/api.js';
import { can, device, getState, setState } from '../core/state.js';
import { applyLook } from '../core/look.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

function displayForm(settings) {
  return formView({
    submit: t('common.save'),
    values: settings,
    fields: [
      { name: 'lang', label: t('me.language'), type: 'select', options: [{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }] },
      {
        name: 'theme', label: t('me.theme'), type: 'select',
        options: [
          { value: 'system', label: t('me.theme_system') },
          { value: 'light', label: t('me.theme_light') },
          { value: 'dark', label: t('me.theme_dark') },
        ],
      },
      { name: 'accent', label: t('me.accent'), type: 'color', help: t('me.accent_help') },
    ],
  });
}

function passwordForm() {
  return formView({
    submit: t('me.change_password'),
    fields: [
      { name: 'current', label: t('me.current_password'), type: 'password', autocomplete: 'current-password', required: true },
      { name: 'next', label: t('me.new_password'), type: 'password', help: t('setup.password_help'), autocomplete: 'new-password', required: true },
    ],
  });
}

export const mePage = {
  path: '/me',
  title: 'nav.me',
  mount(el) {
    const draw = () => {
      render(el, html`
        <section class="panel"><h2 class="section-title">${t('me.display')}</h2><div data-slot="display">${displayForm(getState().meta.settings)}</div></section>
        <section class="panel"><h2 class="section-title">${t('me.password')}</h2>
          ${can('me.password') ? html`<div data-slot="password">${passwordForm()}</div>` : html`<p>${t('me.password_ask')}</p>`}</section>`);

      bindForm(el.querySelector('[data-slot="display"] form'), {
        schema: ACTIONS['me.settings'].schema,
        busyLabel: t('common.saving'),
        onSubmit: (values) => write('me.settings', values),
        onSaved: (reply) => {
          const meta = reply.data;
          setState({ meta });
          device.set('meta', meta);
          applyLook(meta.settings);
          if (meta.settings.lang !== getLang()) {
            // The app starts again in the new language.
            device.set('lang', meta.settings.lang);
            location.reload();
            return;
          }
          toast(t('me.saved'));
        },
      });

      // Only for people allowed to change their own password.
      const pw = el.querySelector('[data-slot="password"] form');
      if (!pw) return;
      bindForm(pw, {
        schema: ACTIONS['auth.password'].schema,
        busyLabel: t('common.saving'),
        onSubmit: (values) => write('auth.password', values),
        onSaved: () => {
          pw.reset();
          toast(t('me.password_changed'));
        },
      });
    };
    draw();
  },
};
