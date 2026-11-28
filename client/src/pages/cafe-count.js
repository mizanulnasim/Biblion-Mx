// The daily café count: for each stock item, what was there before plus
// what came in, against what is counted now, with waste (and a reason) and
// anything expired. Staff do it at closing; it can be saved offline. Items
// about to expire are listed above it.

import { html, render } from '../ui/html.js';
import { emptyState, errorBox } from '../ui/feedback.js';
import { bindForm, errorText } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { dateShort, today } from '../core/format.js';
import { itemName, qtyUnit } from './cafe-common.js';

const WASTE_REASONS = ['cafe.waste.spilled', 'cafe.waste.spoiled', 'cafe.waste.burnt', 'cafe.waste.returned', 'cafe.waste.staff'];

function expiryView(list) {
  if (!list.items.length) return '';
  return html`<section class="panel notice-warn expiry">
    <h2 class="section-title">${t('cafe.expiring', { days: list.warn_days })}</h2>
    <ul class="moves">${list.items.map((x) => html`<li><span><strong>${itemName(x)}</strong> · ${qtyUnit(x.left, x.unit)}</span>
      <span>${x.in_days < 0 ? t('cafe.expired_on', { date: dateShort(x.expiry_date) }) : x.in_days === 0 ? t('cafe.expires_today') : t('cafe.expires_in', { days: x.in_days })}</span></li>`)}</ul>
  </section>`;
}

function lineRow(l, i) {
  const id = (f) => `f-lines.${i}.${f}`;
  const num = (f, label, value) => html`<div class="field"><label for="${id(f)}">${label}</label>
    <input id="${id(f)}" name="lines.${i}.${f}" inputmode="decimal" value="${value ?? ''}" aria-describedby="${id(f)}-err"><p class="field-error" id="${id(f)}-err"></p></div>`;
  return html`<div class="count-row">
    <input type="hidden" name="lines.${i}.item_id" value="${l.item_id}">
    <div class="count-name"><strong>${itemName(l)}</strong>
      <span class="muted">${l.expected === null ? t('cafe.first_count') : t('cafe.expected_line', { before: qtyUnit(l.before, l.unit), received: qtyUnit(l.received, l.unit), expected: qtyUnit(l.expected, l.unit) })}</span>
      ${l.used !== null && l.counted !== null ? html`<span class="muted">${t('cafe.used_line', { used: qtyUnit(l.used, l.unit) })}</span>` : ''}</div>
    ${num('counted', t('cafe.counted', { unit: l.unit }), l.counted)}
    ${num('wasted', t('cafe.wasted'), l.wasted || '')}
    <div class="field"><label for="${id('waste_reason')}">${t('cafe.waste_reason')}</label>
      <input id="${id('waste_reason')}" name="lines.${i}.waste_reason" list="waste-reasons" value="${l.waste_reason}" aria-describedby="${id('waste_reason')}-err"><p class="field-error" id="${id('waste_reason')}-err"></p></div>
    ${num('expired', t('cafe.expired'), l.expired || '')}
  </div>`;
}

export const cafeCountPage = {
  path: '/cafe/count',
  title: 'nav.cafe_count',
  perm: 'cafe.count',
  mount(el, { query }) {
    const date = query.date || today();
    let opId = crypto.randomUUID();
    let sent = [];

    async function load() {
      try {
        const [sheet, expiring] = await Promise.all([
          read('cafe.count.get', { date }).then((r) => r.data),
          can('cafe.view') ? read('cafe.expiry').then((r) => r.data) : Promise.resolve({ items: [] }),
        ]);
        draw(sheet, expiring);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }

    function draw(sheet, expiring) {
      render(el, html`
        <datalist id="waste-reasons">${WASTE_REASONS.map((r) => html`<option value="${t(r)}"></option>`)}</datalist>
        ${expiryView(expiring)}
        <div class="list-bar"><label class="field-inline">${t('money.field.date')} <input type="date" value="${date}" max="${today()}" data-role="date"></label>
          ${sheet.saved ? html`<span class="chip chip-ok">${t('cafe.count_saved')}</span>` : ''}</div>
        ${sheet.lines.length ? html`<form class="form panel" novalidate>
          <p class="help">${t('cafe.count_help')}</p>
          <div class="count-rows">${sheet.lines.map(lineRow)}</div>
          <div class="form-error" role="alert"></div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">${t('cafe.save_count')}</button></div>
        </form>` : emptyState(t('cafe.no_stock_items'))}`);
      el.querySelector('[data-role="date"]').addEventListener('change', (e) => {
        if (e.target.value) location.hash = `#/cafe/count?date=${e.target.value}`;
      });
      const form = el.querySelector('form');
      if (!form) return;
      bindForm(form, {
        schema: {},
        busyLabel: t('common.saving'),
        mapValues: () => {
          const rows = [];
          for (const input of form.elements) {
            const m = /^lines\.(\d+)\.(\w+)$/.exec(input.name || '');
            if (m) {
              rows[Number(m[1])] = rows[Number(m[1])] || {};
              rows[Number(m[1])][m[2]] = input.value.trim();
            }
          }
          // Only items with a count are sent; waste and expiry default to none.
          sent = rows.map((r, i) => (r.counted !== '' ? i : -1)).filter((i) => i >= 0);
          return {
            date,
            lines: sent.map((i) => rows[i]).map((r) => ({
              item_id: r.item_id, counted: r.counted, wasted: r.wasted || 0, waste_reason: r.waste_reason || null, expired: r.expired || 0,
            })),
          };
        },
        onSubmit: async (payload) => {
          const reply = await write('cafe.count.save', payload, { opId, label: t('cafe.count_label', { date: dateShort(date) }) });
          // The server numbers the lines it was sent; the form numbers every item.
          if (reply.status === 'rejected' && reply.error.fields) {
            const fields = {};
            for (const [key, value] of Object.entries(reply.error.fields)) {
              fields[key.replace(/^lines\.(\d+)\./, (m, n) => `lines.${sent[Number(n)]}.`)] = value;
            }
            return { ...reply, error: { ...reply.error, fields } };
          }
          return reply;
        },
        onSaved: (reply) => {
          toast(reply.status === 'queued' ? t('money.saved_on_phone') : t('cafe.count_done'));
          opId = crypto.randomUUID();
          load();
        },
      });
    }

    render(el, html`<div aria-busy="true"></div>`);
    load();
  },
};
