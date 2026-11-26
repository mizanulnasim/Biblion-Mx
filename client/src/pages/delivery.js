// A delivery from a publisher, title by title: copies received, damaged
// copies sent back, and each copy's cost (printed price less the
// publisher's commission unless the challan says otherwise). A title not
// in the catalogue yet is added from here. A payment made on delivery is
// recorded as a publisher payment. Also: the list of deliveries.

import { html, on, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, fieldView } from '../ui/form.js';
import { mountList } from '../ui/list.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { dateShort, money, today } from '../core/format.js';
import { isDirty, markDirty } from '../core/router.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { bookList, findBook } from './books-common.js';

const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;
const round = (n) => Math.round(n * 100) / 100;
const emptyLine = () => ({ book: '', printed_price: '', qty: '', damaged: '', unit_cost: '' });

function lineRow(line, i, hint) {
  const id = (f) => `f-lines.${i}.${f}`;
  const input = (f, label, extra = '') => html`<div class="field"><label for="${id(f)}">${label}</label>
    <input id="${id(f)}" name="lines.${i}.${f}" value="${line[f] ?? ''}" ${extra} aria-describedby="${id(f)}-err">
    <p class="field-error" id="${id(f)}-err"></p></div>`;
  return html`<div class="line-row" data-row="${i}">
    <div class="field line-title"><label for="${id('book')}">${t('books.title')}</label>
      <input id="${id('book')}" name="lines.${i}.book" list="book-titles" value="${line.book}" autocomplete="off" aria-describedby="${id('book')}-hint">
      <p class="help" id="${id('book')}-hint">${hint}</p></div>
    ${input('printed_price', t('books.printed_price'), 'inputmode="decimal"')}
    ${input('qty', t('books.copies'), 'inputmode="numeric"')}
    ${input('damaged', t('books.damaged'), 'inputmode="numeric"')}
    ${input('unit_cost', t('books.unit_cost'), 'inputmode="decimal"')}
    <button type="button" class="icon-btn" data-act="remove-line" data-i="${i}" aria-label="${t('books.remove_line')}">×</button>
  </div>`;
}

