// A long list: search, a table that becomes one card per row on narrow
// screens (never sideways scrolling), and the page bar
// "Page X of Y · N entries" with First / Previous / jump / Next / Last and
// 25, 50 or 100 a page. The server sends one page at a time, newest first.
// The page and search are remembered for this tab, so Back returns to them.
// When the list's area changes on the server it redraws, unless the person
// is busy (a dialog open, a field focused, unsaved changes).

import { html, on, render } from './html.js';
import { emptyState, errorBox, latestOnly, staleNotice } from './feedback.js';
import { errorText } from './form.js';
import { t } from '../core/i18n.js';
import { read } from '../core/api.js';
import { device, tab } from '../core/state.js';
import { hasUnsavedChanges } from '../core/router.js';
import { onArea } from '../core/live.js';
import { PAGE_SIZES } from '../../../shared/contract/actions.js';

function tableView(columns, rows) {
  return html`<table class="table">
    <thead><tr>${columns.map((c) => html`<th scope="col">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((row) => html`<tr data-act="row" data-id="${row.id}" tabindex="0">
      ${columns.map((c) => html`<td data-label="${c.label}" class="${c.kind || ''}"><span>${c.cell(row)}</span></td>`)}
    </tr>`)}</tbody>
  </table>`;
}

function pagerView({ offset, limit, total }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const current = Math.floor(offset / limit) + 1;
  return html`<nav class="pager" aria-label="${t('list.pages')}">
    <span class="pager-text">${t('list.page_of', { page: current, pages, total })}</span>
    <span class="pager-buttons">
      <button type="button" class="btn btn-small" data-act="page" data-to="1" ${current === 1 ? 'disabled' : ''}>${t('list.first')}</button>
      <button type="button" class="btn btn-small" data-act="page" data-to="${current - 1}" ${current === 1 ? 'disabled' : ''}>${t('list.previous')}</button>
      <label class="pager-jump"><span class="sr-only">${t('list.jump')}</span>
        <input type="number" min="1" max="${pages}" value="${current}" inputmode="numeric" data-role="jump"></label>
      <button type="button" class="btn btn-small" data-act="page" data-to="${current + 1}" ${current === pages ? 'disabled' : ''}>${t('list.next')}</button>
      <button type="button" class="btn btn-small" data-act="page" data-to="${pages}" ${current === pages ? 'disabled' : ''}>${t('list.last')}</button>
    </span>
    <label class="pager-size">${t('list.per_page')}
      <select data-role="size">${PAGE_SIZES.map((n) => html`<option value="${n}" ${n === limit ? 'selected' : ''}>${n}</option>`)}</select>
    </label>
  </nav>`;
}

// options: {key, action, area, columns:[{label, cell(row), kind}], empty, emptySearch,
//           searchLabel, tools (html for the bar), onRow(row), onTool(name)}
export function mountList(el, options) {
  const saved = tab.get(`page:${options.key}`) || {};
  const query = {
    q: saved.q || '',
    offset: saved.offset || 0,
    limit: PAGE_SIZES.includes(device.get('pageSize')) ? device.get('pageSize') : PAGE_SIZES[0],
  };
  let rows = [];

  render(el, html`
    <div class="list-bar">
      <label class="search"><span class="sr-only">${options.searchLabel}</span>
        <input type="search" value="${query.q}" placeholder="${options.searchLabel}" data-role="search"></label>
      ${options.tools || ''}
    </div>
    <div class="list-notice"></div>
    <div class="list-body" aria-live="polite"></div>
    <div class="list-pager"></div>`);
  const notice = el.querySelector('.list-notice');
  const body = el.querySelector('.list-body');
  const pager = el.querySelector('.list-pager');
  const load = latestOnly(body);

  function reload() {
    tab.set(`page:${options.key}`, { q: query.q, offset: query.offset });
    return load(
      () => read(options.action, query),
      ({ data, cachedAt }) => {
        rows = data.items;
        query.offset = data.offset;
        render(notice, staleNotice(cachedAt));
        if (!data.total) {
          render(body, emptyState(query.q ? options.emptySearch : options.empty));
          render(pager, '');
          return;
        }
        render(body, tableView(options.columns, rows));
        render(pager, pagerView(data));
      },
      // On error the current rows stay and the message sits above them.
      (err) => render(notice, errorBox(errorText(err))),
    );
  }

  let searchTimer = null;
  el.addEventListener('input', (e) => {
    if (e.target.dataset.role !== 'search') return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      query.q = e.target.value.trim();
      query.offset = 0;
      reload();
    }, 300);
  });
  el.addEventListener('change', (e) => {
    const role = e.target.dataset.role;
    if (role === 'size') {
      query.limit = Number(e.target.value);
      device.set('pageSize', query.limit);
      query.offset = 0;
      reload();
    } else if (role === 'jump') {
      const pages = Number(e.target.max);
      const to = Math.min(Math.max(1, Math.round(Number(e.target.value)) || 1), pages);
      query.offset = (to - 1) * query.limit;
      reload();
    }
  });
  const offClick = on(el, 'click', {
    page: (e, btn) => {
      query.offset = (Number(btn.dataset.to) - 1) * query.limit;
      reload();
    },
    row: (e, tr) => options.onRow && options.onRow(rows.find((r) => r.id === tr.dataset.id)),
    tool: (e, btn) => options.onTool(btn.dataset.tool),
  });
  const onKey = (e) => {
    if (e.key === 'Enter' && e.target.matches('tr[data-act="row"]')) e.target.click();
  };
  el.addEventListener('keydown', onKey);

  const busy = () => document.querySelector('dialog[open]') || el.contains(document.activeElement) && document.activeElement.matches('input, select, textarea') || hasUnsavedChanges();
  const offArea = onArea(options.area, () => {
    if (!busy()) reload();
  });

  reload();
  return {
    reload,
    destroy() {
      offClick();
      offArea();
      clearTimeout(searchTimer);
      el.removeEventListener('keydown', onKey);
    },
  };
}
