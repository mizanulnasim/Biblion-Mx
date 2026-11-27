// The one money screen. "What is this?" picks the kind and the form changes
// to fit. Before saving, it says whether the entry will be final or wait
// for a shareholder, and why. A duplicate warning opens a dialog that shows
// the earlier entries, offers each fix, and asks for a reason; answering
// sends the same entry again with the same op_id, so it is saved once.
// Also used to correct an entry (#/money/new?replaces=ID).

import { html, on, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { dateShort, money, today } from '../core/format.js';
import { isDirty, markDirty } from '../core/router.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { KINDS, KIND_GROUPS } from '../../../shared/money/kinds.js';
import { decide } from '../../../shared/rules/approval.js';
import { details, kindLabel, reasonTexts } from './money-common.js';

// What a fix turns the entry into, by kind.
const FIX_LABELS = { transfer: 'dup.fix.transfer', vendor_purchase_paid: 'dup.fix.vendor', publisher_payment: 'dup.fix.publisher' };

const FIELDS = ['kind', 'date', 'amount', 'account_id', 'to_account_id', 'category_id', 'party_id', 'direction', 'covers_up_to', 'period', 'instalment', 'note', 'ref'];

function accountLabel(kind) {
  const cash = KINDS[kind].cash;
  if (cash === 'in') return t('money.field.into_account');
  if (cash === 'either') return t('money.field.account');
  return t('money.field.from_account');
}

export function fieldsFor(kind, boot) {
  const k = KINDS[kind];
  const accounts = boot.accounts.map((a) => ({ value: a.id, label: a.name }));
  const fields = [
    {
      name: 'kind', label: t('money.what'), type: 'select', required: true, help: t(KINDS[kind].help),
      groups: KIND_GROUPS.map((g) => ({
        label: t(g.label),
        options: Object.keys(KINDS).filter((id) => KINDS[id].group === g.id && boot.kinds[id] !== 'none').map((id) => ({
          value: id,
          label: boot.kinds[id] === 'request' ? t('money.as_request', { kind: kindLabel(id) }) : kindLabel(id),
        })),
      })).filter((g) => g.options.length),
    },
    { name: 'date', label: t('money.field.date'), type: 'date', required: true },
    { name: 'amount', label: t('money.field.amount'), inputmode: 'decimal', required: true },
  ];
  if (k.party === 'category') {
    fields.push({
      name: 'category_id', label: t('money.field.category'), type: 'select', required: true, placeholder: t('money.choose'),
      options: boot.categories.map((c) => ({ value: c.id, label: c.name })),
      help: boot.categories.length ? '' : t('money.no_categories'),
    });
  }
  if (k.party === 'contact') {
    fields.push({
      name: 'party_id', label: t('money.field.contact'), type: 'select', required: true, placeholder: t('money.choose'),
      options: boot.contacts.map((c) => ({ value: c.id, label: t('money.contact_due', { name: c.name, due: money(c.due) }) })),
    });
  }
  if (k.party === 'shareholder') {
    fields.push({
      name: 'party_id', label: t('money.field.shareholder'), type: 'select', required: true, placeholder: t('money.choose'),
      options: boot.shareholders.map((s) => ({ value: s.id, label: s.advance ? t('money.advance_out', { name: s.name, advance: money(s.advance) }) : s.name })),
    });
  }
  if (k.party === 'staff') {
    // What the shop owes each person and what they owe back, to pay the right amount.
    fields.push({
      name: 'party_id', label: t('money.field.staff'), type: 'select', required: true, placeholder: t('money.choose'),
      options: boot.staff.map((s) => ({ value: s.id, label: t('money.staff_account', { name: s.name, owed: money(s.owed), advance: money(s.advance) }) })),
      help: boot.staff.length ? '' : t('money.no_staff'),
    });
  }
  if (k.period) {
    fields.push({ name: 'period', label: t('money.field.period'), type: 'month', required: true, help: t('money.period_help') });
  }
  if (k.party === 'vendor' || k.party === 'publisher') {
    fields.push({
      name: 'party_id', label: t(k.party === 'vendor' ? 'money.field.vendor' : 'money.field.publisher'), type: 'select', required: true, placeholder: t('money.choose'),
      options: boot.suppliers.filter((s) => s.kind === k.party).map((s) => ({
        value: s.id, label: s.owed === null ? s.name : t('money.supplier_owed', { name: s.name, owed: money(s.owed) }),
      })),
      help: boot.suppliers.some((s) => s.kind === k.party) ? '' : t('money.no_suppliers'),
    });
  }
  if (k.instalment) {
    fields.push({ name: 'instalment', label: t('money.field.instalment'), inputmode: 'decimal', help: t('money.instalment_help') });
  }
  if (k.covers) {
    fields.push({ name: 'covers_up_to', label: t('money.field.covers_up_to'), type: 'date', help: t('money.covers_help') });
  }
  if (k.cash === 'either') {
    fields.push({
      name: 'direction', label: t('money.field.direction'), type: 'select', required: true, placeholder: t('money.choose'),
      options: [{ value: 'in', label: t('money.direction.in') }, { value: 'out', label: t('money.direction.out') }],
    });
  }
  if (k.cash !== 'none') {
    fields.push({ name: 'account_id', label: accountLabel(kind), type: 'select', required: true, placeholder: t('money.choose'), options: accounts });
  }
  if (k.cash === 'transfer') {
    fields.push({ name: 'to_account_id', label: t('money.field.to_account'), type: 'select', required: true, placeholder: t('money.choose'), options: accounts });
  }
  fields.push(
    { name: 'note', label: t('money.field.note'), type: 'textarea' },
    k.bill
      ? { name: 'ref', label: t('money.field.bill_no'), help: t('money.bill_help') }
      : { name: 'ref', label: t('money.field.ref'), help: t('money.ref_help') },
  );
  return fields;
}

// What will happen on saving: final, or waiting and why.
export function approvalNotice(values, boot) {
  const amount = Number(String(values.amount || '').replace(/,/g, ''));
  if (!values.kind || !(amount > 0)) return '';
  const category = boot.categories.find((c) => c.id === values.category_id);
  const d = decide(boot.actor, { kind: values.kind, amount, category_needs_shareholder: Boolean(category && category.needs_shareholder) }, boot.approval);
  if (d.final) return html`<p class="approval approval-final">${t('money.will_be_final')}</p>`;
  return html`<div class="approval approval-wait"><strong>${t('money.will_wait')}</strong>
    <ul class="reasons">${reasonTexts(d.reasons).map((r) => html`<li>${r}</li>`)}</ul></div>`;
}

// Resolves {reason}, {fix}, {attach: record id} or null when closed.
// With `attach` (an uploaded document), each earlier entry offers to file
// the document on it instead of saving a new entry.
export function duplicateDialog(prompt, { attach = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (value) => {
      answered = true;
      resolve(value);
      dialog.close();
    };
    const dialog = formDialog(t('dup.title'), html`
      <ul class="warnings-list">${prompt.warnings.map((w, i) => html`<li class="warning">
        <p>${t(w.code, w.params)}</p>
        ${w.existing.length ? html`<ul class="existing">${w.existing.map((e) => html`<li>
          <span>${dateShort(e.date)} · ${kindLabel(e.kind)} · <strong>${money(e.amount)}</strong> · ${details(e)}</span>
          <span class="muted">${t('money.by_name', { name: e.entered_by_name })} <code>${e.id}</code></span>
          ${attach ? html`<button type="button" class="btn btn-small" data-act="attach" data-id="${e.id}">${t('intake.attach_here')}</button>` : ''}</li>`)}</ul>` : ''}
        ${w.fix ? html`<button type="button" class="btn" data-act="fix" data-i="${i}">${t(FIX_LABELS[w.fix.kind])}</button>` : ''}
      </li>`)}</ul>
      ${formView({
        submit: t('dup.save_anyway'),
        fields: [{ name: 'reason', label: t('dup.reason'), type: 'textarea', required: true, help: t('dup.reason_help') }],
      })}`);
    dialog.addEventListener('close', () => {
      if (!answered) resolve(null);
    });
    on(dialog, 'click', {
      fix: (e, btn) => answer({ fix: prompt.warnings[Number(btn.dataset.i)].fix }),
      attach: (e, btn) => answer({ attach: btn.dataset.id }),
    });
    bindForm(dialog.querySelector('form.form'), {
      schema: { reason: { type: 'text', required: true, max: 500 } },
      onSubmit: async ({ reason }) => {
        answer({ reason: reason.trim() });
        return { status: 'saved' };
      },
    });
  });
}

