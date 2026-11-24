// Forms: fields drawn from a list, checked with the same rules the server
// uses, errors marked on each field, a busy submit button, and a message
// that stays when saving fails. Edited forms are reported to the router, so
// leaving the page asks first.

import { html } from './html.js';
import { t } from '../core/i18n.js';
import { markDirty } from '../core/router.js';
import { validate } from '../../../shared/lib/validate.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { ApiError } from '../core/api.js';

// field: {name, label, type: text|password|select|color, options:[{value,label}],
//         help, autocomplete, required}
function fieldView(f, value) {
  const id = `f-${f.name}`;
  const describedBy = `${f.help ? `${id}-help ` : ''}${id}-err`;
  const control = f.type === 'select'
    ? html`<select id="${id}" name="${f.name}" aria-describedby="${describedBy}">
        ${f.options.map((o) => html`<option value="${o.value}" ${String(o.value) === String(value) ? 'selected' : ''}>${o.label}</option>`)}
      </select>`
    : html`<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${value ?? ''}"
        autocomplete="${f.autocomplete || 'off'}" ${f.required ? 'required' : ''} aria-describedby="${describedBy}">`;
  return html`<div class="field">
    <label for="${id}">${f.label}${f.required ? '' : html` <span class="optional">${t('form.optional')}</span>`}</label>
    ${control}
    ${f.help ? html`<p class="help" id="${id}-help">${f.help}</p>` : ''}
    <p class="field-error" id="${id}-err"></p>
  </div>`;
}

export function formView({ fields, values = {}, submit }) {
  return html`<form class="form" novalidate>
    ${fields.map((f) => fieldView(f, values[f.name]))}
    <div class="form-error" role="alert"></div>
    <div class="form-actions"><button type="submit" class="btn btn-primary">${submit}</button></div>
  </form>`;
}

function markFields(form, fields) {
  for (const el of form.querySelectorAll('.field-error')) el.textContent = '';
  for (const el of form.querySelectorAll('[aria-invalid]')) el.removeAttribute('aria-invalid');
  let first = null;
  for (const [name, err] of Object.entries(fields || {})) {
    const input = form.elements[name];
    const slot = form.querySelector(`#f-${name}-err`);
    if (!input || !slot) continue;
    input.setAttribute('aria-invalid', 'true');
    slot.textContent = t(err.code, err.params);
    first = first || input;
  }
  if (first) first.focus();
  return Boolean(first);
}

export function errorText(err) {
  if (err instanceof ApiError) return t(errorMessageId(err.code), err.params);
  return t('err.server');
}

// Turns a button off with a busy label while `work` runs, then back on.
export async function whileBusy(button, busyLabel, work) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    return await work();
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = label;
    }
  }
}

// schema: the action's payload rules; only fields present in the form are
//   checked here, and the server checks everything again.
// onSubmit(values) returns a write reply or throws.
// onSaved(reply) runs after a saved reply.
// guard: false for forms that need no unsaved-changes warning (sign-in).
export function bindForm(form, { schema, busyLabel, onSubmit, onSaved, guard = true, mapValues = (v) => v }) {
  const errorSlot = form.querySelector('.form-error');
  const button = form.querySelector('[type="submit"]');
  if (guard) form.addEventListener('input', () => markDirty(form, true));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    const raw = {};
    for (const el of form.elements) if (el.name) raw[el.name] = el.value;
    const values = mapValues(raw);
    const checked = {};
    for (const key of Object.keys(schema)) if (key in raw) checked[key] = schema[key];
    errorSlot.textContent = '';
    if (markFields(form, validate(checked, values).fields)) return;
    await whileBusy(button, busyLabel || t('common.busy'), async () => {
      try {
        const reply = await onSubmit(values);
        if (reply.status === 'rejected') {
          if (!markFields(form, reply.error.fields)) errorSlot.textContent = t(errorMessageId(reply.error.code), reply.error.params);
          return;
        }
        markDirty(form, false);
        if (onSaved) await onSaved(reply);
      } catch (err) {
        errorSlot.textContent = errorText(err);
      }
    });
  });
}
