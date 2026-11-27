// Performance reviews: mine (give my view, read the shared review,
// acknowledge it) and, for managers, the reviews they write (start one,
// score each criterion 1–5 beside the facts, share it). Also Settings →
// Reviews (the criteria, and whether people give their own view first).

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { onArea } from '../core/live.js';
import { dateShort, duration, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

const STATUS = {
  self: ['reviews.status.self', 'warn'], draft: ['reviews.status.draft', 'muted'],
  shared: ['reviews.status.shared', 'warn'], acknowledged: ['reviews.status.acknowledged', 'ok'],
};
const SCALE = { 1: 'reviews.scale.1', 2: 'reviews.scale.2', 3: 'reviews.scale.3', 4: 'reviews.scale.4', 5: 'reviews.scale.5' };
const shortDate = (date) => dateShort(`${date}T06:00:00Z`);
const period = (r) => t('leave.span', { from: shortDate(r.from), to: shortDate(r.to) });

function factsView(f) {
  return html`<p class="muted">${t('reviews.facts', {
    worked: f.worked_days, hours: duration(f.worked_min), late: f.late_days, absent: f.absent_days, leave: f.leave_days,
    done: f.tasks_done, not_done: f.tasks_not_done, missed: f.tasks_missed,
  })}</p>`;
}

function linesView(lines, title) {
  if (!lines.length || lines.every((l) => !l.score)) return '';
  return html`<h3 class="section-title">${title}</h3><dl class="slip">${lines.map((l) => html`
    <dt>${l.name}${l.note ? html`<br><span class="muted">${l.note}</span>` : ''}</dt><dd>${l.score ? t('reviews.score_of', { score: l.score }) : '—'}</dd>`)}</dl>`;
}

// A form with a 1–5 choice and a note for each criterion.
function scoreDialog(title, lines, { submit, extra = '', withSummary = false, summary = '', onSubmit }) {
  const fields = [];
  lines.forEach((l, i) => {
    fields.push(
      { name: `score_${i}`, label: l.name, type: 'select', placeholder: t('reviews.no_score'), options: Object.keys(SCALE).map((n) => ({ value: n, label: t(SCALE[n]) })) },
      { name: `note_${i}`, label: t('reviews.note'), type: 'textarea' },
    );
  });
  if (withSummary) fields.push({ name: 'summary', label: t('reviews.summary'), type: 'textarea' });
  const values = { summary };
  lines.forEach((l, i) => {
    values[`score_${i}`] = l.score ? String(l.score) : '';
    values[`note_${i}`] = l.note;
  });
  const dialog = formDialog(title, formView({ submit, values, fields, extra }));
  const collect = (v) => lines.map((l, i) => ({ score: v[`score_${i}`] ? Number(v[`score_${i}`]) : null, note: v[`note_${i}`] }));
  return { dialog, collect, form: dialog.querySelector('form.form'), onSubmit };
}

function rateDialog(r, onDone) {
  const { dialog, collect, form } = scoreDialog(t('reviews.review_of', { name: r.staff.name }), r.criteria, {
    submit: t('reviews.save_draft'),
    withSummary: true,
    summary: r.summary,
    extra: html`${factsView(r.facts)}${linesView(r.self, t('reviews.their_view'))}
      <label class="field-check"><input type="checkbox" name="share" ${r.status === 'self' ? 'disabled' : ''}> ${t('reviews.share_now')}</label>
      ${r.status === 'self' ? html`<p class="help">${t('reviews.wait_self')}</p>` : ''}`,
  });
  bindForm(form, {
    schema: { summary: ACTIONS['reviews.score'].schema.summary },
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ id: r.id, version: r.version, lines: collect(v), summary: v.summary, share: Boolean(v.share) }),
    onSubmit: (v) => write('reviews.score', v),
    onSaved: (reply) => {
      dialog.close();
      toast(t(form.elements.share.checked ? 'reviews.shared' : 'setup.saved'));
      onDone(reply);
    },
  });
}

function selfDialog(r, onDone) {
  const { dialog, collect, form } = scoreDialog(t('reviews.my_view'), r.self, {
    submit: t('hr.send_fix'),
    extra: html`<p class="help">${t('reviews.my_view_help')}</p>${factsView(r.facts)}`,
  });
  bindForm(form, {
    schema: {},
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ id: r.id, lines: collect(v) }),
    onSubmit: (v) => write('reviews.self', v),
    onSaved: () => {
      dialog.close();
      toast(t('reviews.view_sent'));
      onDone();
    },
  });
}

function ackDialog(r, onDone) {
  const dialog = formDialog(t('reviews.ack'), formView({
    submit: t('reviews.ack'),
    fields: [{ name: 'comment', label: t('reviews.comment'), type: 'textarea', help: t('reviews.comment_help') }],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['reviews.ack'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ id: r.id, comment: v.comment }),
    onSubmit: (v) => write('reviews.ack', v),
    onSaved: () => {
      dialog.close();
      toast(t('reviews.acked'));
      onDone();
    },
  });
}

