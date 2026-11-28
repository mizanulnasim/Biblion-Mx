// Special orders. Taking one (staff too): customer, phone, the title (from
// the catalogue or typed), copies, any advance. Following up (managers):
// the list, telling the customer by WhatsApp with one tap when the book
// arrives, collected, or cancelled with a reason.

import { html, render } from '../ui/html.js';
import { chip, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { mountList } from '../ui/list.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { dateShort, money } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { bookList, findBook } from './books-common.js';

const STATES = {
  open: ['order.state.open', 'muted'], requested: ['order.state.requested', 'warn'], arrived: ['order.state.arrived', 'ok'],
  told: ['order.state.told', 'ok'], collected: ['order.state.collected', 'muted'], cancelled: ['order.state.cancelled', 'muted'],
};

// A Bangladesh mobile number for WhatsApp: 017… becomes 88017….
function whatsappNumber(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('01') ? `88${digits}` : digits;
}

function whatsappLink(order) {
  return `https://wa.me/${whatsappNumber(order.phone)}?text=${encodeURIComponent(t('order.message', { name: order.customer_name, title: order.title, number: order.number }))}`;
}

export const orderFormPage = {
  path: '/books/order',
  title: 'order.new_title',
  perm: 'books.order',
  mount(el) {
    let boot = null;
    let opId = crypto.randomUUID();
    function draw() {
      render(el, html`${bookList(boot.books, boot.publishers)}
        <p class="intro">${t('order.intro')}</p>
        <section class="panel">${formView({
          submit: t('order.save'),
          values: { qty: '1' },
          fields: [
            { name: 'customer_name', label: t('order.customer'), required: true, autocomplete: 'off' },
            { name: 'phone', label: t('setup.phone'), required: true, inputmode: 'tel', help: t('order.phone_help') },
            { name: 'book', label: t('books.title'), required: true, help: t('order.book_help') },
            { name: 'publisher_id', label: t('books.publisher'), type: 'select', placeholder: t('money.choose'), options: boot.publishers.map((p) => ({ value: p.id, label: p.name })), help: t('order.publisher_help') },
            { name: 'qty', label: t('books.copies'), inputmode: 'numeric', required: true },
            { name: 'advance', label: t('order.advance'), inputmode: 'decimal', help: t('order.advance_help') },
            { name: 'note', label: t('money.field.note'), type: 'textarea' },
          ],
        })}</section>`);
      const form = el.querySelector('form');
      form.elements.book.setAttribute('list', 'book-titles');
      bindForm(form, {
        schema: ACTIONS['books.order.save'].schema,
        busyLabel: t('common.saving'),
        mapValues: (v) => {
          const book = findBook(v.book, boot.books, boot.publishers);
          const out = { customer_name: v.customer_name, phone: v.phone, qty: v.qty, note: v.note || null, advance: v.advance || null };
          if (book) out.book_id = book.id;
          else Object.assign(out, { title: v.book, publisher_id: v.publisher_id || null });
          return out;
        },
        onSubmit: (v) => write('books.order.save', v, { opId, label: t('order.label', { name: v.customer_name }) }),
        onSaved: (reply) => {
          toast(reply.status === 'queued' ? t('money.saved_on_phone') : t('order.saved', { number: reply.data.number }));
          opId = crypto.randomUUID();
          draw();
        },
      });
    }
    render(el, html`<div aria-busy="true"></div>`);
    read('books.boot').then(({ data }) => {
      boot = data;
      draw();
    }).catch((err) => render(el, errorBox(errorText(err))));
  },
};

function openOrder(order, onChanged) {
  const dialog = formDialog(`${order.number} · ${order.customer_name}`, html`
    <dl class="details">
      <dt>${t('money.field.state')}</dt><dd>${chip(t(STATES[order.status][0]), STATES[order.status][1])}</dd>
      <dt>${t('books.title')}</dt><dd>${order.title} × ${order.qty}</dd>
      <dt>${t('books.publisher')}</dt><dd>${order.publisher}</dd>
      <dt>${t('setup.phone')}</dt><dd><a href="tel:${order.phone}">${order.phone}</a></dd>
      <dt>${t('money.field.date')}</dt><dd>${dateShort(order.date)}</dd>
      ${order.advance ? html`<dt>${t('order.advance')}</dt><dd>${money(order.advance)}</dd>` : ''}
      ${order.requisition ? html`<dt>${t('order.requisition')}</dt><dd>${order.requisition}</dd>` : ''}
      ${order.note ? html`<dt>${t('money.field.note')}</dt><dd>${order.note}</dd>` : ''}
      ${order.cancel_reason ? html`<dt>${t('order.cancelled_because')}</dt><dd>${order.cancel_reason}</dd>` : ''}
    </dl>
    <div class="order-error"></div>
    <div class="dialog-actions">
      ${['open', 'requested', 'arrived', 'told'].includes(order.status) ? html`<button type="button" class="btn btn-danger-quiet" data-act="cancel">${t('order.cancel')}</button>` : ''}
      ${order.status === 'arrived' ? html`<a class="btn btn-primary" target="_blank" rel="noopener" href="${whatsappLink(order)}" data-act="tell">${t('order.tell')}</a>` : ''}
      ${order.status === 'arrived' || order.status === 'told' ? html`<button type="button" class="btn" data-act="collected">${t('order.collected')}</button>` : ''}
    </div>`);
  const act = async (action, btn) => whileBusy(btn, t('common.saving'), async () => {
    try {
      const reply = await write('books.order.act', { id: order.id, act: action });
      if (reply.status === 'saved') {
        dialog.close();
        onChanged();
      } else {
        render(dialog.querySelector('.order-error'), errorBox(t(errorMessageId(reply.error.code), reply.error.params)));
      }
    } catch (err) {
      render(dialog.querySelector('.order-error'), errorBox(errorText(err)));
    }
  });
  dialog.addEventListener('click', (e) => {
    const target = e.target.closest('[data-act]');
    if (!target) return;
    // The WhatsApp message opens in a new tab; the order is marked told.
    if (target.dataset.act === 'tell') act('told', target);
    if (target.dataset.act === 'collected') act('collected', target);
    if (target.dataset.act === 'cancel') {
      const reasonDialog = formDialog(t('order.cancel'), formView({ submit: t('order.cancel'), fields: [{ name: 'reason', label: t('books.reason'), type: 'textarea', required: true }] }));
      bindForm(reasonDialog.querySelector('form.form'), {
        schema: { reason: { type: 'text', required: true, max: 300 } },
        busyLabel: t('common.saving'),
        onSubmit: (v) => write('books.order.act', { id: order.id, act: 'cancel', reason: v.reason }),
        onSaved: () => {
          reasonDialog.close();
          dialog.close();
          onChanged();
        },
      });
    }
  });
}

export const ordersPage = {
  path: '/books/orders',
  title: 'nav.orders',
  perm: 'books.orders',
  mount(el) {
    const list = mountList(el, {
      key: 'orders',
      action: 'books.orders',
      area: 'books',
      searchLabel: t('order.search'),
      empty: t('order.empty'),
      emptySearch: t('list.no_match'),
      initial: { status: 'arrived' },
      filters: [{ name: 'status', label: t('order.all'), options: [{ value: 'open', label: t('order.filter.open') }, { value: 'arrived', label: t('order.filter.arrived') }, { value: 'done', label: t('order.filter.done') }] }],
      tools: can('books.order') ? html`<a class="btn btn-primary" href="#/books/order">${t('order.new')}</a>` : '',
      columns: [
        { label: t('order.number'), cell: (o) => o.number, kind: 'nowrap code' },
        { label: t('order.customer'), cell: (o) => html`${o.customer_name}<br><span class="muted">${o.phone}</span>` },
        { label: t('books.title'), cell: (o) => `${o.title} × ${o.qty}` },
        { label: t('money.field.state'), cell: (o) => chip(t(STATES[o.status][0]), STATES[o.status][1]), kind: 'nowrap' },
      ],
      onRow: (o) => openOrder(o, () => list.reload()),
    });
    return () => list.destroy();
  },
};
