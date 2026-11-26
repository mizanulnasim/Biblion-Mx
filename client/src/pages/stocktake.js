// Full stock-take: start one (all titles, or one publisher's), count, save
// as you go (counts are kept between sittings), then apply. Each counted
// title whose count differs gets a stock change naming the stock-take;
// titles not counted are left as they are.

import { html, on, render } from '../ui/html.js';
import { emptyState, errorBox } from '../ui/feedback.js';
import { confirmDialog, formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { dateShort } from '../core/format.js';
import { markDirty } from '../core/router.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';

function recentView(recent) {
  if (!recent.length) return '';
  return html`<section class="panel"><h2 class="section-title">${t('take.recent')}</h2>
    <ul class="moves">${recent.map((r) => html`<li><span>${r.number} · ${dateShort(r.date)}</span>
      <span class="muted">${t('take.result', r.result)}</span></li>`)}</ul></section>`;
}

function startView(publishers, recent) {
  return html`<p class="intro">${t('take.intro')}</p>
    <section class="panel">${formView({
      submit: t('take.start'),
      fields: [{ name: 'publisher_id', label: t('take.scope'), type: 'select', placeholder: t('take.all_titles'), options: publishers.map((p) => ({ value: p.id, label: p.name })) }],
    })}</section>${recentView(recent)}`;
}

function countView(take, filter) {
  const q = filter.toLowerCase();
  const rows = take.lines.filter((l) => !q || `${l.title} ${l.author}`.toLowerCase().includes(q));
  const counted = take.lines.filter((l) => l.counted !== null).length;
  return html`
    <section class="panel">
      <div class="panel-head"><h2 class="section-title">${take.number} · ${take.publisher || t('take.all_titles')}</h2>
        <span class="muted">${t('take.progress', { counted, total: take.lines.length })}</span></div>
      <div class="list-bar"><label class="search"><input type="search" value="${filter}" placeholder="${t('take.find')}" data-role="filter"></label></div>
      <form class="take-form" novalidate>
        ${rows.length ? html`<div class="list-body"><table class="table">
          <thead><tr><th scope="col">${t('books.title')}</th><th scope="col">${t('take.expected')}</th><th scope="col">${t('take.counted')}</th></tr></thead>
          <tbody>${rows.map((l) => html`<tr>
            <td data-label="${t('books.title')}"><span>${l.title}${l.author ? html`<br><span class="muted">${l.author}</span>` : ''}</span></td>
            <td data-label="${t('take.expected')}" class="num"><span>${l.expected}</span></td>
            <td data-label="${t('take.counted')}"><span><input class="count-input" name="${l.book_id}" inputmode="numeric" value="${l.counted ?? ''}" aria-label="${t('take.count_of', { title: l.title })}"></span></td>
          </tr>`)}</tbody></table></div>` : emptyState(t('list.no_match'))}
      </form>
      <div class="take-error"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-danger-quiet" data-act="cancel">${t('take.cancel')}</button>
        <button type="button" class="btn" data-act="save">${t('take.save')}</button>
        <button type="button" class="btn btn-primary" data-act="apply">${t('take.apply')}</button>
      </div>
    </section>`;
}

export const stocktakePage = {
  path: '/books/stocktake',
  title: 'nav.stocktake',
  perm: 'books.adjust',
  mount(el) {
    let data = null;
    let filter = '';
    const changed = new Map();

    function draw() {
      if (!data.take) {
        render(el, startView(data.publishers, data.recent));
        bindForm(el.querySelector('form'), {
          schema: ACTIONS['books.stocktake.start'].schema,
          busyLabel: t('common.saving'),
          onSubmit: (v) => write('books.stocktake.start', { publisher_id: v.publisher_id || null }),
          onSaved: () => load(),
        });
        return;
      }
      render(el, countView(data.take, filter));
      for (const [id, value] of changed) {
        const input = el.querySelector(`.take-form [name="${id}"]`);
        if (input) input.value = value;
      }
    }

    async function save() {
      const counts = [...changed].map(([bookId, value]) => ({ book_id: bookId, counted: value === '' ? null : value }));
      if (!counts.length) return true;
      const reply = await write('books.stocktake.save', { id: data.take.id, counts });
      if (reply.status !== 'saved') {
        render(el.querySelector('.take-error'), errorBox(t(errorMessageId(reply.error.code), reply.error.params)));
        return false;
      }
      changed.clear();
      markDirty(el.querySelector('.take-form'), false);
      return true;
    }

    async function load() {
      try {
        const [take, boot] = await Promise.all([read('books.stocktake').then((r) => r.data), read('books.boot').then((r) => r.data)]);
        data = { ...take, publishers: boot.publishers };
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }

    el.addEventListener('input', (e) => {
      if (e.target.dataset.role === 'filter') {
        filter = e.target.value;
        draw();
        const box = el.querySelector('[data-role="filter"]');
        box.focus();
        box.setSelectionRange(filter.length, filter.length);
      } else if (e.target.classList.contains('count-input')) {
        changed.set(e.target.name, e.target.value.trim());
        markDirty(el.querySelector('.take-form'), true);
      }
    });
    const off = on(el, 'click', {
      save: (e, btn) => whileBusy(btn, t('common.saving'), async () => {
        if (await save()) {
          toast(t('take.saved'));
          await load();
        }
      }),
      apply: async (e, btn) => {
        const ok = await confirmDialog({ title: t('take.apply'), body: t('take.apply_body'), ok: t('take.apply') });
        if (!ok) return;
        await whileBusy(btn, t('common.saving'), async () => {
          if (!(await save())) return;
          const reply = await write('books.stocktake.apply', { id: data.take.id });
          if (reply.status === 'saved') {
            toast(t('take.applied', reply.data));
            await load();
          }
        });
      },
      cancel: () => {
        const dialog = formDialog(t('take.cancel'), formView({ submit: t('take.cancel'), fields: [{ name: 'reason', label: t('books.reason'), type: 'textarea', required: true }] }));
        bindForm(dialog.querySelector('form.form'), {
          schema: ACTIONS['books.stocktake.cancel'].schema,
          busyLabel: t('common.saving'),
          mapValues: (v) => ({ ...v, id: data.take.id }),
          onSubmit: (v) => write('books.stocktake.cancel', v),
          onSaved: () => {
            dialog.close();
            changed.clear();
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
