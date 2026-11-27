// Letters: one person's letters (issuing an offer, appointment, experience
// or release letter from the templates), a letter as a printable document
// on the letterhead, and Settings → Letters.

import { html, on, render } from '../ui/html.js';
import { emptyState, errorBox, staleNotice } from '../ui/feedback.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { dateShort } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { PLACEHOLDERS } from '../../../shared/hr/letters.js';

export const LETTER_LABEL = Object.freeze({
  offer: 'letters.kind.offer', appointment: 'letters.kind.appointment', experience: 'letters.kind.experience', release: 'letters.kind.release',
});
// Offer and appointment letters are for staff.edit; the leaving letters
// need separation.manage and a last day.
const LETTER_PERM = { offer: 'staff.edit', appointment: 'staff.edit', experience: 'separation.manage', release: 'separation.manage' };

export const staffLettersPage = {
  path: '/staff/letters',
  title: 'nav.letters',
  perm: 'staff.view',
  mount(el, { query }) {
    async function load() {
      try {
        const { data } = await read('letters.list', { staff_id: query.id });
        const kinds = Object.keys(LETTER_LABEL).filter((k) => can(LETTER_PERM[k]) && (LETTER_PERM[k] === 'staff.edit' || data.staff.left_on));
        render(el, html`<section class="panel"><h2 class="section-title">${data.staff.name}</h2>
          ${kinds.length ? html`<div class="form-actions">${kinds.map((k) => html`<button type="button" class="btn" data-act="issue" data-kind="${k}">${t('letters.issue', { kind: t(LETTER_LABEL[k]) })}</button>`)}</div>` : ''}
          ${data.items.length ? html`<ul class="punches">${data.items.map((l) => html`<li class="punch">
            <a href="#/letter?id=${l.id}"><strong>${l.title}</strong></a> <span class="muted">${dateShort(l.issued_at)}</span></li>`)}</ul>` : emptyState(t('letters.none'))}
        </section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      issue: async (e, btn) => {
        const reply = await write('letters.issue', { staff_id: query.id, kind: btn.dataset.kind });
        if (reply.status === 'saved') {
          toast(t('letters.issued'));
          location.hash = `#/letter?id=${reply.record_id}`;
        } else if (reply.status === 'rejected') toast(t(errorMessageId(reply.error.code), reply.error.params), 'error');
      },
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return offClick;
  },
};

export const letterPage = {
  path: '/letter',
  title: 'nav.letters',
  perm: 'staff.view|self.staff',
  mount(el, { query }) {
    read('letters.get', { id: query.id }).then(({ data, cachedAt }) => {
      render(el, html`${staleNotice(cachedAt)}
        <div class="list-bar no-print"><button type="button" class="btn btn-primary" data-act="print">${t('pay.print')}</button></div>
        <article class="doc letter">
          <header class="doc-head">
            <img class="doc-logo" src="assets/biblion-logo.png" alt="Biblion">
            ${data.shop_address ? html`<p class="muted doc-address">${data.shop_address}</p>` : ''}
          </header>
          <h2 class="doc-title">${data.title}</h2>
          ${data.paragraphs.map((p) => html`<p class="letter-text">${p}</p>`)}
        </article>`);
    }).catch((err) => render(el, errorBox(errorText(err))));
    return on(el, 'click', { print: () => window.print() });
  },
};

export const settingsLettersPage = {
  path: '/settings/letters',
  title: 'nav.settings_letters',
  perm: 'settings.manage',
  mount(el) {
    render(el, html`<div aria-busy="true"></div>`);
    read('settings.letters').then(({ data }) => {
      const text = (name, label) => ({ name, label: t(label), type: 'textarea', required: true });
      render(el, html`<section class="panel">
        <p class="help">${t('letters.help')}</p>
        <p class="help"><code>${PLACEHOLDERS.map((p) => `{{${p}}}`).join('  ')}</code></p>
        ${formView({
          submit: t('common.save'),
          values: data,
          fields: [
            { name: 'shop_address', label: t('letters.shop_address'), type: 'textarea', help: t('letters.shop_address_help') },
            text('offer', 'letters.kind.offer'),
            text('appointment', 'letters.kind.appointment'),
            text('experience', 'letters.kind.experience'),
            { name: 'conduct', label: t('letters.conduct'), help: t('letters.conduct_help') },
            text('release', 'letters.kind.release'),
          ],
        })}</section>`);
      for (const area of el.querySelectorAll('textarea')) area.rows = area.name === 'shop_address' ? 2 : 10;
      bindForm(el.querySelector('form'), {
        schema: ACTIONS['settings.letters.save'].schema,
        busyLabel: t('common.saving'),
        onSubmit: (v) => write('settings.letters.save', v),
        onSaved: () => toast(t('setup.saved')),
      });
    }).catch((err) => render(el, errorBox(errorText(err))));
  },
};
