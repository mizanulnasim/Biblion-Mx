// What waits for the signed-in person, for Home: attendance checks, rota
// requests (to agree to or decide), leave to decide, tasks to check, their
// reviews, announcements and procedures to read, salaries overdue, and
// changes to people's own contact details; for shareholders, Getting
// started steps left, the opening stock to approve and profit shares
// overdue; publisher payments overdue.

import { waitingChecks } from './attendance.js';
import { docsWaiting } from './docs.js';
import { leaveWaiting } from './leave.js';
import { reviewsWaiting } from './performance.js';
import { rotaWaiting } from './rota.js';
import { tasksToCheck } from './tasks.js';
import { salaryOverdue } from './payroll.js';
import { detailsWaiting } from './staff.js';
import { startLeft } from './start.js';
import { openingWaiting } from './stocktake.js';
import { profitOverdue } from './month.js';
import { publishersOverdue } from './suppliers.js';

function waiting(ctx) {
  const checks = ctx.can('attendance.manage') ? waitingChecks(ctx) : null;
  return {
    checks: checks ? checks.punches.length + checks.fixes.length : 0,
    rota: rotaWaiting(ctx),
    leave: leaveWaiting(ctx),
    tasks: tasksToCheck(ctx),
    reviews: reviewsWaiting(ctx),
    docs: docsWaiting(ctx),
    salary: salaryOverdue(ctx),
    details: detailsWaiting(ctx).length,
    start: startLeft(ctx),
    opening_stock: openingWaiting(ctx),
    profit_overdue: profitOverdue(ctx),
    publishers: publishersOverdue(ctx),
  };
}

export const WAITING_HANDLERS = {
  'people.waiting': waiting,
};
