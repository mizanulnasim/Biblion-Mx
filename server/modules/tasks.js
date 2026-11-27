// Tasks: one-off tasks given to a person, and repeating tasks made each day
// by the hourly job (only on days the person is meant to work). People do
// their own tasks without a permission: mark them done (or not done, with a
// reason) and comment, also offline. A task can need a manager's check;
// the check can send it back. Approved leave skips repeating tasks on those
// days and moves one-off tasks to the next working day.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { addDays, datesBetween } from '../../shared/hr/plan.js';
import { TASK_LINKS, occursOn } from '../../shared/tasks/tasks.js';
import { setting } from '../kernel/settings.js';
import { planner } from './rota.js';
import { mayDecideFor, staffOfUser } from './staff.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const today = (db) => dhakaDate(db.now.getTime());
const OPEN = ['open'];
// How far a moved task looks for the next working day.
const MOVE_LOOKAHEAD_DAYS = 30;

function taskView(db, t, names) {
  const now = today(db);
  const late = t.status === 'open' && (t.due_date < now || (t.due_date === now && t.due_time && t.due_time < hhmmNow(db)));
  return {
    id: t.id, template_id: t.template_id, title: t.title, details: t.details, staff_id: t.staff_id, staff_name: names.get(t.staff_id) || '',
    due_date: t.due_date, due_time: t.due_time, link: t.link, needs_check: t.needs_check, status: t.status, overdue: late,
    note: t.note, done_at: t.done_at, check_note: t.check_note, skip_reason: t.skip_reason, moved_from: t.moved_from,
    comments: t.comments || [], version: t.version,
  };
}

function hhmmNow(db) {
  return new Date(db.now.getTime() + 6 * 3600000).toISOString().slice(11, 16);
}

const names = (db) => new Map(db.all('Staff').map((s) => [s.id, s.name]));

function newTask(db, fields) {
  return db.insert('Tasks', {
    template_id: '', details: '', due_time: '', link: '', needs_check: false, status: 'open', note: '', done_at: '', done_by: '',
    checked_by: '', checked_at: '', check_note: '', skip_reason: '', moved_from: '', comments: [], ...fields,
  });
}

// Makes the tasks of active templates for today and the days ahead, once
// each, on the days the person is meant to work. Returns how many it made.
export function makeTasks(db) {
  const p = planner(db);
  const dates = datesBetween(today(db), addDays(today(db), setting(db, 'tasks.days_ahead')));
  const have = new Set(db.all('Tasks').filter((t) => t.template_id).map((t) => `${t.template_id}|${t.due_date}`));
  let made = 0;
  for (const tpl of db.all('Task_Templates').filter((x) => x.status === 'active')) {
    const staff = db.get('Staff', tpl.staff_id);
    if (!staff || staff.status !== 'active') continue;
    for (const date of dates) {
      if (have.has(`${tpl.id}|${date}`) || !occursOn(tpl, date) || p.plan(staff, date).kind !== 'work') continue;
      newTask(db, {
        template_id: tpl.id, title: tpl.title, details: tpl.details, staff_id: staff.id, due_date: date, due_time: tpl.due_time,
        link: tpl.link, needs_check: tpl.needs_check, created_by: 'SYSTEM',
      });
      made++;
    }
  }
  return made;
}

// When leave is approved: repeating tasks on those days are skipped, and
// one-off tasks move to the person's next working day after the leave.
export function moveTasksForLeave(db, leave) {
  const p = planner(db);
  const staff = db.get('Staff', leave.staff_id);
  for (const t of db.all('Tasks')) {
    if (t.staff_id !== staff.id || !OPEN.includes(t.status) || t.due_date < leave.from || t.due_date > leave.to) continue;
    if (t.template_id) {
      db.update('Tasks', t, { status: 'skipped', skip_reason: 'leave' });
      continue;
    }
    let next = addDays(leave.to, 1);
    for (let i = 0; i < MOVE_LOOKAHEAD_DAYS && p.plan(staff, next).kind !== 'work'; i++) next = addDays(next, 1);
    db.update('Tasks', t, { due_date: next, moved_from: t.moved_from || t.due_date });
  }
}

function ownTask(ctx, id) {
  const t = ctx.db.get('Tasks', id);
  const me = staffOfUser(ctx.db, ctx.user.id);
  if (!t || !me || t.staff_id !== me.id) throw new AppError('NOT_FOUND');
  return t;
}

