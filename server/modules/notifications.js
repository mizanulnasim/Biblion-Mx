// The one notification system (rulebook 5.4). A notification has a part of
// the app, a priority, read or not, and a key that stops the same one twice.
//
// - Events tell the person they are about (tell): a request decided, an
//   entry cancelled, a task moved, a payslip issued. Nobody is told about
//   their own doing.
// - What waits for someone's approval is worked out from the records by the
//   approval ladder (server/modules/approvals.js), so a notification is made
//   when something starts waiting for them and closed ("Done") as soon as
//   anyone decides it. This runs when they look, and every hour for all.
// - Every hour, people with email on get one email of what is new.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { messageText, text } from '../kernel/i18n.js';
import { personalSettings } from '../kernel/settings.js';
import { sendMail } from '../platform.js';
import { approvalItems, ctxFor, decidedBy } from './approvals.js';
import { notify } from '../kernel/notify.js';

const KEEP_DAYS = 365;
const PAGE = 30;
const DAY_MS = 86400000;

// Makes a notification for each approval newly waiting for this person, and
// closes the ones nobody waits on any more.
function syncApprovals(ctx) {
  const { db } = ctx;
  const items = approvalItems(ctx);
  const keys = new Set(items.map((i) => `approve:${i.key}`));
  for (const n of db.all('Notifications')) {
    if (n.user_id === ctx.user.id && n.key.startsWith('approve:') && !n.done && !keys.has(n.key)) {
      const by = decidedBy(db, n.key.slice('approve:'.length));
      db.update('Notifications', n, { done: by ? { t: 'ntf.done_by', p: { name: by } } : { t: 'ntf.done', p: {} }, read_at: n.read_at || db.nowIso });
    }
  }
  for (const i of items) notify(db, ctx.user.id, { area: i.area, key: `approve:${i.key}`, text: i.text, link: i.link, priority: 'high' });
}

const view = (n) => ({ id: n.id, area: n.area, priority: n.priority, text: n.text, link: n.link, read: Boolean(n.read_at), done: n.done, at: n.created_at });

function visible(ctx) {
  const since = new Date(ctx.db.now.getTime() - KEEP_DAYS * DAY_MS).toISOString();
  return ctx.db.all('Notifications').filter((n) => n.user_id === ctx.user.id && !n.hidden && n.created_at >= since)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

// The unread ones, newest first, for Home and the bell.
export function unread(ctx) {
  syncApprovals(ctx);
  return visible(ctx).filter((n) => !n.read_at).map(view);
}

// History: newest first; by part of the app, unread only, or any word.
function list(ctx, input) {
  syncApprovals(ctx);
  const lang = personalSettings(ctx.db, ctx.user).lang;
  const words = (input.q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const items = visible(ctx).filter((n) => (!input.area || n.area === input.area) && (!input.unread || !n.read_at)
    && words.every((w) => messageText(lang, n.text).toLowerCase().includes(w)));
  const offset = input.offset || 0;
  return { items: items.slice(offset, offset + PAGE).map(view), more: items.length > offset + PAGE };
}

function count(ctx) {
  return { unread: unread(ctx).length };
}

const own = (ctx, id) => {
  const n = ctx.db.get('Notifications', id);
  if (!n || n.user_id !== ctx.user.id) throw new AppError('NOT_FOUND');
  return n;
};

// One read, or (no id) all of them.
function markRead(ctx, { id }) {
  const rows = id ? [own(ctx, id)] : ctx.db.all('Notifications').filter((n) => n.user_id === ctx.user.id && !n.read_at);
  for (const n of rows) if (!n.read_at) ctx.db.update('Notifications', n, { read_at: ctx.db.nowIso });
  return saved(id);
}

function dismiss(ctx, { id }) {
  const n = own(ctx, id);
  ctx.db.update('Notifications', n, { hidden: true, read_at: n.read_at || ctx.db.nowIso });
  return saved(n.id);
}

// The hourly job: approvals brought up to date for everyone, then one email
// to each person with email on, of what is new and still unread.
export function emailNotifications(db) {
  let sent = 0;
  for (const user of db.all('Users').filter((u) => u.status === 'active')) {
    const ctx = ctxFor(db, user);
    syncApprovals(ctx);
    const mine = personalSettings(db, user);
    if (!mine['notify.email_enabled'] || !mine['notify.email']) continue;
    const fresh = db.all('Notifications').filter((n) => n.user_id === user.id && !n.emailed_at && !n.read_at && !n.done && !n.hidden);
    if (!fresh.length) continue;
    const lines = fresh.map((n) => `• ${messageText(mine.lang, n.text)}`);
    sendMail(mine['notify.email'], text(mine.lang, 'ntf.mail_subject', { count: fresh.length }), `${lines.join('\n')}\n\n${text(mine.lang, 'ntf.mail_footer')}`);
    for (const n of fresh) db.update('Notifications', n, { emailed_at: db.nowIso });
    sent++;
  }
  return sent;
}

export const NOTIFICATION_HANDLERS = {
  'notify.list': list,
  'notify.count': count,
  'notify.read': markRead,
  'notify.dismiss': dismiss,
};
