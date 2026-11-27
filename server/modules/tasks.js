// Tasks: one-off tasks and repeating tasks made each day by the hourly job
// (only on days someone is meant to work), given to a person or to a role
// (anyone of it may do the task). People do their own tasks without a
// permission: mark them done (or not done, with a reason) and comment, also
// offline. Every task done is checked by someone more senior, who can send
// it back; a shareholder's own task is final. A task linked to a screen
// needs its record (an entry, a count …) before it can be done, unless a
// manager allows it without one, with a reason. Approved leave skips
// repeating tasks on those days and moves one-off tasks to the working day
// before the leave (flagged when there is none); so does a one-off task
// given for a day the person doesn't work.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { roleById } from '../../shared/schema/permissions.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { addDays, datesBetween } from '../../shared/hr/plan.js';
import { TASK_LINKS, occursOn } from '../../shared/tasks/tasks.js';
import { setting } from '../kernel/settings.js';
import { planner } from './rota.js';
import { mayDecideFor, staffOfUser } from './staff.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
const today = (db) => dhakaDate(db.now.getTime());
const OPEN = ['open'];

function hhmmNow(db) {
  return new Date(db.now.getTime() + 6 * 3600000).toISOString().slice(11, 16);
}

const names = (db) => new Map(db.all('Staff').map((s) => [s.id, s.name]));

// The role key of a user (owner, manager, staff), or ''.
function roleKey(user) {
  const role = user ? roleById(user.role_id) : null;
  return role ? role.key : '';
}

function roleOfStaff(db, staff) {
  return staff.user_id ? roleKey(db.get('Users', staff.user_id)) : '';
}

function taskView(db, t, n) {
  const now = today(db);
  const late = t.status === 'open' && (t.due_date < now || (t.due_date === now && t.due_time && t.due_time < hhmmNow(db)));
  return {
    id: t.id, template_id: t.template_id, title: t.title, details: t.details, staff_id: t.staff_id, staff_name: n.get(t.staff_id) || '',
    role: t.role, due_date: t.due_date, due_time: t.due_time, link: t.link, status: t.status, overdue: late,
    record_id: t.record_id, override_reason: t.override_reason, move_flag: t.move_flag,
    note: t.note, done_at: t.done_at, check_note: t.check_note, skip_reason: t.skip_reason, moved_from: t.moved_from,
    comments: t.comments || [], version: t.version,
  };
}

function newTask(db, fields) {
  return db.insert('Tasks', {
    template_id: '', details: '', staff_id: '', role: '', due_time: '', link: '', status: 'open', record_id: '', override_reason: '',
    note: '', done_at: '', done_by: '', checked_by: '', checked_at: '', check_note: '', skip_reason: '', moved_from: '', move_flag: '',
    comments: [], ...fields,
  });
}

// Makes the tasks of active templates for today and the days ahead, once
// each: a person's on the days they are meant to work (and not after their
// last day); a role's on the days anyone of it is. Returns how many it made.
export function makeTasks(db) {
  const p = planner(db);
  const dates = datesBetween(today(db), addDays(today(db), setting(db, 'tasks.days_ahead')));
  const have = new Set(db.all('Tasks').filter((t) => t.template_id).map((t) => `${t.template_id}|${t.due_date}`));
  const active = db.all('Staff').filter((s) => s.status === 'active');
  const works = (staff, date) => p.plan(staff, date).kind === 'work' && !(staff.left_on && date > staff.left_on);
  let made = 0;
  for (const tpl of db.all('Task_Templates').filter((x) => x.status === 'active')) {
    const people = tpl.role ? active.filter((s) => roleOfStaff(db, s) === tpl.role) : active.filter((s) => s.id === tpl.staff_id);
    for (const date of dates) {
      if (have.has(`${tpl.id}|${date}`) || !occursOn(tpl, date) || !people.some((s) => works(s, date))) continue;
      newTask(db, {
        template_id: tpl.id, title: tpl.title, details: tpl.details, staff_id: tpl.role ? '' : tpl.staff_id, role: tpl.role || '',
        due_date: date, due_time: tpl.due_time, link: tpl.link, created_by: 'SYSTEM',
      });
      made++;
    }
  }
  return made;
}