// The person's own tasks: overdue, today, the days ahead, and the last week done.
function mine(ctx) {
  const { db } = ctx;
  const me = staffOfUser(db, ctx.user.id);
  if (!me) throw new AppError('NO_STAFF');
  const now = today(db);
  const ahead = addDays(now, setting(db, 'tasks.days_ahead'));
  const week = addDays(now, -7);
  const n = names(db);
  const items = db.all('Tasks').filter((t) => t.staff_id === me.id
    && ((t.status === 'open' && t.due_date <= ahead) || (t.status !== 'open' && t.due_date >= week)))
    .sort((a, b) => (a.due_date + a.due_time < b.due_date + b.due_time ? -1 : 1));
  return { today: now, items: items.map((t) => taskView(db, t, n)), to_check: ctx.can('tasks.verify') ? toCheck(ctx).length : 0 };
}

function toCheck(ctx) {
  const { db } = ctx;
  return db.all('Tasks').filter((t) => t.status === 'to_check' && mayDecideFor(ctx, db.get('Staff', t.staff_id), 'tasks.verify'));
}

// Everyone's tasks for a date (or one person's), for managers.
function list(ctx, input) {
  const { db } = ctx;
  const date = input.date || today(db);
  const n = names(db);
  const items = db.all('Tasks').filter((t) => (input.staff_id ? t.staff_id === input.staff_id : true)
    && (t.due_date === date || (t.status === 'open' && t.due_date < date)))
    .sort((a, b) => ((n.get(a.staff_id) || '') + a.due_time < (n.get(b.staff_id) || '') + b.due_time ? -1 : 1));
  return {
    date,
    items: items.map((t) => taskView(db, t, n)),
    to_check: ctx.can('tasks.verify') ? toCheck(ctx).map((t) => taskView(db, t, n)) : [],
    staff: db.all('Staff').filter((s) => s.status === 'active').map((s) => ({ id: s.id, name: s.name })),
  };
}

function checkLink(link) {
  if (link && !TASK_LINKS[link]) throw fieldError('link', 'val.choice');
}

function activeStaff(db, id) {
  const staff = db.get('Staff', id);
  if (!staff || staff.status !== 'active') throw fieldError('staff_id', 'val.not_found');
  return staff;
}

function create(ctx, input) {
  const { db } = ctx;
  activeStaff(db, input.staff_id);
  checkLink(input.link);
  if (input.due_date < today(db)) throw fieldError('due_date', 'val.not_past');
  const row = newTask(db, {
    title: input.title, details: input.details || '', staff_id: input.staff_id, due_date: input.due_date, due_time: input.due_time || '',
    link: input.link || '', needs_check: Boolean(input.needs_check), created_by: ctx.user.id,
  });
  return saved(row.id);
}

function complete(ctx, { id, note }) {
  const { db } = ctx;
  const t = ownTask(ctx, id);
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  db.update('Tasks', t, { status: t.needs_check ? 'to_check' : 'done', note: note || '', done_at: db.nowIso, done_by: ctx.user.id });
  return saved(t.id, { status: t.needs_check ? 'to_check' : 'done' });
}

function notDone(ctx, { id, reason }) {
  const { db } = ctx;
  const t = ownTask(ctx, id);
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  db.setReason(reason);
  db.update('Tasks', t, { status: 'not_done', note: reason, done_at: db.nowIso, done_by: ctx.user.id });
  return saved(t.id);
}

function comment(ctx, { id, text }) {
  const { db } = ctx;
  const t = db.get('Tasks', id);
  if (!t) throw new AppError('NOT_FOUND');
  const me = staffOfUser(db, ctx.user.id);
  if (!(me && t.staff_id === me.id) && !ctx.can('tasks.view_all')) throw new AppError('NOT_FOUND');
  const comments = [...(t.comments || []), { by: ctx.user.id, name: ctx.user.display_name, at: db.nowIso, text }];
  db.update('Tasks', t, { comments });
  return saved(t.id);
}

