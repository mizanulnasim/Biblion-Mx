// Requisitions to publishers: the list, and one requisition. A draft's
// copies can be changed, titles added or taken out; sending it fixes it
// and offers the list as text (to copy or share by WhatsApp). A sent
// requisition shows what has arrived and what is still expected, and what
// is left can be closed with a reason.

import { html, on, render } from '../ui/html.js';
import { chip, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { mountList } from '../ui/list.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { dateShort } from '../core/format.js';
import { isDirty, markDirty } from '../core/router.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { bookList, findBook } from './books-common.js';

const REQ_STATES = {
  draft: ['req.state.draft', 'muted'], sent: ['req.state.sent', 'warn'], part: ['req.state.part', 'warn'],
  received: ['req.state.received', 'ok'], closed: ['req.state.closed', 'muted'],
};

const reqChip = (status) => chip(t(REQ_STATES[status][0]), REQ_STATES[status][1]);

function newRequisition(publishers) {
  const dialog = formDialog(t('req.new'), formView({
    submit: t('req.build'),
    fields: [{ name: 'publisher_id', label: t('books.publisher'), type: 'select', required: true, placeholder: t('money.choose'), options: publishers.map((p) => ({ value: p.id, label: p.name })), help: t('req.build_help') }],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['books.req.build'].schema,
    busyLabel: t('common.saving'),
    onSubmit: (v) => write('books.req.build', v),
    onSaved: (reply) => {
      dialog.close();
      location.hash = `#/books/req?id=${reply.record_id}`;
    },
  });
}

export const requisitionsPage = {
  path: '/books/reqs',
  title: 'nav.requisitions',
  perm: 'books.view',
  mount(el) {
    let publishers = [];
    read('books.boot').then(({ data }) => {
      publishers = data.publishers;
    }).catch(() => {});
    const list = mountList(el, {
      key: 'reqs',
      action: 'books.reqs',
      area: 'books',
      searchLabel: t('req.search'),
      empty: t('req.empty'),
      emptySearch: t('list.no_match'),
      filters: [{ name: 'status', label: t('money.filter.all_states'), options: Object.keys(REQ_STATES).map((k) => ({ value: k, label: t(REQ_STATES[k][0]) })) }],
      tools: can('books.requisition') ? html`<button type="button" class="btn btn-primary" data-act="tool" data-tool="new">${t('req.new')}</button>` : '',
      columns: [
        { label: t('req.number'), cell: (r) => r.number, kind: 'nowrap code' },
        { label: t('money.field.date'), cell: (r) => dateShort(r.date), kind: 'nowrap' },
        { label: t('books.publisher'), cell: (r) => r.publisher },
        { label: t('books.copies'), cell: (r) => t('req.copies_line', { titles: r.titles, copies: r.copies, received: r.received }), kind: 'nowrap' },
        { label: t('money.field.state'), cell: (r) => reqChip(r.status), kind: 'nowrap' },
      ],
      onRow: (r) => {
        location.hash = `#/books/req?id=${r.id}`;
      },
      onTool: () => newRequisition(publishers),
    });
    return () => list.destroy();
  },
};

// The requisition as text: what WhatsApp or an email gets.
function asText(r) {
  const lines = r.lines.filter((l) => l.qty > 0).map((l, i) => `${i + 1}. ${l.title} × ${l.qty}`);
  return [t('req.text_head', { number: r.number, publisher: r.publisher, date: dateShort(r.date) }), ...lines, t('req.text_foot')].join('\n');
}

function draftRow(l, i) {
  return html`<div class="req-row">
    <input type="hidden" name="lines.${i}.key" value="${l.key || ''}">
    <div class="field line-title"><label for="f-lines.${i}.title">${t('books.title')}</label>
      ${l.key ? html`<input id="f-lines.${i}.title" value="${l.title}" readonly>${l.special_order_ids && l.special_order_ids.length ? html`<p class="help">${t('req.has_orders', { count: l.special_order_ids.length })}</p>` : ''}`
        : html`<input id="f-lines.${i}.title" name="lines.${i}.title" list="book-titles" value="${l.title || ''}" autocomplete="off">`}</div>
    <div class="field"><label for="f-lines.${i}.qty">${t('books.copies')}</label>
      <input id="f-lines.${i}.qty" name="lines.${i}.qty" inputmode="numeric" value="${l.qty}" aria-describedby="f-lines.${i}.qty-err"><p class="field-error" id="f-lines.${i}.qty-err"></p></div>
    <button type="button" class="icon-btn" data-act="remove" data-i="${i}" aria-label="${t('books.remove_line')}">×</button>
  </div>`;
}

function sentView(r) {
  return html`<div class="list-body"><table class="table">
    <thead><tr><th scope="col">${t('books.title')}</th><th scope="col">${t('req.asked')}</th><th scope="col">${t('req.received')}</th><th scope="col">${t('req.not_coming')}</th><th scope="col">${t('req.expected')}</th></tr></thead>
    <tbody>${r.lines.map((l) => html`<tr>
      <td data-label="${t('books.title')}"><span>${l.title}</span></td>
      <td data-label="${t('req.asked')}" class="num"><span>${l.qty}</span></td>
      <td data-label="${t('req.received')}" class="num"><span>${l.received || 0}</span></td>
      <td data-label="${t('req.not_coming')}" class="num"><span>${l.cancelled || 0}</span></td>
      <td data-label="${t('req.expected')}" class="num"><span><strong>${l.remaining}</strong></span></td></tr>`)}</tbody>
  </table></div>`;
}

export const requisitionPage = {
  path: '/books/req',
  title: 'req.title',
  perm: 'books.view',
  mount(el, { query }) {
    let req = null;
    let boot = null;
    let lines = [];

    function collect(form) {
      const out = [];
      for (const input of form.elements) {
        const m = /^lines\.(\d+)\.(\w+)$/.exec(input.name || '');
        if (m) {
          out[Number(m[1])] = out[Number(m[1])] || {};
          out[Number(m[1])][m[2]] = input.value;
        }
      }
      return out.filter(Boolean).map((l) => ({ ...lines.find((x) => x.key && x.key === l.key), ...l, key: l.key || '' }));
    }

    function drawDraft(slot) {
      const old = slot.querySelector('form');
      const wasDirty = Boolean(old && isDirty(old));
      if (old) markDirty(old, false);
      render(slot, html`${bookList(boot.books.filter((b) => b.publisher_id === req.publisher_id), boot.publishers)}
        <form class="form panel" novalidate>
          <p class="help">${t('req.period', { from: dateShort(req.sales_from), to: dateShort(req.sales_to) })}</p>
          <div class="lines">${lines.map(draftRow)}</div>
          <button type="button" class="btn btn-small" data-act="add">${t('books.add_line')}</button>
          <input type="hidden" name="lines"><p class="field-error" id="f-lines-err"></p>
          <div class="form-error" role="alert"></div>
          <div class="form-actions">
            <button type="submit" class="btn">${t('req.save_draft')}</button>
            <button type="button" class="btn btn-primary" data-act="send">${t('req.send')}</button>
          </div>
        </form>`);
      const form = slot.querySelector('form');
      if (wasDirty) markDirty(form, true);
      form.addEventListener('input', () => {
        lines = collect(form);
      });
      on(form, 'click', {
        add: () => {
          lines = collect(form);
          lines.push({ key: '', title: '', qty: '1' });
          drawDraft(slot);
          markDirty(slot.querySelector('form'), true);
        },
        remove: (e, btn) => {
          lines = collect(form);
          lines.splice(Number(btn.dataset.i), 1);
          drawDraft(slot);
          markDirty(slot.querySelector('form'), true);
        },
        send: (e, btn) => whileBusy(btn, t('common.saving'), async () => {
          const errorSlot = form.querySelector('.form-error');
          try {
            const saved = await saveDraft(form);
            if (saved.status !== 'saved') return;
            const reply = await write('books.req.send', { id: req.id });
            if (reply.status !== 'saved') {
              errorSlot.textContent = t(errorMessageId(reply.error.code), reply.error.params);
              return;
            }
            toast(t('req.sent'));
            load();
          } catch (err) {
            errorSlot.textContent = errorText(err);
          }
        }),
      });
      bindForm(form, {
        schema: {},
        busyLabel: t('common.saving'),
        onSubmit: () => saveDraft(form),
        onSaved: () => {
          toast(t('req.saved'));
          load();
        },
      });
    }

    async function saveDraft(form) {
      const rows = collect(form).filter((l) => l.key || l.title);
      const payload = {
        id: req.id,
        version: req.version,
        lines: rows.map((l) => {
          const book = l.key ? null : findBook(l.title, boot.books, boot.publishers);
          return { key: l.key || null, book_id: book ? book.id : null, title: l.key ? null : l.title, qty: l.qty };
        }),
      };
      const reply = await write('books.req.save', payload);
      if (reply.status === 'saved') markDirty(form, false);
      return reply;
    }

    function draw() {
      render(el, html`
        <section class="panel">
          <div class="panel-head"><h2 class="section-title">${req.number} · ${req.publisher}</h2>${reqChip(req.status)}</div>
          <p class="muted">${t('req.meta', { date: dateShort(req.date), by: req.entered_by || t('req.automatic') })}</p>
          ${req.closed_reason ? html`<p class="notice">${t('req.closed_line', { name: req.closed_by, reason: req.closed_reason })}</p>` : ''}
          <div class="req-actions form-actions">
            ${req.status !== 'draft' ? html`<button type="button" class="btn" data-act="copy">${t('req.copy_text')}</button>
              <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(asText(req))}">${t('req.whatsapp')}</a>` : ''}
            ${(req.status === 'sent' || req.status === 'part') && can('books.receive') ? html`<a class="btn btn-primary" href="#/books/delivery?requisition=${req.id}">${t('req.record_delivery')}</a>` : ''}
            ${(req.status === 'sent' || req.status === 'part') && can('books.requisition') ? html`<button type="button" class="btn btn-danger-quiet" data-act="close">${t('req.close')}</button>` : ''}
          </div>
        </section>
        <div class="req-body"></div>`);
      const body = el.querySelector('.req-body');
      if (req.status === 'draft' && can('books.requisition')) {
        lines = req.lines.map((l) => ({ ...l, qty: String(l.qty) }));
        drawDraft(body);
      } else {
        render(body, sentView(req));
      }
    }

    async function load() {
      try {
        [req, boot] = await Promise.all([read('books.req.get', { id: query.id }).then((r) => r.data), read('books.boot').then((r) => r.data)]);
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }

    const off = on(el, 'click', {
      copy: async () => {
        await navigator.clipboard.writeText(asText(req));
        toast(t('req.copied'));
      },
      close: () => {
        const dialog = formDialog(t('req.close'), formView({ submit: t('req.close'), fields: [{ name: 'reason', label: t('books.reason'), type: 'textarea', required: true, help: t('req.close_help') }] }));
        bindForm(dialog.querySelector('form.form'), {
          schema: ACTIONS['books.req.close'].schema,
          busyLabel: t('common.saving'),
          mapValues: (v) => ({ ...v, id: req.id }),
          onSubmit: (v) => write('books.req.close', v),
          onSaved: () => {
            dialog.close();
            load();
          },
        });
      },
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return off;
  },
};