export const deliveryPage = {
  path: '/books/delivery',
  title: 'books.delivery_title',
  perm: 'books.receive',
  mount(el) {
    let boot = null;
    let money_ = null;
    let values = { date: today(), lines: [emptyLine()] };
    const opId = crypto.randomUUID();

    const publisher = () => boot.publishers.find((p) => p.id === values.publisher_id);
    const costOf = (printed) => round(printed * (1 - ((publisher() || {}).commission || 0) / 100));

    function collect(form) {
      const v = { ...values, lines: [] };
      for (const input of form.elements) {
        // "lines" alone is only where the form's "add a title" message shows.
        if (!input.name || input.name === 'lines') continue;
        const m = /^lines\.(\d+)\.(\w+)$/.exec(input.name);
        if (m) {
          v.lines[Number(m[1])] = v.lines[Number(m[1])] || {};
          v.lines[Number(m[1])][m[2]] = input.value;
        } else {
          v[input.name] = input.value;
        }
      }
      v.lines = v.lines.filter(Boolean);
      return v;
    }

    function hintFor(line) {
      if (!line.book) return '';
      const book = findBook(line.book, boot.books, boot.publishers);
      return book ? t('books.line_existing', { on_hand: book.on_hand }) : t('books.line_new');
    }

    function totals(form) {
      let copies = 0;
      let cost = 0;
      values.lines.forEach((l, i) => {
        const accepted = Math.max(0, num(l.qty) - num(l.damaged));
        copies += accepted;
        cost += accepted * (l.unit_cost !== '' && l.unit_cost !== undefined ? num(l.unit_cost) : costOf(num(l.printed_price)));
        const costInput = form.elements[`lines.${i}.unit_cost`];
        if (costInput) costInput.placeholder = l.printed_price ? String(costOf(num(l.printed_price))) : '';
        const hint = form.querySelector(`#${CSS.escape(`f-lines.${i}.book-hint`)}`);
        if (hint) hint.textContent = hintFor(l);
      });
      render(form.querySelector('.delivery-total'), html`${t('books.delivery_total', { copies, cost: money(round(cost)) })}`);
    }

    function draw() {
      const old = el.querySelector('form');
      const wasDirty = Boolean(old && isDirty(old));
      if (old) markDirty(old, false);
      const f = (spec) => fieldView(spec, values[spec.name]);
      render(el, html`
        ${bookList(boot.books, boot.publishers)}
        <form class="form" novalidate>
          <section class="panel">
            <div class="pair">
              ${f({ name: 'publisher_id', label: t('books.publisher'), type: 'select', required: true, placeholder: t('money.choose'), options: boot.publishers.map((p) => ({ value: p.id, label: p.name })) })}
              ${f({ name: 'date', label: t('money.field.date'), type: 'date', required: true })}
              ${f({ name: 'challan', label: t('books.challan') })}
            </div>
          </section>
          <section class="panel">
            <h2 class="section-title">${t('books.lines')}</h2>
            <p class="help">${t('books.lines_help')}</p>
            <div class="lines">${values.lines.map((l, i) => lineRow(l, i, hintFor(l)))}</div>
            <p class="field-error" id="f-lines-err"></p>
            <button type="button" class="btn btn-small" data-act="add-line">${t('books.add_line')}</button>
            <p class="delivery-total"></p>
          </section>
          <section class="panel">
            <h2 class="section-title">${t('books.paid_on_delivery')}</h2>
            <div class="pair">
              ${f({ name: 'paid', label: t('books.paid'), inputmode: 'decimal' })}
              ${f({ name: 'paid_account_id', label: t('money.field.from_account'), type: 'select', placeholder: t('money.choose'), options: money_.accounts.map((a) => ({ value: a.id, label: a.name })) })}
            </div>
          </section>
          ${f({ name: 'note', label: t('money.field.note'), type: 'textarea' })}
          <!-- Where "add at least one title" is shown. -->
          <input type="hidden" name="lines">
          <div class="form-error" role="alert"></div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">${t('books.save_delivery')}</button></div>
        </form>`);
      const form = el.querySelector('form');
      if (wasDirty) markDirty(form, true);
      totals(form);
      form.addEventListener('input', () => {
        values = collect(form);
        totals(form);
      });
      form.addEventListener('change', (e) => {
        values = collect(form);
        // A title picked from the catalogue brings its printed price.
        const m = /^lines\.(\d+)\.book$/.exec(e.target.name);
        if (m) {
          const book = findBook(e.target.value, boot.books, boot.publishers);
          const line = values.lines[Number(m[1])];
          if (book && !line.printed_price) {
            line.printed_price = String(book.printed_price);
            form.elements[`lines.${m[1]}.printed_price`].value = line.printed_price;
          }
        }
        totals(form);
      });
      on(form, 'click', {
        'add-line': () => {
          values = collect(form);
          values.lines.push(emptyLine());
          draw();
          markDirty(el.querySelector('form'), true);
          const inputs = el.querySelectorAll('.line-title input');
          inputs[inputs.length - 1].focus();
        },
        'remove-line': (e, btn) => {
          values = collect(form);
          values.lines.splice(Number(btn.dataset.i), 1);
          if (!values.lines.length) values.lines.push(emptyLine());
          draw();
          markDirty(el.querySelector('form'), true);
        },
      });
      bindForm(form, {
        schema: { publisher_id: ACTIONS['books.delivery.save'].schema.publisher_id, date: ACTIONS['books.delivery.save'].schema.date },
        busyLabel: t('common.saving'),
        mapValues: () => {
          const v = collect(form);
          const lines = v.lines.filter((l) => l.book || l.qty).map((l) => {
            const book = findBook(l.book, boot.books, boot.publishers);
            const line = { printed_price: l.printed_price, qty: l.qty, damaged: l.damaged || 0 };
            if (l.unit_cost !== '') line.unit_cost = l.unit_cost;
            if (book) line.book_id = book.id;
            else line.title = l.book;
            return line;
          });
          const out = { publisher_id: v.publisher_id, date: v.date, lines };
          for (const k of ['challan', 'note', 'paid_account_id']) if (v[k]) out[k] = v[k];
          if (v.paid) out.paid = v.paid;
          return out;
        },
        onSubmit: (payload) => write('books.delivery.save', payload, { opId }),
        onSaved: (reply) => {
          toast(t('books.delivery_saved', { cost: money(reply.data.total_cost) }));
          location.hash = '#/books/deliveries';
        },
      });
    }

    render(el, html`<div aria-busy="true"></div>`);
    (async () => {
      try {
        [boot, money_] = await Promise.all([read('books.boot').then((r) => r.data), read('money.boot').then((r) => r.data)]);
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    })();
  },
};

function openDelivery(id) {
  const dialog = formDialog(t('books.delivery_title'), html`<div class="delivery-body" aria-busy="true"></div>`);
  const body = dialog.querySelector('.delivery-body');
  read('books.delivery.get', { id }).then(({ data: d }) => {
    render(body, html`
      <dl class="details">
        <dt>${t('books.publisher')}</dt><dd>${d.publisher}</dd>
        <dt>${t('money.field.date')}</dt><dd>${dateShort(d.date)}</dd>
        ${d.challan ? html`<dt>${t('books.challan')}</dt><dd>${d.challan}</dd>` : ''}
        <dt>${t('books.total_cost')}</dt><dd>${money(d.total_cost)}</dd>
        ${d.paid ? html`<dt>${t('books.paid')}</dt><dd>${money(d.paid)} <code>${d.payment_id}</code></dd>` : ''}
        ${d.note ? html`<dt>${t('money.field.note')}</dt><dd>${d.note}</dd>` : ''}
      </dl>
      <div class="list-body"><table class="table">
        <thead><tr><th scope="col">${t('books.title')}</th><th scope="col">${t('books.copies')}</th><th scope="col">${t('books.damaged')}</th><th scope="col">${t('books.unit_cost')}</th></tr></thead>
        <tbody>${d.lines.map((l) => html`<tr>
          <td data-label="${t('books.title')}"><span>${l.title}</span></td>
          <td data-label="${t('books.copies')}" class="num"><span>${l.qty}</span></td>
          <td data-label="${t('books.damaged')}" class="num"><span>${l.damaged}</span></td>
          <td data-label="${t('books.unit_cost')}" class="num nowrap"><span>${money(l.unit_cost)}</span></td></tr>`)}</tbody>
      </table></div>`);
  }).catch((err) => render(body, errorBox(errorText(err)))).finally(() => body.removeAttribute('aria-busy'));
}

export const deliveriesPage = {
  path: '/books/deliveries',
  title: 'nav.deliveries',
  perm: 'books.view',
  mount(el) {
    const list = mountList(el, {
      key: 'deliveries',
      action: 'books.deliveries',
      area: 'books',
      searchLabel: t('books.search_deliveries'),
      empty: t('books.no_deliveries'),
      emptySearch: t('list.no_match'),
      tools: html`<a class="btn btn-primary" href="#/books/delivery">${t('books.new_delivery')}</a>`,
      columns: [
        { label: t('money.field.date'), cell: (d) => dateShort(d.date), kind: 'nowrap' },
        { label: t('books.publisher'), cell: (d) => d.publisher },
        { label: t('books.challan'), cell: (d) => d.challan, kind: 'code' },
        { label: t('books.copies'), cell: (d) => t('books.titles_copies', { titles: d.titles, copies: d.copies }), kind: 'nowrap' },
        { label: t('books.total_cost'), cell: (d) => money(d.total_cost), kind: 'nowrap num' },
      ],
      onRow: (d) => openDelivery(d.id),
    });
    return () => list.destroy();
  },
};
