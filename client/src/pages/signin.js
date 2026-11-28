// Sign-in, and the one-time first-owner setup shown before anyone exists.

import { html, render } from '../ui/html.js';
import { formView, bindForm } from '../ui/form.js';
import { t } from '../core/i18n.js';
import { write } from '../core/api.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

function frame(title, intro, form) {
  return html`
    <div class="auth">
      <div class="auth-card">
        <img class="auth-logo" src="assets/biblion-logo.png" alt="Biblion">
        <h1 class="auth-title">${title}</h1>
        ${intro ? html`<p class="muted">${intro}</p>` : ''}
        ${form}
      </div>
    </div>`;
}

export function showSignIn(root, { onSignedIn }) {
  render(root, frame(t('signin.title'), '', formView({
    submit: t('signin.submit'),
    fields: [
      { name: 'username', label: t('signin.username'), autocomplete: 'username', required: true },
      { name: 'password', label: t('signin.password'), type: 'password', autocomplete: 'current-password', required: true },
    ],
  })));
  bindForm(root.querySelector('form'), {
    schema: ACTIONS['auth.login'].schema,
    busyLabel: t('signin.busy'),
    guard: false,
    onSubmit: (values) => write('auth.login', values),
    onSaved: (reply) => onSignedIn(reply.data),
  });
}

export function showSetup(root, { onDone }) {
  render(root, frame(t('setup.title'), t('setup.intro'), formView({
    submit: t('setup.submit'),
    fields: [
      { name: 'code', label: t('setup.code'), help: t('setup.code_help'), required: true },
      { name: 'display_name', label: t('setup.name'), autocomplete: 'name', required: true },
      { name: 'username', label: t('signin.username'), help: t('setup.username_help'), autocomplete: 'username', required: true },
      { name: 'password', label: t('signin.password'), type: 'password', help: t('setup.password_help'), autocomplete: 'new-password', required: true },
    ],
  })));
  bindForm(root.querySelector('form'), {
    schema: ACTIONS['setup.owner'].schema,
    busyLabel: t('setup.busy'),
    guard: false,
    onSubmit: (values) => write('setup.owner', values),
    onSaved: () => onDone(),
  });
}
