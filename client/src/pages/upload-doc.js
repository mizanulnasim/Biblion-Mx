// The check screen for one uploaded document. The scan is shown beside what
// the app prepared. First the person says what the document is; then they
// check the prepared entry (the app lists what it was unsure of, and which
// approval rule the entry falls under), and one Confirm creates it under the
// normal checks and files the document on it. A possible duplicate offers
// to file the document on the earlier entry instead.

import { html, on, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, fieldView, formView } from '../ui/form.js';
import { dataUrl } from '../ui/files.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { money, today } from '../core/format.js';
import { isDirty, markDirty } from '../core/router.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { INTAKE_KINDS } from '../../../shared/intake/kinds.js';
import { approvalNotice, duplicateDialog, fieldsFor } from './money-form.js';
import { kindLabel } from './money-common.js';
import { openEntry } from './money-entry.js';
import { bookLabel, bookList, findBook } from './books-common.js';
import { intakeChip } from './upload.js';

const UNSURE = {
  date: 'intake.unsure.date', amount: 'intake.unsure.amount', party: 'intake.unsure.party', ref: 'intake.unsure.ref',
  lines: 'intake.unsure.lines', new_titles: 'intake.unsure.new_titles',
};
const PAID = { now: 'intake.paid_now', later: 'intake.paid_later' };
const MONEY_FIELDS = ['kind', 'date', 'amount', 'account_id', 'to_account_id', 'category_id', 'party_id', 'ref', 'note'];

function scanView(doc, url) {
  if (!doc.file) return '';
  if (doc.file.mime.startsWith('image/')) return html`<img class="scan-img" src="${url}" alt="${doc.file.name}">`;
  if (doc.file.mime === 'application/pdf') return html`<iframe class="scan-pdf" src="${url}" title="${doc.file.name}"></iframe>`;
  return html`<pre class="scan-text">${doc.text}</pre>`;
}

function kindStep(doc) {
  return html`<section class="panel"><h2 class="section-title">${t('intake.what_is_it')}</h2>
    <p class="help">${t('intake.what_help')}</p>
    <div class="kind-grid">${Object.keys(INTAKE_KINDS).map((k) => html`<button type="button" class="btn kind-btn ${doc.guess === k ? 'btn-primary' : ''}" data-act="kind" data-kind="${k}">
      ${t(INTAKE_KINDS[k].label)}${doc.guess === k ? html`<span class="kind-guess">${t('intake.looks_like')}</span>` : ''}</button>`)}</div></section>`;
}

function unsureView(proposal) {
  const items = (proposal.unsure || []).map((u) => t(UNSURE[u]));
  if (proposal.paid) items.unshift(t(PAID[proposal.paid]));
  if (proposal.delivery && proposal.delivery.discount) items.push(t('intake.discount_seen', { amount: money(proposal.delivery.discount) }));
  return items.length ? html`<div class="notice notice-warn"><div><strong>${t('intake.check_these')}</strong><ul class="reasons">${items.map((i) => html`<li>${i}</li>`)}</ul></div></div>` : '';
}

function resultView(doc) {
  const records = (doc.result && doc.result.records) || [];
  return html`<section class="panel">
    <h2 class="section-title">${intakeChip(doc.status)}</h2>
    ${doc.status === 'discarded' ? html`<p>${t('intake.discarded_because', { reason: doc.discard_reason })}</p>` : ''}
    ${records.length ? html`<ul class="moves">${records.map((r) => html`<li><span>${t(r.type === 'money' ? 'intake.made_money' : 'intake.made_delivery')} <code>${r.id}</code></span>
      ${r.type === 'money' ? html`<button type="button" class="btn btn-small" data-act="open-entry" data-id="${r.id}">${t('shift.open')}</button>` : html`<a class="btn btn-small" href="#/books/deliveries">${t('nav.deliveries')}</a>`}</li>`)}</ul>` : ''}
    ${doc.status === 'confirmed' && !records.length ? html`<p>${t('intake.kept_only')}</p>` : ''}
    <div class="form-actions"><a class="btn btn-primary" href="#/upload">${t('intake.another')}</a></div>
  </section>`;
}

