// Café orders: the list; a new order (a vendor, or all items, and how long
// to buy for); and one order. A draft shows what the app suggests; a
// quantity changed from it needs a reason, and a supply's on-hand amount is
// checked here. Once submitted (and approved), the order goes out as text
// or WhatsApp; bills are entered as they come (each a vendor purchase, with
// expiry dates); what isn't being bought is closed with a reason.

import { html, on, render } from '../ui/html.js';
import { chip, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView, whileBusy } from '../ui/form.js';
import { mountList } from '../ui/list.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can, getState } from '../core/state.js';
import { dateShort, money, today } from '../core/format.js';
import { markDirty } from '../core/router.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { duplicateDialog } from './money-form.js';
import { qtyUnit } from './cafe-common.js';

const STATES = {
  draft: ['cafe.order_state.draft', 'muted'], waiting: ['money.state.waiting', 'warn'], approved: ['cafe.order_state.approved', 'ok'],
  part: ['cafe.order_state.part', 'warn'], bought: ['cafe.order_state.bought', 'ok'], closed: ['req.state.closed', 'muted'],
};
const COVERS = { auto: 'cafe.cover.auto', item: 'cafe.cover.item', 7: 'cafe.cover.7', 14: 'cafe.cover.14', 30: 'cafe.cover.30', 60: 'cafe.cover.60', 90: 'cafe.cover.90' };
const stateChip = (s) => chip(t(STATES[s][0]), STATES[s][1]);

