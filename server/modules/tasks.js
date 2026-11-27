// Tasks: one-off tasks and repeating tasks made each day by the hourly job
// (only on days someone is meant to work), given to a person, or to a role,
// a position or a team: one task anyone of it may do, or (each) a task for
// every person of it. People do their own tasks without a
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
import { REPORTS } from '../../shared/reports/reports.js';
import { setting } from '../kernel/settings.js';
import { planner } from './rota.js';
import { mayDecideFor, staffOfUser } from './staff.js';
import { storeFile } from './files.js';
import { tell } from './messages.js';

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

// Whether a person is one of those a task (or template) is given to.
function isFor(db, t, staff) {
  if (t.staff_id) return t.staff_id === staff.id;
  if (t.role) return roleOfStaff(db, staff) === t.role;
  if (t.position) return (staff.position || '').toLowerCase() === t.position.toLowerCase();
  const team = t.team_id ? db.get('Teams', t.team_id) : null;
  return Boolean(team && team.status === 'active' && team.member_ids.includes(staff.id));
}

// Who a task is for, as words: a team's name (a role or position is named
// on the screen).
const teamName = (db, t) => (t.team_id ? (db.get('Teams', t.team_id) || {}).name || '' : '');

function taskView(db, t, n) {
  const now = today(db);
  const late = t.status === 'open' && (t.due_date < now || (t.due_date === now && t.due_time && t.due_time < hhmmNow(db)));
  return {
    id: t.id, template_id: t.template_id, title: t.title, details: t.details, staff_id: t.staff_id, staff_name: n.get(t.staff_id) || '',
    role: t.role, position: t.position, team: teamName(db, t), priority: t.priority || 'normal',
    due_date: t.due_date, due_time: t.due_time, link: t.link, status: t.status, overdue: late,
    record_id: t.record_id, override_reason: t.override_reason, move_flag: t.move_flag,
    checklist: t.checklist || [], evidence: t.evidence || {}, answers: t.answers || {}, files: t.files || [],
    note: t.note, done_at: t.done_at, check_note: t.check_note, skip_reason: t.skip_reason, moved_from: t.moved_from,
    comments: t.comments || [], version: t.version,
  };
}

function newTask(db, fields) {
  return db.insert('Tasks', {
    template_id: '', details: '', staff_id: '', role: '', position: '', team_id: '', priority: 'normal', due_time: '', link: '', status: 'open',
    checklist: [], evidence: {}, answers: {}, files: [], record_id: '', override_reason: '',
    note: '', done_at: '', done_by: '', checked_by: '', checked_at: '', check_note: '', skip_reason: '', moved_from: '', move_flag: '',
    comments: [], ...fields,
  });
}

// The fields saying who a task is for. For `each`, a person's own copy.
const whoFields = (t, staffId = '') => (staffId ? { staff_id: staffId, role: '', position: '', team_id: '' }
  : { staff_id: t.staff_id || '', role: t.role || '', position: t.position || '', team_id: t.team_id || '' });

// Makes the tasks of active templates for today and the days ahead, once
// each: a person's on the days they are meant to work (and not after their
// last day); a shared one on the days anyone it is for does; with `each`,
// one for every one of them who works that day. Returns how many it made.
export function makeTasks(db) {
  const p = planner(db);
  const dates = datesBetween(today(db), addDays(today(db), setting(db, 'tasks.days_ahead')));
  const have = new Set(db.all('Tasks').filter((t) => t.template_id).map((t) => `${t.template_id}|${t.due_date}|${t.each_of || ''}`));
  const active = db.all('Staff').filter((s) => s.status === 'active');
  const works = (staff, date) => p.plan(staff, date).kind === 'work' && !(staff.left_on && date > staff.left_on);
  let made = 0;
  const make = (tpl, date, staffId) => {
    newTask(db, {
      template_id: tpl.id, each_of: staffId, title: tpl.title, details: tpl.details, ...whoFields(tpl, staffId), priority: tpl.priority || 'normal',
      checklist: tpl.checklist || [], evidence: tpl.evidence || {},
      due_date: date, due_time: tpl.due_time, link: tpl.link, created_by: 'SYSTEM',
    });
    made++;
  };
  for (const tpl of db.all('Task_Templates').filter((x) => x.status === 'active')) {
    const people = active.filter((s) => isFor(db, tpl, s));
    for (const date of dates) {
      if (!occursOn(tpl, date)) continue;
      const working = people.filter((s) => works(s, date));
      if (tpl.each && !tpl.staff_id) {
        for (const s of working) if (!have.has(`${tpl.id}|${date}|${s.id}`)) make(tpl, date, s.id);
      } else if (working.length && !have.has(`${tpl.id}|${date}|`)) make(tpl, date, '');
    }
  }
  return made;
}