function fromEntry(e) {
  const values = {};
  for (const f of FIELDS) values[f] = e[f] ?? '';
  values.amount = String(e.amount);
  values.instalment = e.details && e.details.instalment ? String(e.details.instalment) : '';
  return values;
}

export const moneyFormPage = {
  path: '/money/new',
  title: 'money.new_title',
  perm: 'acc.entry',
  mount(el, { query }) {
    let boot = null;
    let values = { kind: query.kind || 'expense', date: today() };
    for (const f of FIELDS) if (query[f]) values[f] = query[f];
    // Set when a fix turns an expense and an income into one transfer.
    let pairId = query.pair_id || '';
    const replaces = query.replaces || '';
    // One op_id for this entry, kept through duplicate questions and fixes.
    const opId = crypto.randomUUID();

    function current() {
      const form = el.querySelector('form');
      if (!form) return values;
      const next = { ...values };
      for (const input of form.elements) if (input.name) next[input.name] = input.value;
      return next;
    }

    // For a publisher payment: what is owed, what earlier payments settled,
    // and the latest sales day this payment settles (filled in if empty).
    let hintSeq = 0;
    async function publisherHint(form) {
      const slot = form.querySelector('.supplier-slot');
      if (!KINDS[values.kind].covers || !values.party_id || boot.suppliers.every((s) => s.owed === null)) {
        render(slot, '');
        return;
      }
      const mine = ++hintSeq;
      try {
        const amount = Number(String(values.amount || '0').replace(/,/g, '')) || 0;
        const { data } = await read('publisher.suggest', { id: values.party_id, amount });
        if (mine !== hintSeq || !form.isConnected) return;
        render(slot, html`<p class="approval">${t('money.publisher_hint', { owed: money(data.owed) })}
          ${data.settled_to ? html`<br>${t('money.settled_to', { date: dateShort(data.settled_to) })}` : ''}
          ${data.suggest ? html`<br>${t('money.suggest_covers', { date: dateShort(data.suggest) })}` : ''}</p>`);
        const covers = form.elements.covers_up_to;
        if (covers && data.suggest && (!covers.value || covers.dataset.suggested === '1')) {
          covers.value = data.suggest;
          covers.dataset.suggested = '1';
          values.covers_up_to = data.suggest;
        }
      } catch (err) {
        render(slot, '');
      }
    }

    function draw() {
      const old = el.querySelector('form');
      const wasDirty = old && isDirty(old);
      if (old) markDirty(old, false);
      if (!KINDS[values.kind] || boot.kinds[values.kind] === 'none') values.kind = Object.keys(KINDS).find((id) => boot.kinds[id] !== 'none');
      render(el, html`
        ${replaces ? html`<p class="notice">${t('money.correcting', { id: replaces })}</p>` : ''}
        ${pairId ? html`<p class="notice">${t('money.pair_note', { id: pairId })}</p>` : ''}
        <section class="panel">${formView({
          fields: fieldsFor(values.kind, boot),
          values,
          submit: replaces ? t('money.save_correction') : t('common.save'),
          extra: html`<div class="supplier-slot" aria-live="polite"></div><div class="approval-slot" aria-live="polite">${approvalNotice(values, boot)}</div>`,
        })}</section>`);
      const form = el.querySelector('form');
      if (wasDirty) markDirty(form, true);
      form.addEventListener('change', (e) => {
        values = current();
        if (e.target.name === 'kind') draw();
        else if (e.target.name === 'party_id' || e.target.name === 'amount') publisherHint(form);
      });
      publisherHint(form);
      form.addEventListener('input', (e) => {
        // A date typed by the person is kept; only a suggested one is updated.
        if (e.target.name === 'covers_up_to') e.target.dataset.suggested = '0';
        values = current();
        render(form.querySelector('.approval-slot'), approvalNotice(values, boot));
      });
      bindForm(form, {
        schema: ACTIONS['money.save'].schema,
        busyLabel: t('common.saving'),
        mapValues: (raw) => {
          const out = {};
          for (const f of FIELDS) if (raw[f] !== undefined && raw[f] !== '') out[f] = raw[f];
          if (replaces) out.replaces = replaces;
          if (pairId && out.kind === 'transfer') out.pair_id = pairId;
          return out;
        },
        onSubmit: async (payload) => {
          const label = `${kindLabel(payload.kind)} · ${money(Number(String(payload.amount).replace(/,/g, '')))}`;
          let body = payload;
          for (;;) {
            const reply = await write('money.save', body, { opId, label });
            if (reply.status !== 'needs_input') return reply;
            const answer = await duplicateDialog(reply.prompt);
            if (!answer) return { status: 'closed' };
            if (answer.fix) {
              const { pair_id: pair, ...figures } = answer.fix;
              values = { ...current(), ...figures, amount: String(figures.amount) };
              pairId = pair || '';
              draw();
              markDirty(el.querySelector('form'), true);
              return { status: 'closed' };
            }
            body = { ...payload, reason: answer.reason };
          }
        },
        onSaved: async (reply) => {
          if (reply.status === 'queued') toast(t('money.saved_on_phone'));
          else toast(reply.data.approval === 'waiting' ? t('money.saved_waiting') : t('money.saved'));
          // Opened from a task: the entry is the task's record.
          if (query.task && reply.status === 'saved') await write('tasks.record', { id: query.task, record_id: reply.record_id });
          location.hash = query.task ? '#/tasks' : '#/money';
        },
      });
    }

    render(el, html`<div aria-busy="true"></div>`);
    (async () => {
      try {
        boot = (await read('money.boot')).data;
        if (replaces) {
          const { data } = await read('money.get', { id: replaces });
          values = fromEntry(data.entry);
        }
        draw();
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    })();
  },
};
