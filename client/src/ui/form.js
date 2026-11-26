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

const optionView = (o, value) => html`<option value="${o.value}" ${String(o.value) === String(value ?? '') ? 'selected' : ''} ${o.disabled ? 'disabled' : ''}>${o.label}</option>`;

function controlView(f, id, value, describedBy) {
  if (f.type === 'select') {
    return html`<select id="${id}" name="${f.name}" aria-describedby="${describedBy}">
      ${f.placeholder ? html`<option value="" ${value ? '' : 'selected'}>${f.placeholder}</option>` : ''}
      ${f.groups
        ? f.groups.map((g) => html`<optgroup label="${g.label}">${g.options.map((o) => optionView(o, value))}</optgroup>`)
        : f.options.map((o) => optionView(o, value))}
    </select>`;
  }
  if (f.type === 'textarea') {
    return html`<textarea id="${id}" name="${f.name}" rows="2" aria-describedby="${describedBy}">${value ?? ''}</textarea>`;
  }
  if (f.type === 'checkbox') {
    return html`<input id="${id}" name="${f.name}" type="checkbox" ${value ? 'checked' : ''} aria-describedby="${describedBy}">`;
  }
  return html`<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${value ?? ''}"
    ${f.inputmode ? html`inputmode="${f.inputmode}"` : ''}
    autocomplete="${f.autocomplete || 'off'}" ${f.required ? 'required' : ''} aria-describedby="${describedBy}">`;
}

// field: {name, label, type: text|password|date|select|textarea|checkbox|color,
//         options:[{value,label,disabled}] or groups:[{label, options}],
//         placeholder (an empty first choice), help, autocomplete, inputmode, required}
function fieldView(f, value) {
  const id = `f-${f.name}`;
  const describedBy = `${f.help ? `${id}-help ` : ''}${id}-err`;
  const control = controlView(f, id, value, describedBy);
  if (f.type === 'checkbox') {
    return html`<div class="field field-check">
      <label for="${id}">${control} ${f.label}</label>
      ${f.help ? html`<p class="help" id="${id}-help">${f.help}</p>` : ''}
      <p class="field-error" id="${id}-err"></p>
    </div>`;
  }
  return html`<div class="field">
    <label for="${id}">${f.label}${f.required ? '' : html` <span class="optional">${t('form.optional')}</span>`}</label>
    ${control}
    ${f.help ? html`<p class="help" id="${id}-help">${f.help}</p>` : ''}
    <p class="field-error" id="${id}-err"></p>
  </div>`;
}

// `extra` is drawn after the fields (for example the approval notice).
export function formView({ fields, values = {}, submit, extra = '' }) {
  return html`<form class="form" novalidate>
    ${fields.map((f) => fieldView(f, values[f.name]))}
    ${extra}
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
// onSaved(reply) runs after a saved reply, or one kept on this phone
// ('queued'). Any other status (a question the person closed) keeps the form.
// guard: false for forms that need no unsaved-changes warning (sign-in).
export function bindForm(form, { schema, busyLabel, onSubmit, onSaved, guard = true, mapValues = (v) => v }) {
  const errorSlot = form.querySelector('.form-error');
  const button = form.querySelector('[type="submit"]');
  if (guard) form.addEventListener('input', () => markDirty(form, true));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (button.disabled) return;
    const raw = {};
    for (const el of form.elements) if (el.name) raw[el.name] = el.type === 'checkbox' ? el.checked : el.value;
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
        if (reply.status !== 'saved' && reply.status !== 'queued') return;
        markDirty(form, false);
        if (onSaved) await onSaved(reply);
      } catch (err) {
        errorSlot.textContent = errorText(err);
      }
    });
  });
}
