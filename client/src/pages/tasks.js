// Tasks: my tasks (overdue, today, the days ahead, done this week), tasks
// waiting for my check, everyone's tasks for a date, giving a task (to a
// person or a role), and the repeating tasks. Doing a task works offline:
// it is kept on the phone and sent when online.

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox, staleNotice } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { onArea } from '../core/live.js';
import { dateShort, dateShortTime, money, today } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { errorMessageId } from '../../../shared/contract/errors.js';
import { TASK_LINKS, TASK_ROLES } from '../../../shared/tasks/tasks.js';
import { shrinkPhoto, toBase64 } from '../ui/files.js';
import { decideRequest } from './rota.js';

const STATUS = {
  open: null,
  to_check: ['tasks.status.to_check', 'warn'],
  done: ['tasks.status.done', 'ok'],
  not_done: ['tasks.status.not_done', 'danger'],
  skipped: ['tasks.status.skipped', 'muted'],
};
// "Anyone who is a …", for a task given to a role.
const ROLE_ANYONE = { owner: 'tasks.anyone_owner', manager: 'tasks.anyone_manager', staff: 'tasks.anyone_staff' };
const WEEKDAYS = ['date.wd.sun', 'date.wd.mon', 'date.wd.tue', 'date.wd.wed', 'date.wd.thu', 'date.wd.fri', 'date.wd.sat'];
const shortDate = (date) => dateShort(`${date}T06:00:00Z`);

function whenText(task) {
  const day = task.due_date === today() ? t('tasks.today') : shortDate(task.due_date);
  return task.due_time ? t('tasks.due_at', { day, time: task.due_time }) : day;
}

const whoText = (task) => {
  if (task.staff_name) return task.staff_name;
  if (task.role) return t(ROLE_ANYONE[task.role]);
  return t('tasks.anyone_in', { group: task.position || task.team });
};
const PRIORITY = { low: ['tasks.priority.low', 'muted'], normal: null, high: ['tasks.priority.high', 'warn'], urgent: ['tasks.priority.urgent', 'danger'] };

