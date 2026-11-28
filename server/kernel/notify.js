// Making a notification (server/modules/notifications.js has the rest).
// Kept apart so any module can tell someone without importing the
// modules that work out approvals.

export function notify(db, userId, { area, key = '', text: message, link = '', priority = 'normal' }) {
  if (key && db.all('Notifications').some((n) => n.user_id === userId && n.key === key && !n.done)) return;
  db.insert('Notifications', { user_id: userId, area, priority, key, text: message, link, read_at: '', done: null, hidden: false, emailed_at: '' });
}

// An event for one person, in a part of the app.
export function tell(ctx, userId, area, id, params = {}, link = '') {
  if (!userId || userId === ctx.user.id || !ctx.db.get('Users', userId)) return;
  notify(ctx.db, userId, { area, text: { t: id, p: params }, link });
}
