// Typed book sales for a day: title, copies, amount (filled from the
// selling price). Can be saved on the phone offline. Below, what was typed
// for that day.

import { html, on, render } from '../ui/html.js';
import { emptyState, errorBox } from '../ui/feedback.js';
import { bindForm, errorText } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { dateShort, money, today } from '../core/format.js';
import { markDirty } from '../core/router.js';
import { bookList, findBook } from './books-common.js';

const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;
const emptyLine = () => ({ book: '', qty: '1', amount: '' });

function lineRow(l, i) {
  const id = (f) => `f-lines.${i}.${f}`;
  return html`<div class="sale-row">
    <div class="field line-title"><label for="${id('book')}">${t('books.title')}</label>
      <input id="${id('book')}" name="lines.${i}.book" list="book-titles" value="${l.book}" autocomplete="off"></div>
    <div class="field"><label for="${id('qty')}">${t('books.copies')}</label>
      <input id="${id('qty')}" name="lines.${i}.qty" inputmode="numeric" value="${l.qty}" aria-describedby="${id('qty')}-err"><p class="field-error" id="${id('qty')}-err"></p></div>
    <div class="field"><label for="${id('amount')}">${t('books.amount')}</label>
      <input id="${id('amount')}" name="lines.${i}.amount" inputmode="decimal" value="${l.amount}" aria-describedby="${id('amount')}-err"><p class="field-error" id="${id('amount')}-err"></p></div>
    <button type="button" class="icon-btn" data-act="remove-line" data-i="${i}" aria-label="${t('books.remove_line')}">×</button>
  </div>`;
}

export const bookSalesPage = {
  path: '/books/sales',
  title: 'books.sales_title',
  perm: 'books.sell',
  mount(el, { query }) {
    const date = query.date || today();
    let boot = null;
    let lines = [emptyLine()];
    let opId = crypto.randomUUID();

    function collect(form) {
      const out = [];
      for (const input of form.elements) {
        const m = /^lines\.(\d+)\.(\w+)$/.exec(input.name || '');
        if (m) {
          out[Number(m[1])] = out[Number(m[1])] || {};
          out[Number(m[1])][m[2]] = input.value;
        }
      }
      return out.filter(Boolean);
    }

    async function drawDay() {
      const slot = el.querySelector('.day-sales');
      try {
        const { data } = await read('books.sales.day', { date });
        render(slot, data.items.length ? html`
          <ul class="moves">${data.items.map((m) => html`<li><span>${m.title}</span><span>${m.qty} · ${money(m.amount)}</span></li>`)}</ul>
          <p><strong>${t('books.day_total', { total: money(data.total) })}</strong></p>` : emptyState(t('books.no_sales_day')));
      } catch (err) {
        render(slot, errorBox(errorText(err)));
      }
    }

    function draw() {
      render(el, html`
        ${bookList(boot.books, boot.publishers)}
        <div class="list-bar"><label class="field-inline">${t('money.field.date')} <input type="date" value="${date}" max="${today()}" data-role="date"></label></div>
        <form class="form panel" novalidate>
          <div class="lines">${lines.map(lineRow)}</div>
          <!-- Where "add at least one title" is shown. -->
          <input type="hidden" name="lines"><p class="field-error" id="f-lines-err"></p>
          <button type="button" class="btn btn-small" data-act="add-line">${t('books.add_line')}</button>
          <p class="sales-total"></p>
          <div class="form-error" role="alert"></div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">${t('books.save_sales')}</button></div>
        </form>
        <section class="panel"><h2 class="section-title">${t('books.typed_on', { date: dateShort(date) })}</h2><div class="day-sales" aria-busy="true"></div></section>`);
      el.querySelector('[data-role="date"]').addEventListener('change', (e) => {
        if (e.target.value) location.hash = `#/books/sales?date=${e.target.value}`;
      });
      const form = el.querySelector('form');
      const total = () => render(form.querySelector('.sales-total'), t('books.sales_total', { total: money(lines.reduce((s, l) => s + num(l.amount), 0)) }));
      total();
      form.addEventListener('input', () => {
        lines = collect(form);
        total();
      });
      // A title or a change of copies fills the amount from the selling price.
      form.addEventListener('change', (e) => {
        lines = collect(form);
        const m = /^lines\.(\d+)\.(book|qty)$/.exec(e.target.name || '');
        if (m) {
          const line = lines[Number(m[1])];
          const book = findBook(line.book, boot.books, boot.publishers);
          if (book) {
            line.amount = String(book.price * (num(line.qty) || 1));
            form.elements[`lines.${m[1]}.amount`].value = line.amount;
          }
        }
        total();
      });
      on(form, 'click', {
        'add-line': () => {
          lines = collect(form);
          lines.push(emptyLine());
          draw();
          markDirty(el.querySelector('form'), true);
        },
        'remove-line': (e, btn) => {
          lines = collect(form);
          lines.splice(Number(btn.dataset.i), 1);
          if (!lines.length) lines.push(emptyLine());
          draw();
        },
      });
      bindForm(form, {
        schema: {},
        busyLabel: t('common.saving'),
        mapValues: () => {
          const typed = collect(form).filter((l) => l.book);
          // A title that isn't in the catalogue can't be sold; it is named in the message.
          const unknown = typed.find((l) => !findBook(l.book, boot.books, boot.publishers));
          return {
            date,
            unknown: unknown ? unknown.book : '',
            lines: typed.filter((l) => l !== unknown).map((l) => ({ book_id: findBook(l.book, boot.books, boot.publishers).id, qty: l.qty, amount: l.amount })),
          };
        },
        onSubmit: async ({ unknown, ...payload }) => {
          if (unknown) return { status: 'rejected', error: { code: 'VALIDATION', params: {}, fields: { lines: { code: 'books.unknown_title', params: { title: unknown } } } } };
          return write('books.sales.save', payload, { opId, label: t('books.sales_label', { date: dateShort(date) }) });
        },
        onSaved: (reply) => {
          toast(reply.status === 'queued' ? t('money.saved_on_phone') : t('books.sales_saved'));
          lines = [emptyLine()];
          opId = crypto.randomUUID();
          draw();
        },
      });
      drawDay();
    }

    render(el, html`<div aria-busy="true"></div>`);
    (async () => {
      try {
        boot = (await read('books.boot')).data;
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    })();
  },
};