// One task. mine: the person's own (they can do it); manage: managers'
// buttons to move, cancel or allow it without its record; check: buttons to
// check it.
export function taskItem(task, { mine = false, manage = false, who = false, check = false } = {}) {
  const link = task.link ? TASK_LINKS[task.link] : null;
  const status = STATUS[task.status];
  const open = task.status === 'open';
  return html`<li class="check-item task ${task.overdue ? 'is-overdue' : ''}">
    <span><strong>${who || (mine && !task.staff_id) ? `${whoText(task)} · ` : ''}${task.title}</strong>
      ${status ? chip(t(status[0]), status[1]) : ''}
      ${PRIORITY[task.priority] ? chip(t(PRIORITY[task.priority][0]), PRIORITY[task.priority][1]) : ''}
      ${task.overdue ? chip(t('tasks.overdue'), 'danger') : ''}
      ${task.move_flag === 'no_day' && open ? chip(t('tasks.no_earlier_day'), 'warn') : ''}
      <span class="muted">${whenText(task)}${task.moved_from ? ` · ${t('tasks.moved_from', { date: shortDate(task.moved_from) })}` : ''}</span></span>
    ${task.details ? html`<span>${task.details}</span>` : ''}
    ${task.note ? html`<span class="muted">${t('hr.note', { note: task.note })}</span>` : ''}
    ${task.check_note ? html`<span class="muted">${t('tasks.check_note', { note: task.check_note })}</span>` : ''}
    ${link && open && !task.override_reason ? html`<span class="muted">${t('tasks.needs_record', { what: t(link.label) })}</span>` : ''}
    ${task.override_reason ? html`<span class="muted">${t('tasks.allowed_note', { note: task.override_reason })}</span>` : ''}
    ${task.skip_reason ? html`<span class="muted">${t('tasks.skip_note', { note: task.skip_reason === 'leave' ? t('tasks.skip_leave') : task.skip_reason })}</span>` : ''}
    ${task.comments.length ? html`<details class="comments"><summary>${t('tasks.comments', { count: task.comments.length })}</summary>
      <ul>${task.comments.map((c) => html`<li><strong>${c.name}</strong> <span class="muted">${dateShortTime(c.at)}</span><br>${c.text}</li>`)}</ul></details>` : ''}
    <span class="check-actions">
      ${link && task.status === 'open' && can(link.perm) && mine ? html`<a class="btn btn-small" href="#${link.path}${link.path.includes('?') ? '&' : '?'}task=${task.id}">${t(link.label)}</a>` : ''}
      ${mine && task.status === 'open' ? html`
        <button type="button" class="btn btn-small btn-primary" data-act="done" data-id="${task.id}">${t('tasks.done')}</button>
        <button type="button" class="btn btn-small" data-act="not-done" data-id="${task.id}">${t('tasks.not_done')}</button>` : ''}
      ${mine || can('tasks.view_all') ? html`<button type="button" class="btn btn-small" data-act="comment" data-id="${task.id}">${t('tasks.comment')}</button>` : ''}
      ${manage && open && link && !task.override_reason ? html`<button type="button" class="btn btn-small" data-act="allow" data-id="${task.id}">${t('tasks.allow')}</button>` : ''}
      ${manage && open ? html`
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

function doneToast(reply) {
  if (reply.status === 'queued') toast(t('tasks.queued'));
  else if (reply.status === 'saved') toast(t(reply.data.status === 'to_check' ? 'tasks.sent_for_check' : 'tasks.marked_done'));
  else if (reply.status === 'rejected') toast(t(errorMessageId(reply.error.code), reply.error.params), 'error');
}

// A photo field: the photo is made smaller and sent as soon as it is chosen.
function photoField(slot, label, has, required) {
  return html`<div class="field"><label for="ph-${slot}">${label}${required ? '' : html` <span class="muted">${t('form.optional')}</span>`}</label>
    <input id="ph-${slot}" type="file" accept="image/*" capture="environment" data-slot="${slot}" aria-describedby="ph-${slot}-state">
    <p class="help" id="ph-${slot}-state">${has ? t('tasks.photo_added') : ''}</p>
    <p class="field-error" id="f-${['before', 'after', 'receipt'].includes(slot) ? slot : `answers.${slot}`}-err"></p></div>`;
}

// Doing a task with a checklist, evidence or a linked record: the record it
// was done with (if not already tied), the receipt, the answers, the
// photos (sent when chosen), and the note.
async function doTask(task, onDone) {
  const has = (slot) => task.files.some((f) => f.slot === slot);
  let records = { items: [], receipt: false };
  if (task.link) {
    try {
      records = (await read('tasks.records', { id: task.id })).data;
    } catch (err) {
      toast(errorText(err), 'error');
      return;
    }
  }
  const recordLabel = (r) => [dateShort(`${r.date}T06:00:00Z`), r.amount === null ? '' : money(r.amount), r.note].filter(Boolean).join(' · ');
  const fields = [];
  if (task.link && !task.record_id && !task.override_reason) {
    fields.push({
      name: 'record_id', label: t('tasks.record'), type: 'select', required: true, placeholder: t('money.choose'),
      options: records.items.map((r) => ({ value: r.id, label: recordLabel(r) })), help: records.items.length ? t('tasks.record_help') : t('tasks.record_none'),
    });
  }
  fields.push(...task.checklist.filter((c) => c.type !== 'photo').map((c) => ({
    name: `answers.${c.id}`, label: c.unit ? `${c.label} (${c.unit})` : c.label, required: c.required,
    ...(c.type === 'check' ? { type: 'checkbox' } : c.type === 'number' ? { inputmode: 'decimal' } : {}),
  })));
  fields.push({ name: 'note', label: t('tasks.note'), type: 'textarea', required: Boolean(task.evidence.note) });
  const photos = html`${records.receipt ? photoField('receipt', t('tasks.receipt'), has('receipt'), true) : ''}
    ${task.checklist.filter((c) => c.type === 'photo').map((c) => photoField(c.id, c.label, has(c.id), c.required))}
    ${task.evidence.before ? photoField('before', t('tasks.photo_before'), has('before'), true) : ''}
    ${task.evidence.after ? photoField('after', t('tasks.photo_after'), has('after'), true) : ''}`;
  const values = {};
  for (const c of task.checklist) values[`answers.${c.id}`] = c.type === 'check' ? task.answers[c.id] === 'yes' : task.answers[c.id] || '';
  const dialog = formDialog(task.title, formView({ submit: t('tasks.done'), values, fields, extra: photos }));
  const form = dialog.querySelector('form.form');
  form.addEventListener('change', async (e) => {
    const input = e.target;
    if (!input.dataset.slot || !input.files[0]) return;
    const state = form.querySelector(`#ph-${input.dataset.slot}-state`);
    state.textContent = t('tasks.photo_sending');
    try {
      const photo = await shrinkPhoto(input.files[0]);
      const reply = await write('tasks.attach', { id: task.id, slot: input.dataset.slot, name: 'photo.jpg', mime: 'image/jpeg', data: toBase64(photo.bytes) }, { label: task.title });
      state.textContent = reply.status === 'saved' ? t('tasks.photo_added') : t(errorMessageId(reply.error ? reply.error.code : 'NETWORK'));
    } catch (err) {
      state.textContent = errorText(err);
    }
  });
  bindForm(form, {
    schema: { note: ACTIONS['tasks.complete'].schema.note },
    busyLabel: t('common.saving'),
    mapValues: (v) => ({
      id: task.id, note: v.note, record_id: v.record_id || null,
      answers: task.checklist.filter((c) => c.type !== 'photo').map((c) => ({ item: c.id, value: c.type === 'check' ? (v[`answers.${c.id}`] ? 'yes' : '') : v[`answers.${c.id}`] })),
    }),
    onSubmit: (v) => write('tasks.complete', v, { label: task.title }),
    onSaved: (reply) => {
      dialog.close();
      doneToast(reply);
      onDone();
    },
  });
}

// The buttons on a task, shared with Home.
export function taskActions(findTask, onDone) {
  return {
    done: async (e, btn) => {
      const task = findTask(btn.dataset.id);
      const ev = task.evidence || {};
      if (task.link || task.checklist.length || ev.before || ev.after || ev.note) {
        doTask(task, onDone);
        return;
      }
      btn.disabled = true;
      const reply = await write('tasks.complete', { id: task.id }, { label: task.title });
      doneToast(reply);
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

// "Given to": a person, or anyone of a role. Sent as staff_id or role.
// lists: {staff, positions, teams} from the server.
const whoOptions = (lists) => [
  ...lists.staff.map((s) => ({ value: `staff:${s.id}`, label: s.name })),
  ...TASK_ROLES.map((r) => ({ value: `role:${r}`, label: t(ROLE_ANYONE[r]) })),
  ...lists.positions.map((p) => ({ value: `position:${p}`, label: t('tasks.anyone_in', { group: p }) })),
  ...lists.teams.filter((x) => x.status === 'active').map((x) => ({ value: `team:${x.id}`, label: t('tasks.anyone_in', { group: x.name }) })),
];
const whoValue = (x) => {
  if (x.staff_id) return `staff:${x.staff_id}`;
  if (x.role) return `role:${x.role}`;
  return x.position ? `position:${x.position}` : `team:${x.team_id}`;
};
const PRIORITY_LABEL = { low: 'tasks.priority.low', normal: 'tasks.priority.normal', high: 'tasks.priority.high', urgent: 'tasks.priority.urgent' };
const priorityField = () => ({ name: 'priority', label: t('tasks.priority'), type: 'select', options: Object.keys(PRIORITY_LABEL).map((p) => ({ value: p, label: t(PRIORITY_LABEL[p]) })) });
const WHO = { who: { type: 'text', required: true } };
function fromWho(who) {
  const at = who.indexOf(':');
  const kind = who.slice(0, at);
  const value = who.slice(at + 1);
  const pick = (k) => (kind === k ? value : null);
  return { staff_id: pick('staff'), role: pick('role'), position: pick('position'), team_id: pick('team') };
}

// The checklist and evidence fields of the give and repeating-task forms.
const CHECK_ROWS = 5;
const CHECK_TYPES = { check: 'tasks.check.check', number: 'tasks.check.number', text: 'tasks.check.text', photo: 'tasks.check.photo' };
function doingFields() {
  const rows = [];
  for (let i = 0; i < CHECK_ROWS; i++) {
    rows.push(
      { name: `c_label_${i}`, label: t('tasks.check_item', { n: i + 1 }), help: i ? '' : t('tasks.checklist_help') },
      { name: `c_type_${i}`, label: t('tasks.check_type'), type: 'select', options: Object.keys(CHECK_TYPES).map((k) => ({ value: k, label: t(CHECK_TYPES[k]) })) },
      { name: `c_req_${i}`, label: t('tasks.check_required'), type: 'checkbox' },
    );
  }
  return [
    ...rows,
    { name: 'evidence_before', label: t('tasks.evidence_before'), type: 'checkbox' },
    { name: 'evidence_after', label: t('tasks.evidence_after'), type: 'checkbox' },
    { name: 'evidence_note', label: t('tasks.evidence_note'), type: 'checkbox' },
  ];
}
function doingValues(x) {
  const values = { evidence_before: Boolean(x && x.evidence.before), evidence_after: Boolean(x && x.evidence.after), evidence_note: Boolean(x && x.evidence.note) };
  for (let i = 0; i < CHECK_ROWS; i++) values[`c_type_${i}`] = 'check';
  (x ? x.checklist : []).forEach((c, i) => {
    values[`c_label_${i}`] = c.label;
    values[`c_type_${i}`] = c.type;
    values[`c_req_${i}`] = c.required;
  });
  return values;
}
function doingPayload(v) {
  const checklist = [];
  for (let i = 0; i < CHECK_ROWS; i++) if (v[`c_label_${i}`]) checklist.push({ label: v[`c_label_${i}`], type: v[`c_type_${i}`], required: v[`c_req_${i}`] });
  return { checklist, evidence_before: v.evidence_before, evidence_after: v.evidence_after, evidence_note: v.evidence_note };
}

const linkOptions = () => [{ value: '', label: t('tasks.link.none') }, ...Object.keys(TASK_LINKS).map((k) => ({ value: k, label: t(TASK_LINKS[k].label) }))];

function giveTask(lists, onDone) {
  const dialog = formDialog(t('tasks.give'), formView({
    submit: t('tasks.give'),
    values: { due_date: today(), priority: 'normal', ...doingValues(null) },
    fields: [
      { name: 'title', label: t('tasks.title'), required: true },
      { name: 'details', label: t('tasks.details'), type: 'textarea' },
      { name: 'who', label: t('tasks.who'), type: 'select', required: true, placeholder: t('money.choose'), options: whoOptions(lists) },
      { name: 'each', label: t('tasks.each'), type: 'checkbox', help: t('tasks.each_help') },
      priorityField(),
      { name: 'due_date', label: t('tasks.due_date'), type: 'date', required: true },
      { name: 'due_time', label: t('tasks.due_time'), type: 'time' },
      { name: 'link', label: t('tasks.link'), type: 'select', options: linkOptions(), help: t('tasks.link_help') },
      ...doingFields(),
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: { ...ACTIONS['tasks.create'].schema, ...WHO },
    busyLabel: t('common.saving'),
    mapValues: (v) => ({
      title: v.title, details: v.details, who: v.who, ...fromWho(v.who), each: v.each, priority: v.priority, due_date: v.due_date,
      due_time: v.due_time || null, link: v.link || null, ...doingPayload(v),
    }),
    onSubmit: ({ who, ...v }) => write('tasks.create', v),
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
      give: () => giveTask(all, load),
      allow: (e, btn) => textDialog({
        title: t('tasks.allow'), label: t('tasks.allow_reason'), action: 'tasks.allow', payload: { id: btn.dataset.id }, field: 'reason',
        onDone: load, done: t('tasks.allowed'),
      }),
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
  const days = tpl.days.map((d) => t(WEEKDAYS[d])).join(', ');
  switch (tpl.repeat) {
    case 'daily': return t('tasks.repeat.daily');
    case 'every_n_days': return t('tasks.repeat.every_n_days_on', { n: tpl.every });
    case 'weekly': return t('tasks.repeat.weekly_on', { days });
    case 'fortnightly': return t('tasks.repeat.fortnightly_on', { days });
    case 'monthly': return t('tasks.repeat.monthly_on', { day: tpl.day_of_month });
    case 'every_n_months': return t('tasks.repeat.every_n_months_on', { n: tpl.every, day: tpl.day_of_month });
    case 'monthly_last': return t('tasks.repeat.monthly_last');
    default: return t('tasks.repeat.dates_on', { count: tpl.dates.length });
  }
}
const REPEAT_OPTIONS = ['daily', 'every_n_days', 'weekly', 'fortnightly', 'monthly', 'every_n_months', 'monthly_last', 'dates'];
const REPEAT_LABEL = {
  daily: 'tasks.repeat.daily', every_n_days: 'tasks.repeat.every_n_days', weekly: 'tasks.repeat.weekly', fortnightly: 'tasks.repeat.fortnightly',
  monthly: 'tasks.repeat.monthly', every_n_months: 'tasks.repeat.every_n_months', monthly_last: 'tasks.repeat.monthly_last', dates: 'tasks.repeat.dates',
};

const TEMPLATE_STATUS = { active: ['users.active', 'ok'], paused: ['tasks.paused', 'warn'], ended: ['tasks.ended', 'muted'] };

function editTemplate(tpl, lists, onDone) {
  const values = tpl ? { ...tpl, who: whoValue(tpl), day_of_month: tpl.day_of_month ? String(tpl.day_of_month) : '', every: tpl.every ? String(tpl.every) : '', dates: tpl.dates.join(', ') }
    : { repeat: 'daily', start_date: today(), status: 'active', priority: 'normal' };
  Object.assign(values, doingValues(tpl));
  if (tpl) for (const d of tpl.days) values[`day_${d}`] = true;
  const dialog = formDialog(tpl ? tpl.title : t('tasks.add_repeating'), formView({
    submit: t('common.save'),
    values,
    fields: [
      { name: 'title', label: t('tasks.title'), required: true },
      { name: 'details', label: t('tasks.details'), type: 'textarea' },
      { name: 'who', label: t('tasks.who'), type: 'select', required: true, placeholder: t('money.choose'), options: whoOptions(lists) },
      { name: 'each', label: t('tasks.each'), type: 'checkbox', help: t('tasks.each_help') },
      priorityField(),
      { name: 'repeat', label: t('tasks.repeat'), type: 'select', required: true, options: REPEAT_OPTIONS.map((r) => ({ value: r, label: t(REPEAT_LABEL[r]) })) },
      { name: 'every', label: t('tasks.every'), inputmode: 'numeric' },
      { name: 'dates', label: t('tasks.dates'), help: t('tasks.dates_help') },
      ...WEEKDAYS.map((wd, day) => ({ name: `day_${day}`, label: t(wd), type: 'checkbox' })),
      { name: 'day_of_month', label: t('tasks.day_of_month'), inputmode: 'numeric', help: t('tasks.day_of_month_help') },
      { name: 'due_time', label: t('tasks.due_time'), type: 'time' },
      { name: 'link', label: t('tasks.link'), type: 'select', options: linkOptions(), help: t('tasks.link_help') },
      ...doingFields(),
      { name: 'start_date', label: t('tasks.start_date'), type: 'date', required: true },
      { name: 'end_date', label: t('tasks.end_date'), type: 'date' },
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: Object.keys(TEMPLATE_STATUS).map((k) => ({ value: k, label: t(TEMPLATE_STATUS[k][0]) })), help: t('tasks.status_help') },
    ],
  }));
  const form = dialog.querySelector('form.form');
  // Only the fields of the chosen repeat are shown.
  const showRepeat = () => {
    const repeat = form.elements.repeat.value;
    const show = (name, on) => { form.elements[name].closest('.field').hidden = !on; };
    for (let d = 0; d < 7; d++) show(`day_${d}`, repeat === 'weekly' || repeat === 'fortnightly');
    show('day_of_month', repeat === 'monthly' || repeat === 'every_n_months');
    show('every', repeat === 'every_n_days' || repeat === 'every_n_months');
    show('dates', repeat === 'dates');
  };
  form.elements.repeat.addEventListener('change', showRepeat);
  showRepeat();
  bindForm(form, {
    schema: { ...ACTIONS['tasks.template.save'].schema, ...WHO },
    busyLabel: t('common.saving'),
    mapValues: (v) => ({
      id: tpl ? tpl.id : null, version: tpl ? tpl.version : null, title: v.title, details: v.details, ...fromWho(v.who), who: v.who, each: v.each,
      priority: v.priority, repeat: v.repeat, every: v.every || null,
      days: WEEKDAYS.map((wd, day) => day).filter((day) => v[`day_${day}`]).map((day) => ({ day })),
      dates: (v.dates || '').split(/[,\s]+/).filter(Boolean).map((date) => ({ date })),
      day_of_month: v.day_of_month || null, due_time: v.due_time || null, link: v.link || null, ...doingPayload(v),
      start_date: v.start_date, end_date: v.end_date || null, status: v.status,
    }),
    onSubmit: ({ who, ...v }) => write('tasks.template.save', v),
    onSaved: () => {
      dialog.close();
      toast(t('setup.saved'));
      onDone();
    },
  });
}

// Teams: named groups of people tasks can be given to.
function teamsView(data) {
  const names = new Map(data.staff.map((s) => [s.id, s.name]));
  return html`<section class="panel"><h2 class="section-title">${t('tasks.teams')}</h2>
    ${data.teams.length ? html`<ul class="punches">${data.teams.map((x) => html`<li class="punch">
      <span><strong>${x.name}</strong> <span class="muted">${x.members.map((id) => names.get(id) || '').filter(Boolean).join(', ')}</span></span>
      ${x.status === 'active' ? '' : chip(t('users.inactive'), 'muted')}
      <button type="button" class="btn btn-small" data-act="team" data-id="${x.id}">${t('common.edit')}</button></li>`)}</ul>` : emptyState(t('tasks.no_teams'))}
    <div class="form-actions"><button type="button" class="btn" data-act="team">${t('tasks.add_team')}</button></div></section>`;
}

function editTeam(team, staff, onDone) {
  const values = team ? { name: team.name, status: team.status } : { status: 'active' };
  if (team) for (const id of team.members) values[`m_${id}`] = true;
  const dialog = formDialog(team ? team.name : t('tasks.add_team'), formView({
    submit: t('common.save'),
    values,
    fields: [
      { name: 'name', label: t('users.name'), required: true },
      ...staff.map((s) => ({ name: `m_${s.id}`, label: s.name, type: 'checkbox' })),
      { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }] },
    ],
  }));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['tasks.team.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ id: team ? team.id : null, version: team ? team.version : null, name: v.name, status: v.status, members: staff.filter((s) => v[`m_${s.id}`]).map((s) => ({ id: s.id })) }),
    onSubmit: (v) => write('tasks.team.save', v),
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
            <span><strong>${x.title}</strong> <span class="muted">${whoText(x)} · ${repeatText(x)}${x.due_time ? ` · ${x.due_time}` : ''}</span></span>
            ${chip(t(TEMPLATE_STATUS[x.status][0]), TEMPLATE_STATUS[x.status][1])}
            <button type="button" class="btn btn-small" data-act="edit" data-id="${x.id}">${t('common.edit')}</button></li>`)}</ul>` : emptyState(t('tasks.no_repeating'))}</section>
          ${teamsView(data)}`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      add: () => editTemplate(null, data, load),
      edit: (e, btn) => editTemplate(data.items.find((x) => x.id === btn.dataset.id), data, load),
      team: (e, btn) => editTeam(btn.dataset.id ? data.teams.find((x) => x.id === btn.dataset.id) : null, data.staff, load),
    });
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return offClick;
  },
};