// When leave is approved: repeating tasks on those days are skipped, and
// one-off tasks move to the person's last working day before the leave (not
// before today); with none, they stay and are flagged for a manager.
export function moveTasksForLeave(ctx, leave) {
  const { db } = ctx;
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
    else {
      db.update('Tasks', t, { due_date: before, moved_from: t.moved_from || t.due_date, move_flag: '' });
      toldMoved(ctx, t, staff, t.due_date, before);
    }
  }
}

// The doer and the giver are told when a task moves to an earlier day.
function toldMoved(ctx, t, staff, from, to) {
  const params = { title: t.title, from: { d: from }, to: { d: to } };
  tell(ctx, staff.user_id, 'msg.task_moved', params, '/tasks');
  if (t.created_by !== staff.user_id) tell(ctx, t.created_by, 'msg.task_moved_given', { ...params, name: staff.name }, '/tasks');
}

// A task the signed-in person may do: theirs, or open and given to them
// with others (their role, position or team).
function ownTask(ctx, id) {
  const t = ctx.db.get('Tasks', id);
  const me = staffOfUser(ctx.db, ctx.user.id);
  if (!t || !me || !isFor(ctx.db, t, me)) throw new AppError('NOT_FOUND');
  return { t, me };
}

// The person's own tasks (and their role's open ones): overdue, today, the
// days ahead, and the last week done.
function mine(ctx) {
  const { db } = ctx;
  const me = staffOfUser(db, ctx.user.id);
  if (!me) throw new AppError('NO_STAFF');
  const now = today(db);
  const ahead = addDays(now, setting(db, 'tasks.days_ahead'));
  const week = addDays(now, -7);
  const n = names(db);
  const items = db.all('Tasks').filter((t) => isFor(db, t, me)
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
    ...pickLists(db),
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

// The checklist (each item with an id) and the evidence asked for.
function doing(input) {
  return {
    checklist: (input.checklist || []).map((c, i) => ({
      id: `c${i + 1}`, label: c.label, type: c.type, required: Boolean(c.required), min: c.min ?? null, max: c.max ?? null, unit: c.unit || '',
    })),
    evidence: { before: Boolean(input.evidence_before), after: Boolean(input.evidence_after), note: Boolean(input.evidence_note) },
  };
}

// What is still missing before a task can be done: [{field, code, params}].
function missing(t, answers, note) {
  const out = [];
  const hasFile = (slot) => (t.files || []).some((f) => f.slot === slot);
  for (const c of t.checklist || []) {
    const v = answers[c.id];
    const empty = c.type === 'photo' ? !hasFile(c.id) : c.type === 'check' ? v !== 'yes' : v === undefined || v === '';
    if (c.required && empty) out.push({ field: `answers.${c.id}`, code: 'val.required', params: {} });
    if (c.type === 'number' && !empty) {
      const n = Number(v);
      if (!Number.isFinite(n)) out.push({ field: `answers.${c.id}`, code: 'val.not_number', params: {} });
      else if ((c.min !== null && n < c.min) || (c.max !== null && n > c.max)) out.push({ field: `answers.${c.id}`, code: 'val.between', params: { min: c.min ?? '', max: c.max ?? '' } });
    }
  }
  const ev = t.evidence || {};
  if (ev.before && !hasFile('before')) out.push({ field: 'before', code: 'val.photo_needed', params: {} });
  if (ev.after && !hasFile('after')) out.push({ field: 'after', code: 'val.photo_needed', params: {} });
  if (ev.note && !note) out.push({ field: 'note', code: 'val.required', params: {} });
  return out;
}

// A photo for a task the person may do: before, after, a receipt, or a
// checklist item's. A new one replaces the slot's earlier one.
function attach(ctx, input) {
  const { db } = ctx;
  const { t } = ownTask(ctx, input.id);
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  const slots = ['before', 'after', 'receipt', ...(t.checklist || []).filter((c) => c.type === 'photo').map((c) => c.id)];
  if (!slots.includes(input.slot)) throw fieldError('slot', 'val.choice');
  const file = storeFile(ctx, input, 'tasks', [t.id]);
  db.update('Tasks', t, { files: [...(t.files || []).filter((f) => f.slot !== input.slot), { slot: input.slot, file_id: file.id }] });
  return saved(t.id, { file_id: file.id });
}

// A person, a role, a position or a team: exactly one.
function assignee(db, input) {
  const given = ['staff_id', 'role', 'position', 'team_id'].filter((k) => input[k]);
  if (given.length !== 1) throw fieldError('staff_id', 'val.required');
  if (input.staff_id) activeStaff(db, input.staff_id);
  if (input.team_id) {
    const team = db.get('Teams', input.team_id);
    if (!team || team.status !== 'active') throw fieldError('team_id', 'val.not_found');
  }
  return whoFields(input);
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
  // A copy each: one task for every person it is for.
  if (input.each && !who.staff_id) {
    const people = db.all('Staff').filter((s) => s.status === 'active' && isFor(db, who, s));
    if (!people.length) throw fieldError('staff_id', 'val.nobody');
    const ids = people.map((s) => create(ctx, { ...input, ...whoFields(who, s.id), each: false }).record_id);
    return saved(ids[0], { count: ids.length });
  }
  checkLink(input.link);
  if (input.due_date < today(db)) throw fieldError('due_date', 'val.not_past');
  let due = { due_date: input.due_date, moved_from: '', move_flag: '' };
  if (who.staff_id) {
    const day = workingDayFor(db, db.get('Staff', who.staff_id), input.due_date);
    if (!day) due = { ...due, move_flag: 'no_day' };
    else if (day !== input.due_date) due = { due_date: day, moved_from: input.due_date, move_flag: '' };
  }
  const row = newTask(db, {
    title: input.title, details: input.details || '', ...who, ...due, priority: input.priority || 'normal', due_time: input.due_time || '', link: input.link || '',
    ...doing(input), created_by: ctx.user.id,
  });
  if (row.moved_from) toldMoved(ctx, row, db.get('Staff', row.staff_id), row.moved_from, row.due_date);
  return saved(row.id, { due_date: row.due_date, moved_from: row.moved_from, move_flag: row.move_flag });
}

// The records a linked task can be done with: made after the task, of the
// kind the task opens, newest first.
function candidates(db, t) {
  const spec = TASK_LINKS[t.link].record;
  return db.all(spec.table).filter((r) => r.created_at >= t.created_at && spec.counts(r)).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// Whether a record already has its receipt or bill filed on it.
const hasReceipt = (db, id) => db.all('Files').some((f) => f.status === 'active' && (f.record_ids || []).includes(id))
  || Boolean((db.get('Transactions', id) || {}).file_id);

// Ties a linked task to the record it was done with (saved from the task,
// or picked from those made since).
function tie(db, t, recordId) {
  if (!candidates(db, t).some((r) => r.id === recordId)) throw fieldError('record_id', 'val.not_found');
  db.update('Tasks', t, { record_id: recordId });
}

function linkRecord(ctx, { id, record_id: recordId }) {
  const { t } = ownTask(ctx, id);
  if (t.status !== 'open' || !t.link) throw new AppError('CONFLICT', { by: '' });
  tie(ctx.db, t, recordId);
  return saved(t.id);
}

// The records a linked task can be done with, to pick from.
function taskRecords(ctx, { id }) {
  const { db } = ctx;
  const { t } = ownTask(ctx, id);
  if (!t.link) return { items: [], receipt: false };
  return {
    receipt: Boolean(TASK_LINKS[t.link].receipt),
    items: candidates(db, t).map((r) => ({ id: r.id, date: r.date, amount: r.amount ?? null, kind: r.kind || '', note: r.note || '', has_receipt: hasReceipt(db, r.id) })),
  };
}

// A report was printed (or saved as PDF), by someone who may see it.
function reportPrinted(ctx, { report, ref }) {
  if (!ctx.can(REPORTS[report].perm)) throw new AppError('FORBIDDEN');
  const row = ctx.db.insert('Report_Prints', { report, ref: ref || '', printed_by: ctx.user.id });
  return saved(row.id);
}

function complete(ctx, { id, note, answers: list, record_id: recordId }) {
  const { db } = ctx;
  const { t, me } = ownTask(ctx, id);
  if (t.status !== 'open') throw new AppError('CONFLICT', { by: '' });
  const answers = {};
  for (const a of list || []) answers[a.item] = a.value ?? '';
  const gaps = missing(t, answers, note);
  if (gaps.length) throw new AppError('VALIDATION', {}, Object.fromEntries(gaps.map((g) => [g.field, { code: g.code, params: g.params }])));
  // A linked task is done with its record (and, for payments and bills, the
  // receipt), unless a manager allowed it without.
  if (recordId && t.link) tie(db, t, recordId);
  const tied = db.get('Tasks', t.id).record_id;
  if (t.link && !tied && !t.override_reason) throw new AppError('TASK_RECORD');
  if (tied && TASK_LINKS[t.link].receipt) {
    const photo = (t.files || []).find((f) => f.slot === 'receipt');
    if (!photo && !hasReceipt(db, tied)) throw fieldError('receipt', 'val.photo_needed');
    if (photo) {
      const file = db.get('Files', photo.file_id);
      db.update('Files', file, { record_ids: [...new Set([...(file.record_ids || []), tied])] });
    }
  }
  // Checked by someone more senior; a shareholder's own is final.
  const status = roleKey(ctx.user) === 'owner' ? 'done' : 'to_check';
  db.update('Tasks', db.get('Tasks', t.id), { staff_id: me.id, status, answers, note: note || '', done_at: db.nowIso, done_by: ctx.user.id });
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
  if (!(me && isFor(db, t, me)) && !ctx.can('tasks.view_all')) throw new AppError('NOT_FOUND');
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
  if (decision !== 'accept') tell(ctx, staff.user_id, 'msg.task_sent_back', { title: t.title, note }, '/tasks');
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
  } else if (t.role) {
    const level = (key) => (key ? roleById(`ROL-${key.toUpperCase()}`).level : 0);
    if (level(roleKey(ctx.user)) <= level(t.role)) throw new AppError('FORBIDDEN');
  } else {
    // A position's or team's task: not by one of those it is for.
    const me = staffOfUser(db, ctx.user.id);
    if (!ctx.can('tasks.manage') || (me && isFor(db, t, me))) throw new AppError('FORBIDDEN');
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
  db.update('Tasks', t, { ...whoFields(t, staffId), due_date: dueDate || t.due_date, move_flag: '' });
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
      position: t.position, team_id: t.team_id, team: teamName(db, t), each: t.each, priority: t.priority || 'normal',
      checklist: t.checklist || [], evidence: t.evidence || {},
      repeat: t.repeat, every: t.every, days: t.days || [], day_of_month: t.day_of_month, dates: t.dates || [], due_time: t.due_time, link: t.link,
      start_date: t.start_date, end_date: t.end_date, status: t.status,
    })),
    ...pickLists(db),
  };
}

