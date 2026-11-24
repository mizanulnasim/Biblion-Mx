// The activity log, read-only.

import { page } from '../kernel/paging.js';

function list(ctx, query) {
  const result = page(
    ctx.db.all('Audit_Log'),
    query,
    (a) => `${a.created_at.slice(0, 10)} ${a.user_name} ${a.action} ${a.table_name} ${a.record_id} ${a.reason}`,
  );
  return {
    ...result,
    items: result.items.map((a) => ({
      id: a.id,
      at: a.created_at,
      user_name: a.user_name,
      action: a.action,
      table_name: a.table_name,
      record_id: a.record_id,
      before: a.before,
      after: a.after,
      reason: a.reason,
    })),
  };
}

export const AUDIT_HANDLERS = { 'audit.list': list };
