// My settings: language, theme and accent colour (kept with the person, so
// they follow them to any device), and changing the password.

import { html, render } from '../ui/html.js';
import { bindForm, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { getLang, t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
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

// My details: the staff number, and phone, email and address; a change
// waits for a manager.
function detailsView(d) {
  return html`<section class="panel"><h2 class="section-title">${t('me.details')}</h2>
    ${d.number ? html`<p>${t('me.staff_number', { number: d.number })}</p>` : ''}
    ${d.waiting ? html`<p class="notice notice-warn">${t('me.details_waiting')}</p>` : ''}
    ${d.rejected ? html`<p class="notice">${t('me.details_rejected', { note: d.rejected.decide_note })}</p>` : ''}
    ${d.allowed ? formView({
      submit: t('me.details_send'),
      values: d.waiting || d,
      fields: [
        { name: 'phone', label: t('setup.phone'), inputmode: 'tel' },
        { name: 'email', label: t('shop.email'), inputmode: 'email' },
        { name: 'address', label: t('hr.address'), type: 'textarea' },
      ],
    }) : html`<p class="muted">${t('me.details_ask')}</p>`}</section>`;
}

function mountDetails(slot) {
  const draw = (d) => {
    render(slot, detailsView(d));
    const form = slot.querySelector('form.form');
    if (!form) return;
    bindForm(form, {
      schema: ACTIONS['staff.my_details.save'].schema,
      busyLabel: t('common.saving'),
      mapValues: (v) => ({ ...v, email: v.email || null }),
      onSubmit: (v) => write('staff.my_details.save', v, { label: t('me.details') }),
      onSaved: (reply) => {
        toast(t(reply.status === 'queued' ? 'me.details_queued' : 'me.details_sent'));
        read('staff.my_details').then((r) => draw(r.data));
      },
    });
  };
  read('staff.my_details').then((r) => draw(r.data)).catch(() => render(slot, ''));
}

export const mePage = {
  path: '/me',
  title: 'nav.me',
  mount(el) {
    const draw = () => {
      render(el, html`
        <section class="panel"><h2 class="section-title">${t('me.display')}</h2><div data-slot="display">${displayForm(getState().meta.settings)}</div></section>
        ${can('self.staff') ? html`<div data-slot="details"></div>` : ''}
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

      if (can('self.staff')) mountDetails(el.querySelector('[data-slot="details"]'));

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