export const uploadDocPage = {
  path: '/upload/doc',
  title: 'intake.check_title',
  perm: 'intake.upload',
  mount(el, { query }) {
    let doc = null;
    let boot = null;
    let books = null;
    let scanUrl = '';
    let values = null;

    function moneyForm(slot) {
      const def = INTAKE_KINDS[doc.kind];
      const fields = fieldsFor(values.kind, boot).filter((f) => MONEY_FIELDS.includes(f.name) && f.name !== 'note');
      fields[0].groups = fields[0].groups.map((g) => ({ ...g, options: g.options.filter((o) => def.kinds.includes(o.value)) })).filter((g) => g.options.length);
      const old = slot.querySelector('form');
      const wasDirty = Boolean(old && isDirty(old));
      if (old) markDirty(old, false);
      render(slot, formView({
        fields: [...fields, { name: 'note', label: t('money.field.note'), type: 'textarea' }],
        values,
        submit: t('intake.confirm'),
        extra: html`<div class="approval-slot" aria-live="polite">${approvalNotice(values, boot)}</div>`,
      }));
      const form = slot.querySelector('form');
      if (wasDirty) markDirty(form, true);
      const current = () => {
        const v = { ...values };
        for (const input of form.elements) if (input.name) v[input.name] = input.value;
        return v;
      };
      form.addEventListener('change', (e) => {
        values = current();
        if (e.target.name === 'kind') moneyForm(slot);
      });
      form.addEventListener('input', () => {
        values = current();
        render(form.querySelector('.approval-slot'), approvalNotice(values, boot));
      });
      bindForm(form, {
        schema: ACTIONS['intake.confirm'].schema,
        busyLabel: t('common.saving'),
        mapValues: (raw) => {
          const out = { id: doc.id };
          for (const f of MONEY_FIELDS) if (raw[f]) out[f] = raw[f];
          return out;
        },
        onSubmit: (payload) => confirm(payload),
        onSaved: () => {
          toast(t('intake.confirmed'));
          load();
        },
      });
    }

    function deliveryForm(slot) {
      const f = (spec) => fieldView(spec, values[spec.name]);
      render(slot, html`${bookList(books.books, books.publishers)}<form class="form" novalidate>
        <div class="pair">
          ${f({ name: 'publisher_id', label: t('books.publisher'), type: 'select', required: true, placeholder: t('money.choose'), options: books.publishers.map((p) => ({ value: p.id, label: p.name })) })}
          ${f({ name: 'date', label: t('money.field.date'), type: 'date', required: true })}
          ${f({ name: 'challan', label: t('books.challan') })}
        </div>
        <div class="lines">${values.lines.map((l, i) => html`<div class="sale-row">
          <div class="field line-title"><label for="f-lines.${i}.book">${t('books.title')}</label>
            <input id="f-lines.${i}.book" name="lines.${i}.book" list="book-titles" value="${l.book}" autocomplete="off">
            <p class="help">${findBook(l.book, books.books, books.publishers) ? t('books.line_existing', { on_hand: findBook(l.book, books.books, books.publishers).on_hand }) : t('books.line_new')}</p></div>
          <div class="field"><label for="f-lines.${i}.printed_price">${t('books.printed_price')}</label><input id="f-lines.${i}.printed_price" name="lines.${i}.printed_price" inputmode="decimal" value="${l.printed_price}"></div>
          <div class="field"><label for="f-lines.${i}.qty">${t('books.copies')}</label><input id="f-lines.${i}.qty" name="lines.${i}.qty" inputmode="numeric" value="${l.qty}"></div>
          <button type="button" class="icon-btn" data-act="remove-line" data-i="${i}" aria-label="${t('books.remove_line')}">×</button>
        </div>`)}</div>
        <input type="hidden" name="lines"><p class="field-error" id="f-lines-err"></p>
        <div class="pair">
          ${f({ name: 'paid', label: t('books.paid'), inputmode: 'decimal' })}
          ${f({ name: 'paid_account_id', label: t('money.field.from_account'), type: 'select', placeholder: t('money.choose'), options: boot.accounts.map((a) => ({ value: a.id, label: a.name })) })}
        </div>
        <div class="challan-attach"></div>
        <div class="form-error" role="alert"></div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">${t('intake.confirm')}</button></div>
      </form>`);
      const form = slot.querySelector('form');
      const collect = () => {
        const v = { ...values, lines: [] };
        for (const input of form.elements) {
          const m = /^lines\.(\d+)\.(\w+)$/.exec(input.name || '');
          if (m) {
            v.lines[Number(m[1])] = v.lines[Number(m[1])] || {};
            v.lines[Number(m[1])][m[2]] = input.value;
          } else if (input.name && input.name !== 'lines') {
            v[input.name] = input.value;
          }
        }
        v.lines = v.lines.filter(Boolean);
        return v;
      };
      form.addEventListener('input', () => markDirty(form, true));
      on(form, 'click', {
        'remove-line': (e, btn) => {
          values = collect();
          values.lines.splice(Number(btn.dataset.i), 1);
          deliveryForm(slot);
        },
        'attach-challan': (e, btn) => attach(btn.dataset.id),
      });
      bindForm(form, {
        schema: {},
        busyLabel: t('common.saving'),
        mapValues: () => {
          values = collect();
          const out = {
            id: doc.id, date: values.date, publisher_id: values.publisher_id || null, challan: values.challan || null,
            lines: values.lines.filter((l) => l.book).map((l) => {
              const book = findBook(l.book, books.books, books.publishers);
              return { book_id: book ? book.id : null, title: book ? null : l.book, printed_price: l.printed_price, qty: l.qty };
            }),
          };
          if (values.paid) Object.assign(out, { paid: values.paid, paid_account_id: values.paid_account_id || null });
          return out;
        },
        onSubmit: async (payload) => {
          const reply = await write('intake.confirm', payload);
          // The same challan came before: offer to file the document on that delivery.
          const dup = reply.status === 'rejected' && reply.error.fields && reply.error.fields.challan;
          render(form.querySelector('.challan-attach'), dup && dup.code === 'dup.challan'
            ? html`<button type="button" class="btn" data-act="attach-challan" data-id="${dup.params.id}">${t('intake.attach_delivery')}</button>` : '');
          return reply;
        },
        onSaved: () => {
          toast(t('intake.confirmed'));
          load();
        },
      });
    }

    async function attach(recordId) {
      const reply = await write('intake.attach', { id: doc.id, record_id: recordId });
      if (reply.status === 'saved') {
        toast(t('intake.attached'));
        load();
      }
      return reply;
    }

    // Sends the entry; a duplicate question is answered with a reason, a
    // fix, or by filing the document on the earlier entry.
    async function confirm(payload) {
      let body = payload;
      for (;;) {
        const reply = await write('intake.confirm', body);
        if (reply.status !== 'needs_input') return reply;
        const answer = await duplicateDialog(reply.prompt, { attach: true });
        if (!answer) return { status: 'closed' };
        if (answer.attach) {
          await attach(answer.attach);
          return { status: 'closed' };
        }
        if (answer.fix) {
          if (!INTAKE_KINDS[doc.kind].kinds.includes(answer.fix.kind)) {
            toast(t('intake.fix_other_kind', { kind: kindLabel(answer.fix.kind) }), 'error');
            return { status: 'closed' };
          }
          const figures = { ...answer.fix };
          delete figures.pair_id;
          values = { ...values, ...figures, amount: String(figures.amount) };
          moneyForm(el.querySelector('.entry-slot'));
          return { status: 'closed' };
        }
        body = { ...payload, reason: answer.reason };
      }
    }

    function draw() {
      const ready = doc.status === 'ready';
      const target = doc.kind ? INTAKE_KINDS[doc.kind].target : '';
      render(el, html`
        <div class="doc-check">
          <section class="panel scan"><div class="panel-head"><h2 class="section-title">${doc.file ? doc.file.name : ''}</h2>${intakeChip(doc.status)}</div>
            <p class="muted">${t('intake.uploaded_by', { name: doc.uploaded_by })}${doc.ai_used ? html` · ${t('intake.ai_used')}` : ''}</p>
            <div class="scan-view">${scanView(doc, scanUrl)}</div>
            ${doc.text && doc.file && doc.file.mime.startsWith('image/') ? html`<details><summary>${t('intake.read_text')}</summary><pre class="scan-text">${doc.text}</pre></details>` : ''}
          </section>
          <div class="check-side">
            ${doc.status === 'needs_kind' ? kindStep(doc) : ''}
            ${ready ? html`<section class="panel">
              <div class="panel-head"><h2 class="section-title">${t(INTAKE_KINDS[doc.kind].label)}</h2>
                <button type="button" class="btn btn-small" data-act="change-kind">${t('intake.change_kind')}</button></div>
              ${unsureView(doc.proposal)}
              <div class="entry-slot"></div>
            </section>` : ''}
            ${ready || doc.status === 'needs_kind' ? html`<div class="form-actions"><button type="button" class="btn btn-danger-quiet" data-act="discard">${t('intake.discard')}</button></div>` : ''}
            ${!ready && doc.status !== 'needs_kind' ? resultView(doc) : ''}
          </div>
        </div>`);
      if (!ready) return;
      const slot = el.querySelector('.entry-slot');
      if (target === 'money') {
        const e = doc.proposal.entry;
        values = values || { ...e, amount: e.amount ? String(e.amount) : '', date: e.date || today(), note: '' };
        moneyForm(slot);
      } else if (target === 'delivery') {
        const d = doc.proposal.delivery;
        const names = new Map(books.publishers.map((p) => [p.id, p.name]));
        values = values || {
          ...d, date: d.date || today(),
          lines: d.lines.map((l) => {
            const book = l.book_id ? books.books.find((b) => b.id === l.book_id) : null;
            return { book: book ? bookLabel({ ...book, publisher: names.get(book.publisher_id) }) : l.title, printed_price: String(l.printed_price), qty: String(l.qty) };
          }),
        };
        deliveryForm(slot);
      } else {
        render(slot, html`<p>${t('intake.keep_help')}</p><div class="form-actions"><button type="button" class="btn btn-primary" data-act="keep">${t('intake.keep')}</button></div>`);
      }
    }

    async function load() {
      try {
        [doc, boot, books] = await Promise.all([
          read('intake.get', { id: query.id }).then((r) => r.data),
          read('money.boot').then((r) => r.data),
          read('books.boot').then((r) => r.data).catch(() => ({ books: [], publishers: [] })),
        ]);
        values = null;
        draw();
        if (doc.file && !scanUrl) {
          const { data } = await read('files.get', { id: doc.file.id });
          scanUrl = dataUrl(data.mime, data.data);
          const view = el.querySelector('.scan-view');
          if (view) render(view, scanView(doc, scanUrl));
        }
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }

    const off = on(el, 'click', {
      kind: async (e, btn) => {
        const reply = await write('intake.kind', { id: doc.id, kind: btn.dataset.kind });
        if (reply.status === 'saved') load();
      },
      'change-kind': () => {
        doc = { ...doc, status: 'needs_kind' };
        draw();
      },
      keep: async () => {
        const reply = await write('intake.confirm', { id: doc.id, date: today() });
        if (reply.status === 'saved') load();
      },
      'open-entry': (e, btn) => openEntry(btn.dataset.id, load),
      discard: () => {
        const dialog = formDialog(t('intake.discard'), formView({ submit: t('intake.discard'), fields: [{ name: 'reason', label: t('books.reason'), type: 'textarea', required: true }] }));
        bindForm(dialog.querySelector('form.form'), {
          schema: ACTIONS['intake.discard'].schema,
          busyLabel: t('common.saving'),
          mapValues: (v) => ({ ...v, id: doc.id }),
          onSubmit: (v) => write('intake.discard', v),
          onSaved: () => {
            dialog.close();
            load();
          },
        });
      },
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      off();
      if (scanUrl) URL.revokeObjectURL(scanUrl);
    };
  },
};

