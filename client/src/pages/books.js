// Books: the catalogue A to Z with price and stock; a title opens with its
// details, editing, stock changes (with a reason) and its stock history.

import { html, on, render } from '../ui/html.js';
import { mountList } from '../ui/list.js';
import { chip, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { dateShort, money, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

const MOVE_KINDS = {
  receive: 'books.move.receive', sale: 'books.move.sale', damaged: 'books.move.damaged',
  lost: 'books.move.lost', found: 'books.move.found', returned: 'books.move.returned',
};

function bookFields(publishers) {
  return [
    { name: 'title', label: t('books.title'), required: true },
    { name: 'author', label: t('books.author') },
    { name: 'publisher_id', label: t('books.publisher'), type: 'select', required: true, placeholder: t('money.choose'), options: publishers.map((p) => ({ value: p.id, label: p.name })) },
    { name: 'printed_price', label: t('books.printed_price'), inputmode: 'decimal', required: true },
    { name: 'sell_price', label: t('books.sell_price'), inputmode: 'decimal', help: t('books.sell_price_help') },
    { name: 'isbn', label: t('books.isbn'), inputmode: 'numeric' },
    { name: 'aliases', label: t('books.aliases'), help: t('books.aliases_help') },
    { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }] },
  ];
}

function editBook(book, publishers, onSaved) {
  const values = book ? { ...book, printed_price: String(book.printed_price), sell_price: book.sell_price ? String(book.sell_price) : '' } : { status: 'active' };
  const dialog = formDialog(book ? t('books.edit_title') : t('books.add_title'), formView({ fields: bookFields(publishers), values, submit: t('common.save') }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['books.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id: book ? book.id : null, version: book ? book.version : null, sell_price: v.sell_price || null }),
    onSubmit: (v) => write('books.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('books.saved'));
      onSaved();
    },
  });
}

function changeStock(book, onSaved) {
  const dialog = formDialog(t('books.change_title', { title: book.title }), formView({
    submit: t('common.save'),
    values: { date: today(), kind: 'damaged' },
    fields: [
      { name: 'kind', label: t('books.change_kind'), type: 'select', required: true, options: ['damaged', 'lost', 'found', 'returned'].map((k) => ({ value: k, label: t(MOVE_KINDS[k]) })) },
      { name: 'qty', label: t('books.copies'), inputmode: 'numeric', required: true },
      { name: 'date', label: t('money.field.date'), type: 'date', required: true },
      { name: 'reason', label: t('books.reason'), type: 'textarea', required: true },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['books.adjust'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, book_id: book.id }),
    onSubmit: (v) => write('books.adjust', v),
    onSaved: () => {
      dialog.close();
      toast(t('books.stock_changed'));
      onSaved();
    },
  });
}

function movesView(items) {
  if (!items.length) return html`<p class="empty">${t('books.no_moves')}</p>`;
  return html`<ul class="moves">${items.map((m) => html`<li class="${m.status === 'active' ? '' : 'is-cancelled'}">
    <span>${dateShort(m.date)} · ${t(MOVE_KINDS[m.kind])} · <strong>${m.qty > 0 ? `+${m.qty}` : m.qty}</strong>${m.reason ? html` · ${m.reason}` : ''}</span>
    <span class="muted">${m.entered_by}${m.status === 'active' ? '' : html` · ${chip(t('money.state.cancelled'), 'muted')} ${m.cancel_reason}`}</span>
    ${m.can_cancel ? html`<button type="button" class="btn btn-small btn-danger-quiet" data-act="cancel-move" data-id="${m.id}">${t('books.cancel_move')}</button>` : ''}
  </li>`)}</ul>`;
}

function openBook(book, publishers, onChanged) {
  const dialog = formDialog(book.title, html`
    <dl class="details">
      <dt>${t('books.author')}</dt><dd>${book.author || '—'}</dd>
      <dt>${t('books.publisher')}</dt><dd>${book.publisher}</dd>
      <dt>${t('books.printed_price')}</dt><dd>${money(book.printed_price)}</dd>
      <dt>${t('books.price')}</dt><dd>${money(book.price)}</dd>
      ${book.cost !== null ? html`<dt>${t('books.cost')}</dt><dd>${money(book.cost)}</dd>` : ''}
      <dt>${t('books.on_hand')}</dt><dd><strong>${book.on_hand}</strong></dd>
      ${book.isbn ? html`<dt>${t('books.isbn')}</dt><dd><code>${book.isbn}</code></dd>` : ''}
    </dl>
    <div class="dialog-actions">
      ${can('books.adjust') ? html`<button type="button" class="btn" data-act="change">${t('books.change_stock')}</button>` : ''}
      ${can('books.catalog') ? html`<button type="button" class="btn" data-act="edit">${t('books.edit')}</button>` : ''}
    </div>
    <h3 class="section-title">${t('books.history')}</h3>
    <div class="moves-slot" aria-busy="true"></div>`);
  const slot = dialog.querySelector('.moves-slot');
  const loadMoves = async () => {
    try {
      render(slot, movesView((await read('books.moves', { book_id: book.id })).data.items));
    } catch (err) {
      render(slot, errorBox(errorText(err)));
    } finally {
      slot.removeAttribute('aria-busy');
    }
  };
  const changed = () => {
    loadMoves();
    onChanged();
  };
  on(dialog, 'click', {
    change: () => changeStock(book, changed),
    edit: () => {
      dialog.close();
      editBook(book, publishers, onChanged);
    },
    'cancel-move': (e, btn) => {
      const reasonDialog = formDialog(t('books.cancel_move'), formView({ submit: t('books.cancel_move'), fields: [{ name: 'reason', label: t('books.reason'), type: 'textarea', required: true }] }));
      bindForm(reasonDialog.querySelector('form.form'), {
        schema: ACTIONS['books.move.cancel'].schema,
        busyLabel: t('common.saving'),
        mapValues: (v) => ({ ...v, id: btn.dataset.id }),
        onSubmit: (v) => write('books.move.cancel', v),
        onSaved: () => {
          reasonDialog.close();
          changed();
        },
      });
    },
  });
  loadMoves();
}

export const booksPage = {
  path: '/books',
  title: 'nav.books',
  perm: 'books.view',
  mount(el) {
    let publishers = [];
    render(el, html`<div class="list-bar book-links">
        ${can('books.receive') ? html`<a class="btn" href="#/books/delivery">${t('books.new_delivery')}</a>` : ''}
        ${can('books.sell') ? html`<a class="btn" href="#/books/sales">${t('books.type_sales')}</a>` : ''}
        <a class="btn" href="#/books/deliveries">${t('nav.deliveries')}</a>
      </div><div class="book-list"></div>`);
    const listEl = el.querySelector('.book-list');
    let list = null;
    (async () => {
      try {
        publishers = (await read('books.boot')).data.publishers;
      } catch (err) {
        // The list shows the connection problem.
      }
      list = mountList(listEl, {
        key: 'books',
        action: 'books.list',
        area: 'books',
        searchLabel: t('books.search'),
        empty: t('books.empty'),
        emptySearch: t('list.no_match'),
        filters: [
          { name: 'publisher_id', label: t('books.all_publishers'), options: publishers.map((p) => ({ value: p.id, label: p.name })) },
          { name: 'stock', label: t('books.all_stock'), options: [{ value: 'in', label: t('books.in_stock') }, { value: 'out', label: t('books.out_of_stock') }] },
        ],
        tools: can('books.catalog') ? html`<button type="button" class="btn btn-primary" data-act="tool" data-tool="add">${t('books.add')}</button>` : '',
        columns: [
          { label: t('books.title'), cell: (b) => html`<strong>${b.title}</strong>${b.author ? html`<br><span class="muted">${b.author}</span>` : ''}` },
          { label: t('books.publisher'), cell: (b) => b.publisher },
          { label: t('books.price'), cell: (b) => money(b.price), kind: 'nowrap num' },
          { label: t('books.on_hand'), cell: (b) => html`<span class="${b.on_hand < 0 ? 'warn-text' : ''}">${b.on_hand}</span>`, kind: 'nowrap num' },
        ],
        onRow: (b) => openBook(b, publishers, () => list.reload()),
        onTool: () => editBook(null, publishers, () => list.reload()),
      });
    })();
    return () => list && list.destroy();
  },
};
