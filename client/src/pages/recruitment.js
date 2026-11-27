// Recruitment: applicants by stage (adding one, moving them on, hiring),
// the onboarding checklists of new people, and Settings → Onboarding.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox } from '../ui/feedback.js';
import { mountList } from '../ui/list.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { onArea } from '../core/live.js';
import { dateShortTime, money } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

const STAGE = {
  new: ['jobs.stage.new', 'muted'], interview: ['jobs.stage.interview', 'warn'], offered: ['jobs.stage.offered', 'warn'],
  hired: ['jobs.stage.hired', 'ok'], rejected: ['jobs.stage.rejected', 'danger'], withdrawn: ['jobs.stage.withdrawn', 'muted'],
};
const MOVE = { interview: 'jobs.move.interview', offered: 'jobs.move.offered', hired: 'jobs.move.hired', rejected: 'jobs.move.rejected', withdrawn: 'jobs.move.withdrawn' };
const stageChip = (s) => chip(t(STAGE[s][0]), STAGE[s][1]);

function editApplicant(a, onDone) {
  const dialog = formDialog(a ? a.name : t('jobs.add'), formView({
    submit: a ? t('common.save') : t('jobs.add'),
    values: a || {},
    fields: [
      { name: 'name', label: t('users.name'), required: true },
      { name: 'phone', label: t('setup.phone'), inputmode: 'tel' },
      { name: 'position', label: t('jobs.position'), required: true },
      { name: 'source', label: t('jobs.source'), help: t('jobs.source_help') },
      { name: 'notes', label: t('jobs.notes'), type: 'textarea' },
    ],
    extra: a ? html`<h3 class="section-title">${t('jobs.history')}</h3><ul class="punches">${a.history.map((h) => html`<li class="punch">
      ${stageChip(h.stage)} <span class="muted">${dateShortTime(h.at)} · ${h.by}</span>${h.note ? html` <span>“${h.note}”</span>` : ''}</li>`)}</ul>
      ${a.next.length ? html`<div class="form-actions">${a.next.map((n) => html`<button type="button" class="btn" data-move="${n}">${t(MOVE[n])}</button>`)}</div>` : ''}` : '',
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['applicants.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id: a ? a.id : null, version: a ? a.version : null }),
    onSubmit: (v) => write('applicants.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
  dialog.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-move]');
    if (!btn) return;
    dialog.close();
    moveDialog(a, btn.dataset.move, onDone);
  });
}

// What each move asks for: an interview time; an offer's salary and start
// date; a note when turning someone down or they withdraw.
function moveDialog(a, stage, onDone) {
  const fields = [];
  if (stage === 'interview') fields.push({ name: 'interview_at', label: t('jobs.interview_at'), type: 'datetime-local', required: true });
  if (stage === 'offered') {
    fields.push(
      { name: 'offer_salary', label: t('hr.salary'), inputmode: 'decimal', required: true },
      { name: 'start_date', label: t('jobs.start_date'), type: 'date', required: true },
    );
  }
  const needsNote = stage === 'rejected' || stage === 'withdrawn';
  fields.push({ name: 'note', label: t(needsNote ? 'hr.fix_reason' : 'jobs.note'), type: 'textarea', required: needsNote });
  const dialog = formDialog(`${a.name} · ${t(MOVE[stage])}`, formView({
    submit: t(MOVE[stage]),
    values: { offer_salary: a.offer_salary ? String(a.offer_salary) : '', start_date: a.start_date },
    fields,
    extra: stage === 'hired' ? html`<p class="help">${t('jobs.hire_help', { salary: money(a.offer_salary || 0) })}</p>` : '',
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['applicants.stage'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({
      id: a.id, stage, note: v.note || null, interview_at: v.interview_at ? v.interview_at.replace('T', ' ') : null,
      offer_salary: v.offer_salary || null, start_date: v.start_date || null,
    }),
    onSubmit: (v) => write('applicants.stage', v),
    onSaved: () => {
      dialog.close();
      toast(t(stage === 'hired' ? 'jobs.hired' : 'setup.saved'));
      onDone();
    },
  });
}

function onboardingView(items) {
  if (!items.length) return '';
  return html`<section class="panel"><h2 class="section-title">${t('jobs.onboarding')}</h2>
    <ul class="waiting-list">${items.map((o) => html`<li class="check-item">
      <span><a href="#/staff"><strong>${o.staff.name}</strong></a> <span class="muted">${o.staff.position}</span></span>
      <span class="muted">${t(o.facts.sign_in ? 'jobs.fact.sign_in_yes' : 'jobs.fact.sign_in_no')} · ${t(o.facts.pin ? 'jobs.fact.pin_yes' : 'jobs.fact.pin_no')}</span>
      ${o.steps.map((s, i) => html`<label class="field-check"><input type="checkbox" data-ob="${o.id}" data-step="${i}" ${s.done_at ? 'checked' : ''}>
        ${s.label}${s.done_at ? html` <span class="muted">${t('jobs.done_by', { name: s.done_by, time: dateShortTime(s.done_at) })}</span>` : ''}</label>`)}
    </li>`)}</ul></section>`;
}

export const recruitmentPage = {
  path: '/recruitment',
  title: 'nav.recruitment',
  perm: 'recruitment.manage',
  mount(el) {
    render(el, html`<div class="onboarding-slot"></div><section class="panel"><h2 class="section-title">${t('jobs.applicants')}</h2><div class="applicants"></div></section>`);
    const slot = el.querySelector('.onboarding-slot');
    async function loadOnboarding() {
      try {
        render(slot, onboardingView((await read('onboarding.list')).data.items));
      } catch (err) {
        render(slot, errorBox(errorText(err)));
      }
    }
    const list = mountList(el.querySelector('.applicants'), {
      key: 'applicants',
      action: 'applicants.list',
      area: 'hr',
      searchLabel: t('jobs.search'),
      empty: t('jobs.none'),
      emptySearch: t('list.no_match'),
      filters: [{ name: 'stage', label: t('jobs.all_stages'), options: [
        { value: 'open', label: t('jobs.open') }, { value: 'hired', label: t('jobs.stage.hired') },
        { value: 'rejected', label: t('jobs.stage.rejected') }, { value: 'withdrawn', label: t('jobs.stage.withdrawn') }] }],
      initial: { stage: 'open' },
      tools: html`<button type="button" class="btn btn-primary" data-act="tool" data-tool="add">${t('jobs.add')}</button>`,
      columns: [
        { label: t('users.name'), cell: (a) => html`<strong>${a.name}</strong>` },
        { label: t('jobs.position'), cell: (a) => a.position },
        { label: t('setup.phone'), cell: (a) => a.phone, kind: 'nowrap' },
        { label: t('jobs.stage'), cell: (a) => stageChip(a.stage), kind: 'nowrap' },
        { label: t('jobs.source'), cell: (a) => a.source },
      ],
      onRow: (a) => editApplicant(a, () => {
        list.reload();
        loadOnboarding();
      }),
      onTool: () => editApplicant(null, () => list.reload()),
    });
    const onTick = async (e) => {
      const box = e.target;
      if (!box.dataset.ob) return;
      box.disabled = true;
      const reply = await write('onboarding.tick', { id: box.dataset.ob, step: Number(box.dataset.step), done: box.checked });
      if (reply.status === 'saved' && reply.data.finished) toast(t('jobs.onboarding_done'));
      loadOnboarding();
    };
    el.addEventListener('change', onTick);
    const offArea = onArea('hr', loadOnboarding);
    loadOnboarding();
    return () => {
      list.destroy();
      offArea();
      el.removeEventListener('change', onTick);
    };
  },
};

const STEP_ROWS = 15;

export const settingsOnboardingPage = {
  path: '/settings/onboarding',
  title: 'nav.settings_onboarding',
  perm: 'settings.manage',
  mount(el) {
    render(el, html`<div aria-busy="true"></div>`);
    read('settings.onboarding').then(({ data }) => {
      const values = {};
      data.steps.forEach((s, i) => {
        values[`s_${i}`] = s;
      });
      const fields = Array.from({ length: STEP_ROWS }, (x, i) => ({ name: `s_${i}`, label: t('jobs.step', { n: i + 1 }) }));
      render(el, html`<section class="panel"><p class="help">${t('jobs.steps_help')}</p>${formView({ submit: t('common.save'), values, fields })}</section>`);
      bindForm(el.querySelector('form'), {
        schema: ACTIONS['settings.onboarding.save'].schema,
        busyLabel: t('common.saving'),
        mapValues: (v) => ({ steps: Array.from({ length: STEP_ROWS }, (x, i) => ({ label: v[`s_${i}`] })).filter((s) => s.label) }),
        onSubmit: (v) => write('settings.onboarding.save', v),
        onSaved: () => toast(t('setup.saved')),
      });
    }).catch((err) => render(el, errorBox(errorText(err))));
  },
};
