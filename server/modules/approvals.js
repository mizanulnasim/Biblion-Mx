// What waits for someone's decision, from every kind of record, by the
// approval ladder (rulebook 3.1): nobody decides their own; a manager's
// entries and requests go to a shareholder; staff entries to a manager or
// a shareholder. Each kind's own module applies the ladder; this gathers
// them for the notification system (server/modules/notifications.js).
//
// An item: {key: "<table>:<id>", area, text: {t, p}, link}.

import { effectivePermissions, roleById } from '../../shared/schema/permissions.js';
import { waitingChecks } from './attendance.js';
import { leaveWaiting } from './leave.js';
import { rotaWaiting } from './rota.js';
import { detailsWaiting } from './staff.js';
import { openingWaiting } from './stocktake.js';
import { tasksToCheck } from './tasks.js';

// The request context a job uses to see what a user would see.
export function ctxFor(db, user) {
  const permissions = new Set(effectivePermissions(user));
  return { db, user, level: roleById(user.role_id).level, can: (perm) => permissions.has(perm) };
}

const SOURCES = [
  // Money entries waiting for a shareholder.
  (ctx, name) => (ctx.can('acc.approve') ? ctx.db.all('Transactions').filter((e) => e.status === 'active' && e.approval === 'waiting' && e.entered_by !== ctx.user.id)
    .map((e) => ({ key: `Transactions:${e.id}`, area: 'accounts', text: { t: 'ntf.money_waiting', p: { name: name.user(e.entered_by), kind: { k: e.kind }, amount: { m: e.amount } } }, link: '/money?state=waiting' })) : []),
  (ctx, name) => (ctx.can('cafe.approve') ? ctx.db.all('Cafe_Orders').filter((o) => o.status === 'waiting' && o.entered_by !== ctx.user.id)
    .map((o) => ({ key: `Cafe_Orders:${o.id}`, area: 'cafe', text: { t: 'ntf.cafe_order', p: { name: name.user(o.entered_by), number: o.number } }, link: '/cafe/orders' })) : []),
  (ctx, name) => {
    if (!ctx.can('attendance.manage')) return [];
    const { punches, fixes } = waitingChecks(ctx);
    return [
      ...punches.map((p) => ({ key: `Punches:${p.id}`, area: 'hr', text: { t: 'ntf.punch_check', p: { name: name.staff(p.staff_id), date: { d: p.date } } }, link: '/attendance' })),
      ...fixes.map((f) => ({ key: `Attendance_Fixes:${f.id}`, area: 'hr', text: { t: 'ntf.fix_waiting', p: { name: name.staff(f.staff_id), date: { d: f.date } } }, link: '/attendance' })),
    ];
  },
  (ctx, name) => leaveWaiting(ctx).map((l) => ({ key: `Leaves:${l.id}`, area: 'hr', text: { t: 'ntf.leave_waiting', p: { name: name.staff(l.staff_id), from: { d: l.from }, to: { d: l.to } } }, link: '/leave' })),
  (ctx, name) => rotaWaiting(ctx).map((r) => ({ key: `Rota_Requests:${r.id}`, area: 'hr', text: { t: 'ntf.rota_waiting', p: { name: name.staff(r.staff_id), date: { d: r.date } } }, link: '/rota' })),
  (ctx, name) => detailsWaiting(ctx).map((c) => ({ key: `Detail_Changes:${c.id}`, area: 'hr', text: { t: 'ntf.details_waiting', p: { name: name.staff(c.staff_id) } }, link: '/staff/changes' })),
  (ctx, name) => tasksToCheck(ctx).map((t) => ({ key: `Tasks:${t.id}`, area: 'tasks', text: { t: 'ntf.task_check', p: { name: name.staff(t.staff_id), title: t.title } }, link: '/tasks' })),
  (ctx) => {
    const take = openingWaiting(ctx);
    return take ? [{ key: `Stock_Takes:${take.id}`, area: 'books', text: { t: 'ntf.opening_stock', p: {} }, link: '/books/stocktake' }] : [];
  },
];

export function approvalItems(ctx) {
  const { db } = ctx;
  const name = {
    user: (id) => (db.get('Users', id) || { display_name: '' }).display_name,
    staff: (id) => (db.get('Staff', id) || { name: '' }).name,
  };
  return SOURCES.flatMap((source) => source(ctx, name));
}

// Who decided a record that no longer waits, for "Done: approved by …".
const DECIDER = ['decided_by', 'approved_by', 'checked_by', 'applied_by', 'cancelled_by'];

export function decidedBy(db, key) {
  const [table, id] = key.split(':');
  const row = db.get(table, id);
  const by = row && DECIDER.map((c) => row[c]).find(Boolean);
  const user = by ? db.get('Users', by) : null;
  return user ? user.display_name : '';
}
