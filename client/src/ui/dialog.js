// Dialogs use the native <dialog>: they stack, and Escape closes only the top one.
// Closing a dialog whose form has unsaved changes asks first.

import { html, render } from './html.js';
import { t } from '../core/i18n.js';
import { isDirty, markDirty } from '../core/router.js';

function openDialog(content, { onClose } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'dialog';
  render(dialog, content);
  document.body.append(dialog);
  dialog.addEventListener('cancel', async (e) => {
    const form = dialog.querySelector('form:not([method="dialog"])');
    if (!form || !isDirty(form)) return;
    e.preventDefault();
    if (await confirmDialog({ title: t('guard.title'), body: t('guard.body'), ok: t('guard.leave'), tone: 'danger' })) {
      markDirty(form, false);
      dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    for (const form of dialog.querySelectorAll('form')) markDirty(form, false);
    dialog.remove();
    if (onClose) onClose(dialog.returnValue);
  });
  dialog.showModal();
  return dialog;
}

// Resolves true when the person confirms.
export function confirmDialog({ title, body, ok, tone = 'primary' }) {
  return new Promise((resolve) => {
    openDialog(html`
      <form method="dialog" class="dialog-body">
        <h2 class="dialog-title">${title}</h2>
        <p>${body}</p>
        <div class="dialog-actions">
          <button class="btn" value="cancel">${t('common.cancel')}</button>
          <button class="btn btn-${tone}" value="ok" autofocus>${ok}</button>
        </div>
      </form>`, { onClose: (value) => resolve(value === 'ok') });
  });
}

// A dialog holding a form: title, the form, and a close button.
export function formDialog(title, formContent) {
  const dialog = openDialog(html`
    <div class="dialog-body">
      <div class="dialog-head">
        <h2 class="dialog-title">${title}</h2>
        <button type="button" class="icon-btn" data-role="close" aria-label="${t('common.close')}">×</button>
      </div>
      ${formContent}
    </div>`);
  // The close button goes through the same check as Escape.
  dialog.querySelector('[data-role="close"]').addEventListener('click', () => {
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
  });
  // A link to another page closes the dialog as it goes.
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('a[href^="#"]')) dialog.close();
  });
  return dialog;
}