// When leave is approved: repeating tasks on those days are skipped, and
// one-off tasks move to the person's last working day before the leave (not
// before today); with none, they stay and are flagged for a manager.
export function moveTasksForLeave(db, leave) {
  const p = planner(db);
  const staff = db.get('Staff', leave.staff_id);
  const now = today(db);
  for (const t of db.all('Tasks')) {
    if (t.staff_id !== staff.id || !OPEN.includes(t.status) || t.due_date < leave.from || t.due_date > leave.to) continue;
    if (t.template_id) {
      db.update('Tasks', t, { status: 'skipped', skip_reason: 'leave' });
      continue;
    }
    const before = leave.from > now ? workingDayFor(db, staff, addDays(leave.from, -1), p) : '';
    if (!before) db.update('Tasks', t, { move_flag: 'no_day' });
    else db.update('Tasks', t, { due_date: before, moved_from: t.moved_from || t.due_date, move_flag: '' });
  }
}

// A task the signed-in person may do: theirs, or open and given to their role.
function ownTask(ctx, id) {
  const t = ctx.db.get('Tasks', id);
  const me = staffOfUser(ctx.db, ctx.user.id);
  const mineToDo = t && me && (t.staff_id === me.id || (!t.staff_id && t.role && t.role === roleKey(ctx.user)));
  if (!mineToDo) throw new AppError('NOT_FOUND');
  return { t, me };
}

// The person's own tasks (and their role's open ones): overdue, today, the
// days ahead, and the last week done.
function mine(ctx) {
  const { db } = ctx;
  const me = staffOfUser(db, ctx.user.id);
  if (!me) throw new AppError('NO_STAFF');
  const role = roleKey(ctx.user);
  const now = today(db);
  const ahead = addDays(now, setting(db, 'tasks.days_ahead'));
  const week = addDays(now, -7);
  const n = names(db);
  const items = db.all('Tasks').filter((t) => (t.staff_id === me.id || (!t.staff_id && t.role === role))
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
    .sort((a, b) => ((n.get(a.staff_id) || a.role) + a.due_time < (n.get(b.staff_id) || b.role) + b.due_time ? -1 : 1));
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

// A person or a role, exactly one.
function assignee(db, input) {
  if (Boolean(input.staff_id) === Boolean(input.role)) throw fieldError('staff_id', 'val.required');
  if (input.staff_id) activeStaff(db, input.staff_id);
  return { staff_id: input.staff_id || '', role: input.role || '' };
}

// The working day for a person's task due on `date`: that day, or the
// nearest earlier one from today (none: '').
function workingDayFor(db, staff, date, p = planner(db)) {
  let day = date;
  while (day >= today(db) && p.plan(staff, day).kind !== 'work') day = addDays(day, -1);
  return day >= today(db) ? day : '';
}

// A person's task given for a day they don't work (off, leave, a closed
// holiday) moves to the nearest earlier working day; with none it stays,
// flagged.
function create(ctx, input) {
  const { db } = ctx;
  const who = assignee(db, input);
  checkLink(input.link);
  if (input.due_date < today(db)) throw fieldError('due_date', 'val.not_past');
  let due = { due_date: input.due_date, moved_from: '', move_flag: '' };
  if (who.staff_id) {
    const day = workingDayFor(db, db.get('Staff', who.staff_id), input.due_date);
    if (!day) due = { ...due, move_flag: 'no_day' };
    else if (day !== input.due_date) due = { due_date: day, moved_from: input.due_date, move_flag: '' };
  }
  const row = newTask(db, {
    title: input.title, details: input.details || '', ...who, ...due, due_time: input.due_time || '', link: input.link || '', created_by: ctx.user.id,
  });
  return saved(row.id, { due_date: row.due_date, moved_from: row.moved_from, move_flag: row.move_flag });
}

// The record a linked task was done with: one that counts, dated from the
// day the task was made to today.
function recordFor(db, t) {
  const spec = TASK_LINKS[t.link].record;
  const from = dhakaDate(Date.parse(t.created_at));
  const now = today(db);
  const row = db.all(spec.table).find((r) => r.date >= from && r.date <= now && spec.counts(r));
  return row ? row.id : '';
}

function complete(ctx, { id, note }) {
  const { db } = ctx;
  const { t, me } = ownTask(ctx, id);
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  const recordId = t.link && TASK_LINKS[t.link] ? recordFor(db, t) : '';
  if (t.link && !recordId && !t.override_reason) throw new AppError('TASK_RECORD');
  // Checked by someone more senior; a shareholder's own is final.
  const status = roleKey(ctx.user) === 'owner' ? 'done' : 'to_check';
  db.update('Tasks', t, { staff_id: me.id, status, record_id: recordId, note: note || '', done_at: db.nowIso, done_by: ctx.user.id });
  return saved(t.id, { status });
}

function notDone(ctx, { id, reason }) {
  const { db } = ctx;
  const { t, me } = ownTask(ctx, id);
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  db.setReason(reason);
  db.update('Tasks', t, { staff_id: me.id, status: 'not_done', note: reason, done_at: db.nowIso, done_by: ctx.user.id });
  return saved(t.id);
}

function comment(ctx, { id, text }) {
  const { db } = ctx;
  const t = db.get('Tasks', id);
  if (!t) throw new AppError('NOT_FOUND');
  const me = staffOfUser(db, ctx.user.id);
  const theirs = me && (t.staff_id === me.id || (!t.staff_id && t.role === roleKey(ctx.user)));
  if (!theirs && !ctx.can('tasks.view_all')) throw new AppError('NOT_FOUND');
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

// A linked task may be done without its record: allowed by someone who may
// decide for the person (for a role's task, someone more senior than it).
function allow(ctx, { id, reason }) {
  const { db } = ctx;
  const t = db.get('Tasks', id);
  if (!t) throw new AppError('NOT_FOUND');
  if (t.status !== 'open' || !t.link) throw new AppError('CONFLICT', { by: '' });
  if (t.staff_id) {
    const staff = db.get('Staff', t.staff_id);
    if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
    if (!mayDecideFor(ctx, staff, 'tasks.manage')) throw new AppError('FORBIDDEN');
  } else {
    const level = (key) => (key ? roleById(`ROL-${key.toUpperCase()}`).level : 0);
    if (level(roleKey(ctx.user)) <= level(t.role)) throw new AppError('FORBIDDEN');
  }
  db.setReason(reason);
  db.update('Tasks', t, { override_reason: reason });
  return saved(t.id);
}

function reassign(ctx, { id, staff_id: staffId, due_date: dueDate }) {
  const { db } = ctx;
  const t = db.get('Tasks', id);
  if (!t) throw new AppError('NOT_FOUND');
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  activeStaff(db, staffId);
  db.update('Tasks', t, { staff_id: staffId, role: '', due_date: dueDate || t.due_date, move_flag: '' });
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
      id: t.id, version: t.version, title: t.title, details: t.details, staff_id: t.staff_id, staff_name: n.get(t.staff_id) || '', role: t.role,
      repeat: t.repeat, days: t.days || [], day_of_month: t.day_of_month, due_time: t.due_time, link: t.link,
      start_date: t.start_date, end_date: t.end_date, status: t.status,
    })),
    staff: db.all('Staff').filter((s) => s.status === 'active').map((s) => ({ id: s.id, name: s.name })),
  };
}

