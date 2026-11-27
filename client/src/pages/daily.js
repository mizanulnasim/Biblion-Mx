// Daily shift: one per date. Net sales split into cash, bKash, card and
// dues by person; cash handed to a shareholder; the cash counted in the
// drawer against what the app expects. Any short or over, however small,
// makes the shift wait for a shareholder. Can be saved offline.

import { html, on, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { bindForm, errorText, fieldView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { dateShort, money, today } from '../core/format.js';
import { isDirty, markDirty } from '../core/router.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { decide } from '../../../shared/rules/approval.js';
import { reasonTexts, stateChip } from './money-common.js';
import { duplicateDialog } from './money-form.js';
import { openEntry } from './money-entry.js';

const AMOUNTS = ['net_sales', 'books_sales', 'cash', 'bkash', 'card', 'handed', 'actual_cash', 'pos_expected'];
const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const round = (n) => Math.round(n * 100) / 100;

function accountOptions(prep, test) {
  return prep.accounts.filter(test).map((a) => ({ value: a.id, label: a.name }));
}

function dueRow(prep, row, i) {
  return html`<div class="due-row" data-row="${i}">
    <div class="field"><label for="f-dues.${i}.party_id">${t('shift.due_person')}</label>
      <select id="f-dues.${i}.party_id" name="dues.${i}.party_id" aria-describedby="f-dues.${i}.party_id-err">
        <option value="">${t('money.choose')}</option>
        ${prep.contacts.map((c) => html`<option value="${c.id}" ${c.id === row.party_id ? 'selected' : ''}>${c.name}</option>`)}
      </select><p class="field-error" id="f-dues.${i}.party_id-err"></p></div>
    <div class="field"><label for="f-dues.${i}.amount">${t('shift.due_amount')}</label>
      <input id="f-dues.${i}.amount" name="dues.${i}.amount" inputmode="decimal" value="${row.amount ?? ''}" aria-describedby="f-dues.${i}.amount-err">
      <p class="field-error" id="f-dues.${i}.amount-err"></p></div>
    <button type="button" class="icon-btn" data-act="remove-due" data-i="${i}" aria-label="${t('shift.remove_due')}">×</button>
  </div>`;
}

function formHtml(prep, v) {
  const f = (spec) => fieldView(spec, v[spec.name]);
  const money_ = (name, label, extra = {}) => f({ name, label, inputmode: 'decimal', ...extra });
  return html`<form class="form shift-form" novalidate>
    <fieldset class="panel"><legend class="section-title">${t('shift.sales')}</legend>
      ${money_('net_sales', t('shift.net_sales'), { required: true, help: t('shift.net_sales_help') })}
      ${money_('books_sales', t('shift.books_sales'), { help: t('shift.books_sales_help') })}
    </fieldset>
    <fieldset class="panel"><legend class="section-title">${t('shift.paid_how')}</legend>
      <div class="pair">${money_('cash', t('shift.cash'))}</div>
      <div class="pair">${money_('bkash', t('shift.bkash'))}
        ${f({ name: 'bkash_account_id', label: t('shift.bkash_account'), type: 'select', placeholder: t('money.choose'), options: accountOptions(prep, (a) => a.kind !== 'drawer') })}</div>
      <div class="pair">${money_('card', t('shift.card'))}
        ${f({ name: 'card_account_id', label: t('shift.card_account'), type: 'select', placeholder: t('money.choose'), options: accountOptions(prep, (a) => a.kind !== 'drawer') })}</div>
      <h3 class="subhead">${t('shift.dues')}</h3>
      <div class="dues">${v.dues.map((row, i) => dueRow(prep, row, i))}</div>
      <button type="button" class="btn btn-small" data-act="add-due">${t('shift.add_due')}</button>
      <p class="split-line" aria-live="polite"></p>
    </fieldset>
    <fieldset class="panel"><legend class="section-title">${t('shift.drawer', { name: prep.drawer.name })}</legend>
      <div class="pair">${money_('handed', t('shift.handed'), { help: t('shift.handed_help') })}
        ${f({ name: 'handed_to', label: t('shift.handed_to'), type: 'select', placeholder: t('money.choose'), options: accountOptions(prep, (a) => a.kind !== 'drawer') })}</div>
      ${money_('actual_cash', t('shift.actual_cash'), { required: true, help: t('shift.actual_cash_help') })}
      ${money_('pos_expected', t('shift.pos_expected'), { help: t('shift.pos_expected_help') })}
      <div class="drawer-line" aria-live="polite"></div>
    </fieldset>
    ${f({ name: 'note', label: t('money.field.note'), type: 'textarea' })}
    <div class="form-error" role="alert"></div>
    <div class="form-actions"><button type="submit" class="btn btn-primary">${v.replaces ? t('money.save_correction') : t('shift.save')}</button></div>
  </form>`;
}

// The live checks: does the split add up, what should the drawer hold,
// and will the shift be final or wait for a shareholder.
function liveLines(form, prep, v) {
  const dues = v.dues.reduce((s, d) => s + num(d.amount), 0);
  const split = round(num(v.cash) + num(v.bkash) + num(v.card) + dues);
  const diff = round(num(v.net_sales) - split);
  render(form.querySelector('.split-line'), !v.net_sales ? '' : diff === 0
    ? html`<span class="ok-text">${t('shift.split_ok', { split: money(split) })}</span>`
    : html`<span class="warn-text">${t('shift.split_off', { split: money(split), diff: money(Math.abs(diff)) })}</span>`);
  const expected = round(prep.drawer_before + num(v.cash) - num(v.handed));
  const shortOver = round(num(v.actual_cash) - expected);
  const counted = v.actual_cash !== '' && v.actual_cash !== undefined;
  let state = '';
  if (counted) {
    const d = decide(prep.actor, { kind: 'daily_shift', amount: num(v.net_sales), short_over: shortOver }, prep.approval);
    state = d.final ? html`<p class="approval approval-final">${t('shift.balanced_final')}</p>`
      : html`<div class="approval approval-wait"><strong>${t('money.will_wait')}</strong>
          <ul class="reasons">${reasonTexts(d.reasons).map((r) => html`<li>${r}</li>`)}</ul></div>`;
  }
  render(form.querySelector('.drawer-line'), html`
    <dl class="sums">
      <dt>${t('shift.drawer_before')}</dt><dd>${money(prep.drawer_before)}</dd>
      <dt>${t('shift.plus_cash')}</dt><dd>${money(num(v.cash))}</dd>
      <dt>${t('shift.minus_handed')}</dt><dd>${money(num(v.handed))}</dd>
      <dt><strong>${t('shift.expected')}</strong></dt><dd><strong>${money(expected)}</strong></dd>
      ${counted ? html`<dt>${t('shift.counted')}</dt><dd>${money(num(v.actual_cash))}</dd>
        <dt>${t('shift.difference')}</dt><dd class="${shortOver ? 'warn-text' : 'ok-text'}">${shortOver === 0 ? t('shift.line_balanced')
          : t(shortOver < 0 ? 'shift.line_short' : 'shift.line_over', { amount: money(Math.abs(shortOver)) })}</dd>` : ''}
      ${counted && v.pos_expected !== '' && v.pos_expected !== undefined ? posLines(num(v.pos_expected), round(num(v.actual_cash) - num(v.pos_expected))) : ''}
    </dl>${state}`);
}

// Loyverse's expected cash beside the app's, with its own gap (for
// information: the app's figure counts).
function posLines(expected, gap) {
  return html`<dt>${t('shift.pos_expected_short')}</dt><dd>${money(expected)}</dd>
    <dt>${t('shift.pos_gap')}</dt><dd class="muted">${gap === 0 ? t('shift.line_balanced')
      : t(gap < 0 ? 'shift.line_short' : 'shift.line_over', { amount: money(Math.abs(gap)) })}</dd>`;
}

function summaryView(e) {
  const d = e.details;
  return html`<section class="panel">
    <div class="panel-head"><h2 class="section-title">${t('shift.entered', { date: dateShort(e.date) })}</h2>${stateChip(e)}</div>
    <dl class="sums">
      <dt>${t('shift.net_sales')}</dt><dd>${money(e.amount)}</dd>
      <dt>${t('shift.cash')}</dt><dd>${money(d.cash)}</dd>
      <dt>${t('shift.bkash')}</dt><dd>${money(d.bkash)}</dd>
      <dt>${t('shift.card')}</dt><dd>${money(d.card)}</dd>
      <dt>${t('shift.dues')}</dt><dd>${money(d.dues.reduce((s, x) => s + x.amount, 0))}</dd>
      <dt>${t('shift.handed')}</dt><dd>${money(d.handed)}</dd>
      <dt>${t('shift.expected')}</dt><dd>${money(d.expected_cash)}</dd>
      <dt>${t('shift.counted')}</dt><dd>${money(d.actual_cash)}</dd>
      <dt>${t('shift.difference')}</dt><dd>${d.short_over === 0 ? t('shift.line_balanced') : t(d.short_over < 0 ? 'shift.line_short' : 'shift.line_over', { amount: money(Math.abs(d.short_over)) })}</dd>
      ${d.pos_expected === null || d.pos_expected === undefined ? '' : posLines(d.pos_expected, d.pos_gap)}
    </dl>
    <div class="form-actions"><button type="button" class="btn" data-act="open" data-id="${e.id}">${t('shift.open')}</button></div>
  </section>`;
}

function fromShift(e) {
  const d = e.details;
  const v = { replaces: e.id, net_sales: String(e.amount), note: e.note, dues: d.dues.map((x) => ({ party_id: x.party_id, amount: String(x.amount) })) };
  for (const k of ['books_sales', 'cash', 'bkash', 'card', 'handed', 'actual_cash']) v[k] = d[k] ? String(d[k]) : '';
  v.pos_expected = d.pos_expected === null || d.pos_expected === undefined ? '' : String(d.pos_expected);
  for (const k of ['handed_to', 'bkash_account_id', 'card_account_id']) v[k] = d[k];
  return v;
}

export const dailyPage = {
  path: '/daily',
  title: 'nav.daily',
  perm: 'acc.daily',
  mount(el, { query }) {
    const date = query.date || today();
    const opId = crypto.randomUUID();
    let prep = null;
    let values = null;

    render(el, html`
      <div class="list-bar">
        <label class="field-inline">${t('money.field.date')} <input type="date" value="${date}" data-role="date" max="${today()}"></label>
        <a class="btn" href="#/closing?date=${date}">${t('shift.go_closing')}</a>
      </div>
      <div class="shift-body" aria-busy="true"></div>`);
    const body = el.querySelector('.shift-body');
    el.querySelector('[data-role="date"]').addEventListener('change', (e) => {
      if (e.target.value) location.hash = `#/daily?date=${e.target.value}`;
    });

    function collect(form) {
      const v = { ...values, dues: [] };
      for (const input of form.elements) {
        if (!input.name) continue;
        const m = /^dues\.(\d+)\.(party_id|amount)$/.exec(input.name);
        if (m) {
          v.dues[Number(m[1])] = v.dues[Number(m[1])] || {};
          v.dues[Number(m[1])][m[2]] = input.value;
        } else {
          v[input.name] = input.value;
        }
      }
      v.dues = v.dues.filter(Boolean);
      return v;
    }

    function drawForm() {
      const old = body.querySelector('form');
      const wasDirty = Boolean(old && isDirty(old));
      if (old) markDirty(old, false);
      render(body, html`
        ${prep.closed ? html`<p class="notice notice-warn">${t('shift.day_closed')}</p>` : ''}
        ${values.replaces ? html`<p class="notice">${t('money.correcting', { id: values.replaces })}</p>` : ''}
        ${formHtml(prep, values)}`);
      const form = body.querySelector('form');
      if (wasDirty) markDirty(form, true);
      liveLines(form, prep, values);
      form.addEventListener('input', () => {
        values = collect(form);
        liveLines(form, prep, values);
      });
      on(form, 'click', {
        'add-due': () => {
          values = collect(form);
          values.dues.push({ party_id: '', amount: '' });
          drawForm();
          markDirty(body.querySelector('form'), true);
        },
        'remove-due': (e, btn) => {
          values = collect(form);
          values.dues.splice(Number(btn.dataset.i), 1);
          drawForm();
          markDirty(body.querySelector('form'), true);
        },
      });
      bindForm(form, {
        schema: ACTIONS['shift.save'].schema,
        busyLabel: t('common.saving'),
        mapValues: () => {
          const v = collect(form);
          const out = { date, dues: v.dues.map((d) => ({ party_id: d.party_id || null, amount: d.amount })) };
          for (const k of AMOUNTS) if (v[k] !== '' && v[k] !== undefined) out[k] = v[k];
          for (const k of ['handed_to', 'bkash_account_id', 'card_account_id', 'note']) if (v[k]) out[k] = v[k];
          // An account is sent only with an amount that needs it.
          if (!num(out.bkash)) delete out.bkash_account_id;
          if (!num(out.card)) delete out.card_account_id;
          if (!num(out.handed)) delete out.handed_to;
          if (values.replaces) out.replaces = values.replaces;
          return out;
        },
        onSubmit: async (payload) => {
          let send = payload;
          for (;;) {
            const reply = await write('shift.save', send, { opId, label: t('shift.label', { date: dateShort(date) }) });
            if (reply.status !== 'needs_input') return reply;
            const answer = await duplicateDialog(reply.prompt);
            if (!answer || answer.fix) return { status: 'closed' };
            send = { ...payload, reason: answer.reason };
          }
        },
        onSaved: async (reply) => {
          // Filled from an uploaded shift report: the report is filed on the shift.
          if (query.from_doc && reply.status === 'saved') await write('intake.attach', { id: query.from_doc, record_id: reply.record_id });
          if (reply.status === 'queued') toast(t('money.saved_on_phone'));
          else toast(reply.data.approval === 'waiting' ? t('money.saved_waiting') : t('money.saved'));
          load();
        },
      });
    }

    function draw() {
      if (!prep.drawer) {
        render(body, html`<p class="notice notice-warn">${t('shift.no_drawer')}</p>`);
        return;
      }
      if (prep.existing && !values) {
        render(body, html`${summaryView(prep.existing)}`);
        return;
      }
      const first = (kind) => (prep.accounts.find((a) => a.kind === kind) || {}).id || '';
      values = values || { dues: [], bkash_account_id: first('bkash'), card_account_id: first('bank'), handed_to: first('owner'), ...fromReport() };
      drawForm();
    }

    // Figures from an uploaded Loyverse shift report, passed in the link.
    function fromReport() {
      if (!query.from_doc) return {};
      const out = {};
      for (const k of ['net_sales', 'cash', 'bkash', 'card', 'actual_cash', 'pos_expected', 'note']) if (query[k]) out[k] = query[k];
      return out;
    }

    async function load() {
      body.setAttribute('aria-busy', 'true');
      try {
        prep = (await read('shift.prepare', { date })).data;
        values = query.replaces && prep.existing && prep.existing.id === query.replaces && !values ? fromShift(prep.existing) : null;
        draw();
      } catch (err) {
        render(body, errorBox(errorText(err)));
      } finally {
        body.removeAttribute('aria-busy');
      }
    }

    const off = on(body, 'click', { open: (e, btn) => openEntry(btn.dataset.id, load) });
    load();
    return off;
  },
};
