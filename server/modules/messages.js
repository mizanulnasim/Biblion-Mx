// Messages on a person's Home that stay until they dismiss them (owner
// decision): a task moved, a request decided, an entry or task sent back,
// a payslip issued or salary paid, a detail change decided. A message is a
// message id with params; a param is a value, {d: date} or {m: amount}.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';

// Leaves a message for a user (nobody is told about their own doing).
export function tell(ctx, userId, id, params = {}, link = '') {
  if (!userId || userId === ctx.user.id || !ctx.db.get('Users', userId)) return;
  ctx.db.insert('Messages', { user_id: userId, text: { t: id, p: params }, link, seen_at: '' });
}

// The person's messages not yet dismissed, newest first.
export function myMessages(ctx) {
  return ctx.db.all('Messages').filter((m) => m.user_id === ctx.user.id && !m.seen_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((m) => ({ id: m.id, text: m.text, link: m.link, at: m.created_at }));
}

function dismiss(ctx, { id }) {
  const m = ctx.db.get('Messages', id);
  if (!m || m.user_id !== ctx.user.id) throw new AppError('NOT_FOUND');
  if (!m.seen_at) ctx.db.update('Messages', m, { seen_at: ctx.db.nowIso });
  return saved(m.id);
}

export const MESSAGE_HANDLERS = {
  'messages.dismiss': dismiss,
};