function newOrder(vendors) {
  const dialog = formDialog(t('cafe.new_order'), formView({
    submit: t('cafe.make_order'),
    values: { cover: 'auto' },
    fields: [
      { name: 'vendor_id', label: t('money.field.vendor'), type: 'select', placeholder: t('cafe.all_items'), options: vendors.map((v) => ({ value: v.id, label: v.name })), help: t('cafe.vendor_help') },
      { name: 'cover', label: t('cafe.buy_for'), type: 'select', required: true, options: Object.keys(COVERS).map((k) => ({ value: k, label: t(COVERS[k]) })), help: t('cafe.buy_for_help') },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['cafe.order.new'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ cover: v.cover, vendor_id: v.vendor_id || null }),
    onSubmit: (v) => write('cafe.order.new', v),
    onSaved: (reply) => {
      dialog.close();
      location.hash = `#/cafe/order?id=${reply.record_id}`;
    },
  });
}

export const cafeOrdersPage = {
  path: '/cafe/orders',
  title: 'nav.cafe_orders',
  perm: 'cafe.view',
  mount(el) {
    let vendors = [];
    read('money.boot').then(({ data }) => {
      vendors = data.suppliers.filter((s) => s.kind === 'vendor');
    }).catch(() => {});
    const list = mountList(el, {
      key: 'cafe-orders',
      action: 'cafe.orders',
      area: 'cafe',
      searchLabel: t('cafe.search_orders'),
      empty: t('cafe.no_orders'),
      emptySearch: t('list.no_match'),
      filters: [{ name: 'status', label: t('money.filter.all_states'), options: Object.keys(STATES).map((k) => ({ value: k, label: t(STATES[k][0]) })) }],
      tools: can('cafe.order') ? html`<button type="button" class="btn btn-primary" data-act="tool" data-tool="new">${t('cafe.new_order')}</button>` : '',
      columns: [
        { label: t('req.number'), cell: (o) => o.number, kind: 'nowrap code' },
        { label: t('money.field.date'), cell: (o) => dateShort(o.date), kind: 'nowrap' },
        { label: t('money.field.vendor'), cell: (o) => o.vendor || t('cafe.all_items') },
        { label: t('cafe.items_count'), cell: (o) => t('cafe.items_n', { count: o.count }), kind: 'nowrap' },
        { label: t('money.field.state'), cell: (o) => stateChip(o.status), kind: 'nowrap' },
      ],
      onRow: (o) => {
        location.hash = `#/cafe/order?id=${o.id}`;
      },
      onTool: () => newOrder(vendors),
    });
    return () => list.destroy();
  },
};

// The order as text, for WhatsApp or a message.
function asText(o) {
  const lines = o.lines.filter((l) => l.qty > 0).map((l, i) => `${i + 1}. ${l.name}: ${l.qty} ${l.unit}`);
  return [t('cafe.text_head', { number: o.number, date: dateShort(o.date) }), ...lines, t('req.text_foot')].join('\n');
}

function draftRow(l, i) {
  const changed = l.suggested !== null && Number(l.qty) !== l.suggested;
  return html`<tr>
    <td data-label="${t('cafe.item')}"><span><strong>${l.name}</strong> <span class="muted">${l.unit}</span></span></td>
    <td data-label="${t('cafe.on_hand')}" class="num"><span>${l.kind === 'supply'
      ? html`<input class="count-input" name="lines.${i}.on_hand" inputmode="decimal" value="${l.on_hand}" aria-label="${t('cafe.on_hand_of', { name: l.name })}">`
      : l.on_hand}</span></td>
    <td data-label="${t('cafe.suggested')}" class="num"><span>${l.suggested === null ? html`<span class="muted" title="${t('cafe.no_history')}">—</span>` : l.suggested}</span></td>
    <td data-label="${t('cafe.order_qty')}"><span><input class="count-input" name="lines.${i}.qty" inputmode="decimal" value="${l.qty}" aria-label="${t('cafe.order_qty_of', { name: l.name })}">
      <input type="hidden" name="lines.${i}.item_id" value="${l.item_id}"></span></td>
    <td data-label="${t('cafe.reason')}"><span><input class="reason-input" name="lines.${i}.reason" value="${l.reason}" ${changed ? '' : 'hidden'} placeholder="${t('cafe.reason_placeholder')}" aria-describedby="f-lines.${i}.reason-err" id="f-lines.${i}.reason">
      <span class="field-error" id="f-lines.${i}.reason-err"></span></span></td>
  </tr>`;
}

function receiveDialog(o, boot, onDone) {
  const left = o.lines.filter((l) => l.qty > (l.bought || 0));
  const vendors = boot.suppliers.filter((s) => s.kind === 'vendor');
  const dialog = formDialog(t('cafe.enter_bill'), html`<form class="form" novalidate>
    <div class="pair">
      <div class="field"><label for="f-vendor_id">${t('money.field.vendor')}</label><select id="f-vendor_id" name="vendor_id">
        ${vendors.map((v) => html`<option value="${v.id}" ${v.id === o.vendor_id ? 'selected' : ''}>${v.name}</option>`)}</select><p class="field-error" id="f-vendor_id-err"></p></div>
      <div class="field"><label for="f-date">${t('money.field.date')}</label><input id="f-date" name="date" type="date" value="${today()}"><p class="field-error" id="f-date-err"></p></div>
      <div class="field"><label for="f-ref">${t('money.field.bill_no')}</label><input id="f-ref" name="bill_no"><p class="field-error" id="f-ref-err"></p></div>
    </div>
    <div class="pair">
      <div class="field"><label for="f-paid">${t('cafe.paid')}</label><select id="f-paid" name="paid"><option value="now">${t('cafe.paid_now')}</option><option value="later">${t('cafe.paid_later')}</option></select></div>
      <div class="field"><label for="f-account_id">${t('money.field.from_account')}</label><select id="f-account_id" name="account_id"><option value="">${t('money.choose')}</option>
        ${boot.accounts.map((a) => html`<option value="${a.id}">${a.name}</option>`)}</select><p class="field-error" id="f-account_id-err"></p></div>
    </div>
    <div class="list-body"><table class="table">
      <thead><tr><th scope="col">${t('cafe.item')}</th><th scope="col">${t('cafe.bought_qty')}</th><th scope="col">${t('cafe.unit_cost')}</th><th scope="col">${t('cafe.expiry')}</th></tr></thead>
      <tbody>${left.map((l, i) => html`<tr>
        <td data-label="${t('cafe.item')}"><span>${l.name}<input type="hidden" name="lines.${i}.item_id" value="${l.item_id}"></span></td>
        <td data-label="${t('cafe.bought_qty')}"><span><input class="count-input" name="lines.${i}.qty" inputmode="decimal" value="${Math.max(0, l.qty - (l.bought || 0))}"></span></td>
        <td data-label="${t('cafe.unit_cost')}"><span><input class="count-input" name="lines.${i}.cost" inputmode="decimal"></span></td>
        <td data-label="${t('cafe.expiry')}"><span><input name="lines.${i}.expiry" type="date"></span></td></tr>`)}</tbody>
    </table></div>
    <p class="help">${t('cafe.expiry_help')}</p>
    <p class="bill-total"></p>
    <div class="form-error" role="alert"></div>
    <div class="form-actions"><button type="submit" class="btn btn-primary">${t('cafe.save_bill')}</button></div>
  </form>`);
  const form = dialog.querySelector('form');
  const rows = () => {
    const out = [];
    for (const input of form.elements) {
      const m = /^lines\.(\d+)\.(\w+)$/.exec(input.name || '');
      if (m) {
        out[Number(m[1])] = out[Number(m[1])] || {};
        out[Number(m[1])][m[2]] = input.value.trim();
      }
    }
    return out.filter((r) => r && Number(r.qty) > 0);
  };
  const total = () => render(form.querySelector('.bill-total'), t('cafe.bill_total', { total: money(rows().reduce((s, r) => s + Number(r.qty) * (Number(r.cost) || 0), 0)) }));
  form.addEventListener('input', total);
  total();
  const opId = crypto.randomUUID();
  bindForm(form, {
    schema: {},
    busyLabel: t('common.saving'),
    mapValues: (v) => ({
      id: o.id, date: v.date, vendor_id: v.vendor_id, bill_no: v.bill_no || null, paid: v.paid, account_id: v.paid === 'now' ? v.account_id || null : null,
      lines: rows().map((r) => ({ item_id: r.item_id, qty: r.qty, cost: r.cost || '0', expiry: r.expiry || null })),
    }),
    onSubmit: async (payload) => {
      let body = payload;
      for (;;) {
        const reply = await write('cafe.order.receive', body, { opId });
        if (reply.status !== 'needs_input') return reply;
        const answer = await duplicateDialog(reply.prompt);
        if (!answer || !answer.reason) return { status: 'closed' };
        body = { ...payload, reason: answer.reason };
      }
    },
    onSaved: (reply) => {
      dialog.close();
      toast(reply.data.approval === 'waiting' ? t('money.saved_waiting') : t('cafe.bill_saved'));
      onDone();
    },
  });
}

export const cafeOrderPage = {
  path: '/cafe/order',
  title: 'cafe.order_title',
  perm: 'cafe.view',
  mount(el, { query }) {
    let o = null;
    let boot = null;

    function collect(form) {
      const rows = [];
      for (const input of form.elements) {
        const m = /^lines\.(\d+)\.(\w+)$/.exec(input.name || '');
        if (m) {
          rows[Number(m[1])] = rows[Number(m[1])] || {};
          rows[Number(m[1])][m[2]] = input.value.trim();
        }
      }
      return rows.filter(Boolean);
    }

    async function saveDraft(form) {
      const lines = collect(form).map((r) => {
        const line = o.lines.find((l) => l.item_id === r.item_id);
        const out = { item_id: r.item_id, qty: r.qty === '' ? '0' : r.qty, reason: r.reason || null };
        if (line.kind === 'supply' && r.on_hand !== undefined && r.on_hand !== '') out.on_hand = r.on_hand;
        return out;
      });
      return write('cafe.order.save', { id: o.id, version: o.version, lines, note: null });
    }

    function draw() {
      const draft = o.status === 'draft' && can('cafe.order');
      render(el, html`
        <section class="panel">
          <div class="panel-head"><h2 class="section-title">${o.number} · ${o.vendor || t('cafe.all_items')}</h2>${stateChip(o.status)}</div>
          <p class="muted">${t('cafe.order_meta', { date: dateShort(o.date), by: o.entered_by, cover: t(COVERS[o.cover]) })}</p>
          ${o.closed_reason ? html`<p class="notice">${t('cafe.closed_line', { reason: o.closed_reason })}</p>` : ''}
          <div class="form-actions req-actions">
            ${['approved', 'part', 'bought'].includes(o.status) ? html`<button type="button" class="btn" data-act="copy">${t('req.copy_text')}</button>
              <a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(asText(o))}">${t('req.whatsapp')}</a>` : ''}
            ${(o.status === 'approved' || o.status === 'part') && can('cafe.receive') ? html`<button type="button" class="btn btn-primary" data-act="receive">${t('cafe.enter_bill')}</button>` : ''}
            ${o.status === 'waiting' && can('cafe.approve') && o.entered_by_id !== getState().meta.user.id ? html`<button type="button" class="btn btn-primary" data-act="approve">${t('money.approve')}</button>` : ''}
            ${!['bought', 'closed'].includes(o.status) && can('cafe.order') ? html`<button type="button" class="btn btn-danger-quiet" data-act="close">${t('cafe.close_order')}</button>` : ''}
          </div>
          <div class="order-error"></div>
        </section>
        ${draft ? html`<form class="panel take-form" novalidate>
          <p class="help">${t('cafe.draft_help')}</p>
          <div class="list-body"><table class="table">
            <thead><tr><th scope="col">${t('cafe.item')}</th><th scope="col">${t('cafe.on_hand')}</th><th scope="col">${t('cafe.suggested')}</th><th scope="col">${t('cafe.order_qty')}</th><th scope="col">${t('cafe.reason')}</th></tr></thead>
            <tbody>${o.lines.map(draftRow)}</tbody></table></div>
          <div class="form-error" role="alert"></div>
          <div class="form-actions"><button type="submit" class="btn">${t('req.save_draft')}</button><button type="button" class="btn btn-primary" data-act="submit">${t('cafe.submit')}</button></div>
        </form>` : html`<section class="panel"><div class="list-body"><table class="table">
          <thead><tr><th scope="col">${t('cafe.item')}</th><th scope="col">${t('cafe.order_qty')}</th><th scope="col">${t('cafe.bought_qty')}</th><th scope="col">${t('cafe.reason')}</th></tr></thead>
          <tbody>${o.lines.filter((l) => l.qty > 0).map((l) => html`<tr>
            <td data-label="${t('cafe.item')}"><span>${l.name}</span></td>
            <td data-label="${t('cafe.order_qty')}" class="num"><span>${qtyUnit(l.qty, l.unit)}</span></td>
            <td data-label="${t('cafe.bought_qty')}" class="num"><span>${qtyUnit(l.bought || 0, l.unit)}</span></td>
            <td data-label="${t('cafe.reason')}"><span>${l.reason}</span></td></tr>`)}</tbody>
        </table></div></section>`}`);
      const form = el.querySelector('form.take-form');
      if (!form) return;
      // The reason box shows when a quantity differs from the suggestion.
      form.addEventListener('input', (e) => {
        const m = /^lines\.(\d+)\.qty$/.exec(e.target.name || '');
        if (!m) return;
        const line = o.lines[Number(m[1])];
        form.elements[`lines.${m[1]}.reason`].hidden = !(line.suggested !== null && Number(e.target.value) !== line.suggested);
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

    async function load() {
      try {
        [o, boot] = await Promise.all([
          read('cafe.order.get', { id: query.id }).then((r) => r.data),
          read('money.boot').then((r) => r.data).catch(() => ({ suppliers: [], accounts: [] })),
        ]);
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }

    const showError = (reply) => render(el.querySelector('.order-error'), errorBox(t(errorMessageId(reply.error.code), reply.error.params)));
    const off = on(el, 'click', {
      submit: (e, btn) => whileBusy(btn, t('common.saving'), async () => {
        const form = el.querySelector('form.take-form');
        const saved = await saveDraft(form);
        if (saved.status !== 'saved') {
          const fields = saved.error.fields || {};
          for (const [key, err] of Object.entries(fields)) {
            const slot = form.querySelector(`#${CSS.escape(`f-${key}-err`)}`);
            if (slot) slot.textContent = t(err.code, err.params);
            const input = form.elements[key];
            if (input) input.hidden = false;
          }
          if (!Object.keys(fields).length) showError(saved);
          return;
        }
        markDirty(form, false);
        const reply = await write('cafe.order.submit', { id: o.id });
        if (reply.status === 'saved') {
          toast(reply.data.status === 'waiting' ? t('cafe.order_waiting') : t('cafe.order_approved'));
          load();
        } else {
          showError(reply);
        }
      }),
      approve: async () => {
        const reply = await write('cafe.order.approve', { id: o.id });
        if (reply.status === 'saved') load();
        else showError(reply);
      },
      copy: async () => {
        await navigator.clipboard.writeText(asText(o));
        toast(t('req.copied'));
      },
      receive: () => receiveDialog(o, boot, load),
      close: () => {
        const dialog = formDialog(t('cafe.close_order'), formView({ submit: t('cafe.close_order'), fields: [{ name: 'reason', label: t('books.reason'), type: 'textarea', required: true }] }));
        bindForm(dialog.querySelector('form.form'), {
          schema: ACTIONS['cafe.order.close'].schema,
          busyLabel: t('common.saving'),
          mapValues: (v) => ({ ...v, id: o.id }),
          onSubmit: (v) => write('cafe.order.close', v),
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