function saveTemplate(ctx, input) {
  const { db } = ctx;
  const who = assignee(db, input);
  checkLink(input.link);
  const days = [...new Set(input.days.map((d) => d.day))].sort();
  const dates = [...new Set((input.dates || []).map((d) => d.date))].sort();
  const weekly = input.repeat === 'weekly' || input.repeat === 'fortnightly';
  const monthly = input.repeat === 'monthly' || input.repeat === 'every_n_months';
  const every = input.repeat === 'every_n_days' || input.repeat === 'every_n_months';
  if (weekly && !days.length) throw fieldError('days', 'val.required');
  if (monthly && !input.day_of_month) throw fieldError('day_of_month', 'val.required');
  if (every && !input.every) throw fieldError('every', 'val.required');
  if (input.repeat === 'dates' && !dates.length) throw fieldError('dates', 'val.required');
  if (input.end_date && input.end_date < input.start_date) throw fieldError('end_date', 'val.date_order');
  const fields = {
    title: input.title, details: input.details || '', ...who, each: Boolean(input.each) && !who.staff_id, priority: input.priority || 'normal', ...doing(input),
    repeat: input.repeat, every: every ? input.every : null, days: weekly ? days : [], day_of_month: monthly ? input.day_of_month : null,
    dates: input.repeat === 'dates' ? dates : [], due_time: input.due_time || '', link: input.link || '',
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
      else if (!t.each_of && ['staff_id', 'role', 'position', 'team_id'].some((k) => t[k] !== who[k])) db.update('Tasks', t, who);
    }
  }
  makeTasks(db);
  return saved(id);
}

