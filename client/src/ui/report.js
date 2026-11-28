// A report model (server/modules/reports.js) shown on the letterhead, and
// the same model as an Excel workbook: one definition for screen, print
// and Excel.

import { html } from './html.js';
import { letterhead, signatures } from './letterhead.js';
import { t, localDigits } from '../core/i18n.js';
import { dateShort, figure, money } from '../core/format.js';
import { reportSheets } from '../../../shared/reports/sheets.js';

const day = (d) => dateShort(`${d}T06:00:00Z`);

// A text or cell as words.
function textOf(x) {
  if (x === null || x === undefined) return '';
  if (typeof x === 'number') return figure(x);
  if (typeof x === 'string') return x;
  if ('s' in x) return x.s;
  if ('n' in x) return localDigits(String(x.n));
  if ('d' in x) return x.d ? day(x.d) : '';
  return t(x.t, Object.fromEntries(Object.entries(x.p || {}).map(([k, v]) => [k, v && typeof v === 'object' ? textOf(v) : v])));
}

function cellText(cell, type) {
  if (typeof cell !== 'number') return textOf(cell);
  return type === 'percent' ? localDigits(String(cell)) : figure(cell);
}

function blockView(b) {
  if (b.kind === 'section') return html`<h3 class="section-title">${textOf(b.title)}</h3>`;
  if (b.kind === 'note') return html`<p class="muted">${textOf(b.text)}</p>`;
  if (b.kind === 'sign') return signatures(b.labels.map(textOf));
  if (b.kind === 'kv') {
    return html`<dl class="slip">${b.rows.map((r) => html`<dt class="${r.total ? 'slip-total' : ''}">${textOf(r.label)}</dt>
      <dd class="${r.total ? 'slip-total' : ''}">${typeof r.value === 'number' ? money(r.value) : textOf(r.value)}</dd>`)}</dl>`;
  }
  if (!b.rows.length) return html`<p class="muted">${t('rep.none')}</p>`;
  const num = (c) => (c.type === 'text' ? '' : 'num');
  return html`<div class="report-table"><table class="report-grid">
    <thead><tr>${b.columns.map((c) => html`<th scope="col" class="${num(c)}">${textOf(c.label)}</th>`)}</tr></thead>
    <tbody>${b.rows.map((row) => html`<tr>${row.map((cell, i) => html`<td class="${num(b.columns[i])}">${cellText(cell, b.columns[i].type)}</td>`)}</tr>`)}</tbody>
    ${b.total ? html`<tfoot><tr>${b.total.map((cell, i) => html`<td class="${num(b.columns[i])}">${cellText(cell, b.columns[i].type)}</td>`)}</tr></tfoot>` : ''}
  </table></div>`;
}

export function reportView(model) {
  return html`<article class="doc report">${letterhead()}
    <h2 class="doc-title">${textOf(model.title)}</h2>
    ${model.sub.map((x) => html`<p class="muted">${textOf(x)}</p>`)}
    ${model.blocks.map(blockView)}
  </article>`;
}

// The same report as an Excel workbook.
export function workbook(model) {
  return reportSheets(model, textOf);
}