function startDialog(staff, onDone) {
  const from = `${today().slice(0, 7)}-01`;
  const dialog = formDialog(t('reviews.start'), formView({
    submit: t('reviews.start'),
    values: { from, to: today() },
    fields: [
      { name: 'staff_id', label: t('nav.staff'), type: 'select', required: true, placeholder: t('money.choose'), options: staff.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'from', label: t('leave.from'), type: 'date', required: true },
      { name: 'to', label: t('leave.to'), type: 'date', required: true },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['reviews.start'].schema,
    busyLabel: t('common.saving'),
    onSubmit: (v) => write('reviews.start', v),
    onSaved: () => {
      dialog.close();
      toast(t('reviews.started'));
      onDone();
    },
  });
}

function reviewItem(r, { manager }) {
  return html`<li class="check-item">
    <span><strong>${manager ? `${r.staff.name} · ` : ''}${period(r)}</strong> ${chip(t(STATUS[r.status][0]), STATUS[r.status][1])}</span>
    ${r.status === 'shared' || r.status === 'acknowledged' || manager ? html`${factsView(r.facts)}${linesView(r.criteria, t('reviews.scores'))}
      ${r.summary ? html`<p>${r.summary}</p>` : ''}` : ''}
    ${!manager ? linesView(r.self, t('reviews.my_view')) : ''}
    ${r.staff_comment ? html`<p class="muted">${t('reviews.their_comment', { comment: r.staff_comment })}</p>` : ''}
    <span class="check-actions">
      ${!manager && r.status === 'self' ? html`<button type="button" class="btn btn-small btn-primary" data-act="self" data-id="${r.id}">${t('reviews.give_view')}</button>` : ''}
      ${!manager && r.status === 'shared' ? html`<button type="button" class="btn btn-small btn-primary" data-act="ack" data-id="${r.id}">${t('reviews.ack')}</button>` : ''}
      ${manager && (r.status === 'self' || r.status === 'draft') ? html`<button type="button" class="btn btn-small btn-primary" data-act="rate" data-id="${r.id}">${t('reviews.write')}</button>` : ''}
    </span></li>`;
}

export const reviewsPage = {
  path: '/reviews',
  title: 'nav.reviews',
  perm: 'performance.manage|self.staff',
  mount(el) {
    let data = null;
    async function load() {
      try {
        data = (await read('reviews.list')).data;
        render(el, html`
          ${can('self.staff') ? html`<section class="panel"><h2 class="section-title">${t('reviews.mine')}</h2>
            ${data.mine.length ? html`<ul class="waiting-list">${data.mine.map((r) => reviewItem(r, { manager: false }))}</ul>` : emptyState(t('reviews.none_mine'))}</section>` : ''}
          ${can('performance.manage') ? html`<section class="panel"><h2 class="section-title">${t('reviews.theirs')}</h2>
            <div class="list-bar"><button type="button" class="btn btn-primary" data-act="start">${t('reviews.start')}</button></div>
            ${data.theirs.length ? html`<ul class="waiting-list">${data.theirs.map((r) => reviewItem(r, { manager: true }))}</ul>` : emptyState(t('reviews.none_theirs'))}</section>` : ''}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const find = (id) => [...data.mine, ...data.theirs].find((r) => r.id === id);
    const offClick = on(el, 'click', {
      start: () => startDialog(data.staff, load),
      rate: (e, btn) => rateDialog(find(btn.dataset.id), load),
      self: (e, btn) => selfDialog(find(btn.dataset.id), load),
      ack: (e, btn) => ackDialog(find(btn.dataset.id), load),
    });
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
    };
  },
};

const CRITERIA_ROWS = 10;

export const settingsReviewsPage = {
  path: '/settings/reviews',
  title: 'nav.settings_reviews',
  perm: 'settings.manage',
  mount(el) {
    render(el, html`<div aria-busy="true"></div>`);
    read('settings.reviews').then(({ data }) => {
      const values = { self_assessment: data.self_assessment };
      data.criteria.forEach((c, i) => {
        values[`c_${i}`] = c;
      });
      const fields = [];
      for (let i = 0; i < CRITERIA_ROWS; i++) fields.push({ name: `c_${i}`, label: t('reviews.criterion', { n: i + 1 }) });
      fields.push({ name: 'self_assessment', label: t('reviews.self_setting'), type: 'checkbox', help: t('reviews.self_setting_help') });
      render(el, html`<section class="panel"><p class="help">${t('reviews.criteria_help')}</p>${formView({ submit: t('common.save'), values, fields })}</section>`);
      bindForm(el.querySelector('form'), {
        schema: ACTIONS['settings.reviews.save'].schema,
        busyLabel: t('common.saving'),
        mapValues: (v) => ({ self_assessment: v.self_assessment, criteria: Array.from({ length: CRITERIA_ROWS }, (x, i) => ({ name: v[`c_${i}`] })).filter((c) => c.name) }),
        onSubmit: (v) => write('settings.reviews.save', v),
        onSaved: () => toast(t('setup.saved')),
      });
    }).catch((err) => render(el, errorBox(errorText(err))));
  },
};