// A check: accepted (done), or sent back with a note (open again).
function verify(ctx, { id, decision, note }) {
  const { db } = ctx;
  const t = db.get('Tasks', id);
  if (!t) throw new AppError('NOT_FOUND');
  if (t.status !== 'to_check') throw new AppError('CONFLICT', { by: '' });
  const staff = db.get('Staff', t.staff_id);
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!mayDecideFor(ctx, staff, 'tasks.verify')) throw new AppError('FORBIDDEN');
  if (decision === 'reject' && !note) throw fieldError('note', 'val.required');
  if (note) db.setReason(note);
  db.update('Tasks', t, {
    status: decision === 'accept' ? 'done' : 'open', checked_by: ctx.user.id, checked_at: db.nowIso, check_note: note || '',
  });
  return saved(t.id);
}

function reassign(ctx, { id, staff_id: staffId, due_date: dueDate }) {
  const { db } = ctx;
  const t = db.get('Tasks', id);
  if (!t) throw new AppError('NOT_FOUND');
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  activeStaff(db, staffId);
  db.update('Tasks', t, { staff_id: staffId, due_date: dueDate || t.due_date });
  return saved(t.id);
}

function cancel(ctx, { id, reason }) {
  const { db } = ctx;
  const t = db.get('Tasks', id);
  if (!t) throw new AppError('NOT_FOUND');
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  db.setReason(reason);
  db.update('Tasks', t, { status: 'skipped', skip_reason: reason });
  return saved(t.id);
}

// ---- Repeating tasks --------------------------------------------------------

function templates(ctx) {
  const { db } = ctx;
  const n = names(db);
  return {
    items: db.all('Task_Templates').sort((a, b) => a.title.localeCompare(b.title)).map((t) => ({
      id: t.id, version: t.version, title: t.title, details: t.details, staff_id: t.staff_id, staff_name: n.get(t.staff_id) || '',
      repeat: t.repeat, days: t.days || [], day_of_month: t.day_of_month, due_time: t.due_time, link: t.link, needs_check: t.needs_check,
      start_date: t.start_date, end_date: t.end_date, status: t.status,
    })),
    staff: db.all('Staff').filter((s) => s.status === 'active').map((s) => ({ id: s.id, name: s.name })),
  };
}

function saveTemplate(ctx, input) {
  const { db } = ctx;
  activeStaff(db, input.staff_id);
  checkLink(input.link);
  const days = [...new Set(input.days.map((d) => d.day))].sort();
  if (input.repeat === 'weekly' && !days.length) throw fieldError('days', 'val.required');
  if (input.repeat === 'monthly' && !input.day_of_month) throw fieldError('day_of_month', 'val.required');
  if (input.end_date && input.end_date < input.start_date) throw fieldError('end_date', 'val.date_order');
  const fields = {
    title: input.title, details: input.details || '', staff_id: input.staff_id, repeat: input.repeat, days: input.repeat === 'weekly' ? days : [],
    day_of_month: input.repeat === 'monthly' ? input.day_of_month : null, due_time: input.due_time || '', link: input.link || '',
    needs_check: Boolean(input.needs_check), start_date: input.start_date, end_date: input.end_date || '', status: input.status,
  };
  let id = input.id;
  if (!id) id = db.insert('Task_Templates', fields).id;
  else {
    const row = db.get('Task_Templates', id);
    if (!row) throw new AppError('NOT_FOUND');
    db.update('Task_Templates', row, fields, input.version);
    // Open tasks not yet due follow the change of person; a paused or
    // ended template's future tasks are skipped.
    for (const t of db.all('Tasks').filter((x) => x.template_id === id && x.status === 'open' && x.due_date >= today(db))) {
      if (input.status !== 'active') db.update('Tasks', t, { status: 'skipped', skip_reason: input.status });
      else if (t.staff_id !== input.staff_id) db.update('Tasks', t, { staff_id: input.staff_id });
    }
  }
  makeTasks(db);
  return saved(id);
}

// For Home and day closing.
export function tasksDue(db, date) {
  const due = db.all('Tasks').filter((t) => t.due_date === date && t.status !== 'skipped');
  return { total: due.length, open: due.filter((t) => t.status === 'open').length };
}

export function tasksToCheck(ctx) {
  return ctx.can('tasks.verify') ? toCheck(ctx).length : 0;
}

export const TASK_HANDLERS = {
  'tasks.mine': mine,
  'tasks.list': list,
  'tasks.create': create,
  'tasks.complete': complete,
  'tasks.not_done': notDone,
  'tasks.comment': comment,
  'tasks.verify': verify,
  'tasks.reassign': reassign,
  'tasks.cancel': cancel,
  'tasks.templates': templates,
  'tasks.template.save': saveTemplate,
};
