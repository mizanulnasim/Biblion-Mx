// Tasks: my tasks (overdue, today, the days ahead, done this week), tasks
// waiting for my check, everyone's tasks for a date, giving a task, and the
// repeating tasks. Doing a task works offline: it is kept on the phone and
// sent when online.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox, staleNotice } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { onArea } from '../core/live.js';
import { dateShort, dateShortTime, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { TASK_LINKS } from '../../../shared/tasks/tasks.js';
import { decideRequest } from './rota.js';

const STATUS = {
  open: null,
  to_check: ['tasks.status.to_check', 'warn'],
  done: ['tasks.status.done', 'ok'],
  not_done: ['tasks.status.not_done', 'danger'],
  skipped: ['tasks.status.skipped', 'muted'],
};
const WEEKDAYS = ['date.wd.sun', 'date.wd.mon', 'date.wd.tue', 'date.wd.wed', 'date.wd.thu', 'date.wd.fri', 'date.wd.sat'];
const shortDate = (date) => dateShort(`${date}T06:00:00Z`);

function whenText(task) {
  const day = task.due_date === today() ? t('tasks.today') : shortDate(task.due_date);
  return task.due_time ? t('tasks.due_at', { day, time: task.due_time }) : day;
}

// One task. mine: the person's own (they can do it); manage: managers'
// buttons to move or cancel it; check: buttons to check it.
export function taskItem(task, { mine = false, manage = false, who = false, check = false } = {}) {
  const link = task.link ? TASK_LINKS[task.link] : null;
  const status = STATUS[task.status];
  return html`<li class="check-item task ${task.overdue ? 'is-overdue' : ''}">
    <span><strong>${who ? `${task.staff_name} · ` : ''}${task.title}</strong>
      ${status ? chip(t(status[0]), status[1]) : ''}
      ${task.overdue ? chip(t('tasks.overdue'), 'danger') : ''}
      <span class="muted">${whenText(task)}${task.moved_from ? ` · ${t('tasks.moved_from', { date: shortDate(task.moved_from) })}` : ''}</span></span>
    ${task.details ? html`<span>${task.details}</span>` : ''}
    ${task.note ? html`<span class="muted">${t('hr.note', { note: task.note })}</span>` : ''}
    ${task.check_note ? html`<span class="muted">${t('tasks.check_note', { note: task.check_note })}</span>` : ''}
    ${task.skip_reason ? html`<span class="muted">${t('tasks.skip_note', { note: task.skip_reason === 'leave' ? t('tasks.skip_leave') : task.skip_reason })}</span>` : ''}
    ${task.comments.length ? html`<details class="comments"><summary>${t('tasks.comments', { count: task.comments.length })}</summary>
      <ul>${task.comments.map((c) => html`<li><strong>${c.name}</strong> <span class="muted">${dateShortTime(c.at)}</span><br>${c.text}</li>`)}</ul></details>` : ''}
    <span class="check-actions">
      ${link && task.status === 'open' && can(link.perm) && mine ? html`<a class="btn btn-small" href="#${link.path}">${t(link.label)}</a>` : ''}
      ${mine && task.status === 'open' ? html`
        <button type="button" class="btn btn-small btn-primary" data-act="done" data-id="${task.id}">${t(task.needs_check ? 'tasks.done_check' : 'tasks.done')}</button>
        <button type="button" class="btn btn-small" data-act="not-done" data-id="${task.id}">${t('tasks.not_done')}</button>` : ''}
      ${mine || can('tasks.view_all') ? html`<button type="button" class="btn btn-small" data-act="comment" data-id="${task.id}">${t('tasks.comment')}</button>` : ''}
      ${manage && task.status === 'open' ? html`
        <button type="button" class="btn btn-small" data-act="move" data-id="${task.id}">${t('tasks.move')}</button>
        <button type="button" class="btn btn-small" data-act="cancel" data-id="${task.id}">${t('tasks.cancel')}</button>` : ''}
      ${check ? html`
        <button type="button" class="btn btn-small btn-primary" data-act="verify" data-id="${task.id}" data-decision="accept">${t('hr.accept')}</button>
        <button type="button" class="btn btn-small" data-act="verify" data-id="${task.id}" data-decision="reject">${t('tasks.send_back')}</button>` : ''}
    </span>
  </li>`;
}

function textDialog({ title, label, action, payload, field, onDone, done }) {
  const dialog = formDialog(title, formView({ submit: title, fields: [{ name: field, label, type: 'textarea', required: true }] }));
  bindForm(dialog.querySelector('form.form'), {
    schema: { [field]: ACTIONS[action].schema[field] },
    busyLabel: t('common.saving'),
    onSubmit: (v) => write(action, { ...payload, [field]: v[field] }, { label: title }),
    onSaved: (reply) => {
      dialog.close();
      toast(reply.status === 'queued' ? t('tasks.queued') : done);
      onDone();
    },
  });
}

// The buttons on a task, shared with Home.
export function taskActions(findTask, onDone) {
  return {
    done: async (e, btn) => {
      const task = findTask(btn.dataset.id);
      btn.disabled = true;
      const reply = await write('tasks.complete', { id: task.id }, { label: task.title });
      if (reply.status === 'queued') toast(t('tasks.queued'));
      else if (reply.status === 'saved') toast(t(task.needs_check ? 'tasks.sent_for_check' : 'tasks.marked_done'));
      onDone();
    },
    'not-done': (e, btn) => textDialog({
      title: t('tasks.not_done'), label: t('tasks.why_not'), action: 'tasks.not_done', payload: { id: btn.dataset.id }, field: 'reason',
      onDone, done: t('tasks.marked_not_done'),
    }),
    comment: (e, btn) => textDialog({
      title: t('tasks.comment'), label: t('tasks.comment_text'), action: 'tasks.comment', payload: { id: btn.dataset.id }, field: 'text',
      onDone, done: t('tasks.commented'),
    }),
  };
}

const linkOptions = () => [{ value: '', label: t('tasks.link.none') }, ...Object.keys(TASK_LINKS).map((k) => ({ value: k, label: t(TASK_LINKS[k].label) }))];

function giveTask(staff, onDone) {
  const dialog = formDialog(t('tasks.give'), formView({
    submit: t('tasks.give'),
    values: { due_date: today() },
    fields: [
      { name: 'title', label: t('tasks.title'), required: true },
      { name: 'details', label: t('tasks.details'), type: 'textarea' },
      { name: 'staff_id', label: t('tasks.who'), type: 'select', required: true, placeholder: t('money.choose'), options: staff.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'due_date', label: t('tasks.due_date'), type: 'date', required: true },
      { name: 'due_time', label: t('tasks.due_time'), type: 'time' },
      { name: 'link', label: t('tasks.link'), type: 'select', options: linkOptions(), help: t('tasks.link_help') },
      { name: 'needs_check', label: t('tasks.needs_check'), type: 'checkbox', help: t('tasks.needs_check_help') },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['tasks.create'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, due_time: v.due_time || null, link: v.link || null }),
    onSubmit: (v) => write('tasks.create', v),
    onSaved: () => {
      dialog.close();
      toast(t('tasks.given'));
      onDone();
    },
  });
}

function moveTask(task, staff, onDone) {
  const dialog = formDialog(t('tasks.move'), formView({
    submit: t('common.save'),
    values: { staff_id: task.staff_id, due_date: task.due_date },
    fields: [
      { name: 'staff_id', label: t('tasks.who'), type: 'select', required: true, options: staff.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'due_date', label: t('tasks.due_date'), type: 'date', required: true },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['tasks.reassign'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id: task.id }),
    onSubmit: (v) => write('tasks.reassign', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

function section(title, items, opts, empty) {
  return html`<section class="panel"><h2 class="section-title">${title}</h2>
    ${items.length ? html`<ul class="waiting-list">${items.map((x) => taskItem(x, opts))}</ul>` : emptyState(empty)}</section>`;
}

export const tasksPage = {
  path: '/tasks',
  title: 'nav.tasks',
  perm: 'tasks.view_all|self.staff',
  mount(el, { query }) {
    let date = query.date || today();
    let mine = null;
    let all = null;
    async function load() {
      try {
        const [m, a] = await Promise.all([
          can('self.staff') ? read('tasks.mine') : null,
          can('tasks.view_all') ? read('tasks.list', { date }).then((r) => r.data) : null,
        ]);
        mine = m;
        all = a;
        const own = mine ? mine.data.items : [];
        render(el, html`${mine ? staleNotice(mine.cachedAt) : ''}
          ${all && all.to_check.length ? html`<section class="panel waiting"><h2 class="section-title">${t('tasks.to_check', { count: all.to_check.length })}</h2>
            <ul class="waiting-list">${all.to_check.map((x) => taskItem(x, { who: true, check: true }))}</ul></section>` : ''}
          ${mine ? section(t('tasks.mine'), own.filter((x) => x.status === 'open'), { mine: true }, t('tasks.none_open')) : ''}
          ${all ? html`<div class="list-bar">
              <label class="field-inline">${t('money.field.date')} <input type="date" data-role="date" value="${date}"></label>
              ${can('tasks.create') ? html`<button type="button" class="btn btn-primary" data-act="give">${t('tasks.give')}</button>` : ''}
              ${can('tasks.manage') ? html`<a class="btn" href="#/tasks/repeating">${t('nav.tasks_repeating')}</a>` : ''}
            </div>
            ${section(t('tasks.everyone', { date: shortDate(date) }), all.items, { who: true, manage: can('tasks.manage') }, t('tasks.none_day'))}` : ''}
          ${mine ? section(t('tasks.recent'), own.filter((x) => x.status !== 'open'), {}, t('tasks.none_recent')) : ''}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const find = (id) => [...(mine ? mine.data.items : []), ...(all ? [...all.items, ...all.to_check] : [])].find((x) => x.id === id);
    const offClick = on(el, 'click', {
      ...taskActions(find, load),
      verify: (e, btn) => decideRequest('tasks.verify', btn, load),
      give: () => giveTask(all.staff, load),
      move: (e, btn) => moveTask(find(btn.dataset.id), all.staff, load),
      cancel: (e, btn) => textDialog({
        title: t('tasks.cancel'), label: t('hr.fix_reason'), action: 'tasks.cancel', payload: { id: btn.dataset.id }, field: 'reason',
        onDone: load, done: t('tasks.cancelled'),
      }),
    });
    const onDate = (e) => {
      if (e.target.dataset.role !== 'date' || !e.target.value) return;
      date = e.target.value;
      load();
    };
    el.addEventListener('change', onDate);
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
      el.removeEventListener('change', onDate);
    };
  },
};

function repeatText(tpl) {
  if (tpl.repeat === 'daily') return t('tasks.repeat.daily');
  if (tpl.repeat === 'weekly') return t('tasks.repeat.weekly_on', { days: tpl.days.map((d) => t(WEEKDAYS[d])).join(', ') });
  return t('tasks.repeat.monthly_on', { day: tpl.day_of_month });
}

const TEMPLATE_STATUS = { active: ['users.active', 'ok'], paused: ['tasks.paused', 'warn'], ended: ['tasks.ended', 'muted'] };

function editTemplate(tpl, staff, onDone) {
  const values = tpl ? { ...tpl, day_of_month: tpl.day_of_month ? String(tpl.day_of_month) : '' } : { repeat: 'daily', start_date: today(), status: 'active' };
  if (tpl) for (const d of tpl.days) values[`day_${d}`] = true;
  const dialog = formDialog(tpl ? tpl.title : t('tasks.add_repeating'), formView({
    submit: t('common.save'),
    values,
    fields: [
      { name: 'title', label: t('tasks.title'), required: true },
      { name: 'details', label: t('tasks.details'), type: 'textarea' },
      { name: 'staff_id', label: t('tasks.who'), type: 'select', required: true, placeholder: t('money.choose'), options: staff.map((s) => ({ value: s.id, label: s.name })) },
      { name: 'repeat', label: t('tasks.repeat'), type: 'select', required: true, options: [{ value: 'daily', label: t('tasks.repeat.daily') }, { value: 'weekly', label: t('tasks.repeat.weekly') }, { value: 'monthly', label: t('tasks.repeat.monthly') }] },
      ...WEEKDAYS.map((wd, day) => ({ name: `day_${day}`, label: t(wd), type: 'checkbox' })),
      { name: 'day_of_month', label: t('tasks.day_of_month'), inputmode: 'numeric', help: t('tasks.day_of_month_help') },
      { name: 'due_time', label: t('tasks.due_time'), type: 'time' },
      { name: 'link', label: t('tasks.link'), type: 'select', options: linkOptions(), help: t('tasks.link_help') },
      { name: 'needs_check', label: t('tasks.needs_check'), type: 'checkbox', help: t('tasks.needs_check_help') },
      { name: 'start_date', label: t('tasks.start_date'), type: 'date', required: true },
      { name: 'end_date', label: t('tasks.end_date'), type: 'date' },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: Object.keys(TEMPLATE_STATUS).map((k) => ({ value: k, label: t(TEMPLATE_STATUS[k][0]) })), help: t('tasks.status_help') },
    ],
  }));
  const form = dialog.querySelector('form.form');
  // Only the fields of the chosen repeat are shown.
  const showRepeat = () => {
    const repeat = form.elements.repeat.value;
    for (let d = 0; d < 7; d++) form.elements[`day_${d}`].closest('.field').hidden = repeat !== 'weekly';
    form.elements.day_of_month.closest('.field').hidden = repeat !== 'monthly';
  };
  form.elements.repeat.addEventListener('change', showRepeat);
  showRepeat();
  bindForm(form, {
    schema: ACTIONS['tasks.template.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({
      id: tpl ? tpl.id : null, version: tpl ? tpl.version : null, title: v.title, details: v.details, staff_id: v.staff_id, repeat: v.repeat,
      days: WEEKDAYS.map((wd, day) => day).filter((day) => v[`day_${day}`]).map((day) => ({ day })),
      day_of_month: v.day_of_month || null, due_time: v.due_time || null, link: v.link || null, needs_check: v.needs_check,
      start_date: v.start_date, end_date: v.end_date || null, status: v.status,
    }),
    onSubmit: (v) => write('tasks.template.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

export const repeatingTasksPage = {
  path: '/tasks/repeating',
  title: 'nav.tasks_repeating',
  perm: 'tasks.manage',
  mount(el) {
    let data = null;
    async function load() {
      try {
        data = (await read('tasks.templates')).data;
        render(el, html`<div class="list-bar"><button type="button" class="btn btn-primary" data-act="add">${t('tasks.add_repeating')}</button></div>
          <section class="panel">${data.items.length ? html`<ul class="punches">${data.items.map((x) => html`<li class="punch">
            <span><strong>${x.title}</strong> <span class="muted">${x.staff_name} · ${repeatText(x)}${x.due_time ? ` · ${x.due_time}` : ''}</span></span>
            ${chip(t(TEMPLATE_STATUS[x.status][0]), TEMPLATE_STATUS[x.status][1])}
            <button type="button" class="btn btn-small" data-act="edit" data-id="${x.id}">${t('common.edit')}</button></li>`)}</ul>` : emptyState(t('tasks.no_repeating'))}</section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      add: () => editTemplate(null, data.staff, load),
      edit: (e, btn) => editTemplate(data.items.find((x) => x.id === btn.dataset.id), data.staff, load),
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return offClick;
  },
};