function saveTemplate(ctx, input) {
  const { db } = ctx;
  const who = assignee(db, input);
  checkLink(input.link);
  const days = [...new Set(input.days.map((d) => d.day))].sort();
  if (input.repeat === 'weekly' && !days.length) throw fieldError('days', 'val.required');
  if (input.repeat === 'monthly' && !input.day_of_month) throw fieldError('day_of_month', 'val.required');
  if (input.end_date && input.end_date < input.start_date) throw fieldError('end_date', 'val.date_order');
  const fields = {
    title: input.title, details: input.details || '', ...who, repeat: input.repeat, days: input.repeat === 'weekly' ? days : [],
    day_of_month: input.repeat === 'monthly' ? input.day_of_month : null, due_time: input.due_time || '', link: input.link || '',
    start_date: input.start_date, end_date: input.end_date || '', status: input.status,
  };
  let id = input.id;
  if (!id) id = db.insert('Task_Templates', fields).id;
  else {
    const row = db.get('Task_Templates', id);
    if (!row) throw new AppError('NOT_FOUND');
    db.update('Task_Templates', row, fields, input.version);
    // Open tasks not yet due follow the change of person or role; a paused
    // or ended template's future tasks are skipped.
    for (const t of db.all('Tasks').filter((x) => x.template_id === id && x.status === 'open' && x.due_date >= today(db))) {
      if (input.status !== 'active') db.update('Tasks', t, { status: 'skipped', skip_reason: input.status });
      else if (t.staff_id !== who.staff_id || t.role !== who.role) db.update('Tasks', t, who);
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
  'tasks.allow': allow,
  'tasks.reassign': reassign,
  'tasks.cancel': cancel,
  'tasks.templates': templates,
  'tasks.template.save': saveTemplate,
};