// What the forms pick from: people, positions in use, and teams.
function pickLists(db) {
  const active = db.all('Staff').filter((s) => s.status === 'active');
  return {
    staff: active.map((s) => ({ id: s.id, name: s.name })),
    positions: [...new Set(active.map((s) => s.position).filter(Boolean))].sort(),
    teams: db.all('Teams').map((t) => ({ id: t.id, version: t.version, name: t.name, members: t.member_ids, status: t.status })),
  };
}

function saveTeam(ctx, input) {
  const { db } = ctx;
  const members = [...new Set(input.members.map((m) => m.id))];
  for (const id of members) activeStaff(db, id);
  const fields = { name: input.name, member_ids: members, status: input.status };
  if (!input.id) return saved(db.insert('Teams', fields).id);
  const row = db.get('Teams', input.id);
  if (!row) throw new AppError('NOT_FOUND');
  db.update('Teams', row, fields, input.version);
  return saved(row.id);
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
  'tasks.attach': attach,
  'tasks.record': linkRecord,
  'reports.printed': reportPrinted,
  'tasks.records': taskRecords,
  'tasks.not_done': notDone,
  'tasks.comment': comment,
  'tasks.verify': verify,
  'tasks.allow': allow,
  'tasks.reassign': reassign,
  'tasks.cancel': cancel,
  'tasks.templates': templates,
  'tasks.template.save': saveTemplate,
  'tasks.team.save': saveTeam,
};
