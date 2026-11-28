// Performance reviews. A manager starts one for a person and a period; if
// set, the person first gives their own view; the manager scores each
// criterion (1–5) with notes and a summary, beside facts from attendance
// and tasks; sharing it keeps the facts as they were; the person reads it
// and acknowledges it with a comment. Nobody reviews themselves, and a
// manager's review is a shareholder's.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { saveSetting, setting } from '../kernel/settings.js';
import { attendanceMonth } from './attendance.js';
import { mayDecideFor, staffOfUser } from './staff.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });

// What happened in the period: days worked, late, absent and on leave, and
// the person's tasks.
function factsFor(db, staff, from, to) {
  const facts = { worked_days: 0, worked_min: 0, late_days: 0, absent_days: 0, leave_days: 0, tasks_done: 0, tasks_not_done: 0, tasks_missed: 0 };
  for (let m = from.slice(0, 7); m <= to.slice(0, 7);) {
    for (const d of attendanceMonth(db, staff, { month: m }).days) {
      if (d.date < from || d.date > to) continue;
      if (['in', 'out', 'incomplete'].includes(d.state)) facts.worked_days++;
      facts.worked_min += d.worked_min;
      if (d.late_min) facts.late_days++;
      if (d.state === 'absent') facts.absent_days++;
      if (d.state === 'leave') facts.leave_days++;
    }
    const next = new Date(`${m}-01T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    m = next.toISOString().slice(0, 7);
  }
  for (const t of db.all('Tasks')) {
    if (t.staff_id !== staff.id || t.due_date < from || t.due_date > to) continue;
    if (t.status === 'done' || t.status === 'to_check') facts.tasks_done++;
    else if (t.status === 'not_done') facts.tasks_not_done++;
    else if (t.status === 'open' && t.due_date < dhakaDate(db.now.getTime())) facts.tasks_missed++;
  }
  return facts;
}

function reviewView(db, r, { manager }) {
  const staff = db.get('Staff', r.staff_id);
  const shared = r.status === 'shared' || r.status === 'acknowledged';
  return {
    id: r.id, version: r.version, staff: { id: staff.id, name: staff.name, position: staff.position }, from: r.from, to: r.to, status: r.status,
    // The person sees the manager's scores only once shared.
    criteria: manager || shared ? r.criteria : [], summary: manager || shared ? r.summary : '',
    self: r.self, staff_comment: r.staff_comment,
    facts: r.facts || factsFor(db, staff, r.from, r.to), shared_at: r.shared_at, acked_at: r.acked_at,
  };
}

function managed(ctx, id) {
  const r = ctx.db.get('Reviews', id);
  if (!r) throw new AppError('NOT_FOUND');
  const staff = ctx.db.get('Staff', r.staff_id);
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!mayDecideFor(ctx, staff, 'performance.manage')) throw new AppError('FORBIDDEN');
  return r;
}

function list(ctx) {
  const { db } = ctx;
  const me = staffOfUser(db, ctx.user.id);
  const mineList = me ? db.all('Reviews').filter((r) => r.staff_id === me.id && r.status !== 'draft') : [];
  const theirs = ctx.can('performance.manage')
    ? db.all('Reviews').filter((r) => mayDecideFor(ctx, db.get('Staff', r.staff_id), 'performance.manage')) : [];
  const byNewest = (a, b) => (a.to < b.to ? 1 : -1);
  return {
    mine: mineList.sort(byNewest).map((r) => reviewView(db, r, { manager: false })),
    theirs: theirs.sort(byNewest).map((r) => reviewView(db, r, { manager: true })),
    criteria: setting(db, 'performance.criteria'),
    staff: ctx.can('performance.manage') ? db.all('Staff').filter((s) => s.status === 'active' && mayDecideFor(ctx, s, 'performance.manage')).map((s) => ({ id: s.id, name: s.name })) : [],
  };
}

const blank = (criteria) => criteria.map((name) => ({ name, score: null, note: '' }));

function start(ctx, input) {
  const { db } = ctx;
  const staff = db.get('Staff', input.staff_id);
  if (!staff || staff.status !== 'active') throw new AppError('NOT_FOUND');
  if (staff.user_id === ctx.user.id) throw new AppError('OWN_ENTRY');
  if (!mayDecideFor(ctx, staff, 'performance.manage')) throw new AppError('FORBIDDEN');
  if (input.to < input.from) throw fieldError('to', 'val.date_order');
  const criteria = setting(db, 'performance.criteria');
  const selfFirst = setting(db, 'performance.self_assessment') && Boolean(staff.user_id);
  const row = db.insert('Reviews', {
    staff_id: staff.id, from: input.from, to: input.to, status: selfFirst ? 'self' : 'draft', criteria: blank(criteria),
    self: selfFirst ? blank(criteria) : [], summary: '', facts: null, staff_comment: '', started_by: ctx.user.id, shared_by: '', shared_at: '', acked_at: '',
  });
  return saved(row.id);
}

// Scores line up with the review's criteria; a score is 1 to 5.
function scored(lines, input) {
  return lines.map((c, i) => ({ name: c.name, score: input[i] ? input[i].score : null, note: input[i] ? input[i].note || '' : '' }));
}

function selfView(ctx, { id, lines }) {
  const { db } = ctx;
  const r = db.get('Reviews', id);
  const me = staffOfUser(db, ctx.user.id);
  if (!r || !me || r.staff_id !== me.id) throw new AppError('NOT_FOUND');
  if (r.status !== 'self') throw new AppError('CONFLICT', { by: '' });
  db.update('Reviews', r, { self: scored(r.self, lines), status: 'draft' });
  return saved(r.id);
}

function score(ctx, { id, version, lines, summary, share }) {
  const { db } = ctx;
  const r = managed(ctx, id);
  if (r.status === 'shared' || r.status === 'acknowledged') throw new AppError('CONFLICT', { by: '' });
  if (share && r.status === 'self') throw new AppError('CONFLICT', { by: '' });
  const criteria = scored(r.criteria, lines);
  if (share) {
    const missing = criteria.findIndex((c) => !c.score);
    if (missing >= 0) throw fieldError(`lines.${missing}.score`, 'val.required');
  }
  const staff = db.get('Staff', r.staff_id);
  const fields = { criteria, summary: summary || '' };
  if (share) Object.assign(fields, { status: 'shared', facts: factsFor(db, staff, r.from, r.to), shared_by: ctx.user.id, shared_at: db.nowIso });
  db.update('Reviews', r, fields, version || undefined);
  return saved(r.id);
}

function acknowledge(ctx, { id, comment }) {
  const { db } = ctx;
  const r = db.get('Reviews', id);
  const me = staffOfUser(db, ctx.user.id);
  if (!r || !me || r.staff_id !== me.id) throw new AppError('NOT_FOUND');
  if (r.status !== 'shared') throw new AppError('CONFLICT', { by: '' });
  db.update('Reviews', r, { status: 'acknowledged', staff_comment: comment || '', acked_at: db.nowIso });
  return saved(r.id);
}

// For Home: reviews waiting for the person (their own view, or to read).
export function reviewsWaiting(ctx) {
  const me = staffOfUser(ctx.db, ctx.user.id);
  if (!me) return 0;
  return ctx.db.all('Reviews').filter((r) => r.staff_id === me.id && (r.status === 'self' || r.status === 'shared')).length;
}

function readSettings(db) {
  return { criteria: setting(db, 'performance.criteria'), self_assessment: setting(db, 'performance.self_assessment') };
}

function saveSettings(ctx, input) {
  const names = input.criteria.map((c) => c.name).filter(Boolean);
  if (!names.length) throw fieldError('criteria', 'val.required');
  saveSetting(ctx.db, 'performance.criteria', names);
  saveSetting(ctx.db, 'performance.self_assessment', Boolean(input.self_assessment));
  return saved(null, readSettings(ctx.db));
}

export const PERFORMANCE_HANDLERS = {
  'reviews.list': list,
  'reviews.start': start,
  'reviews.self': selfView,
  'reviews.score': score,
  'reviews.ack': acknowledge,
  'settings.reviews': (ctx) => readSettings(ctx.db),
  'settings.reviews.save': saveSettings,
};
