// What waits for the signed-in person, for Home: attendance checks, rota
// requests (to agree to or decide), leave to decide, tasks to check, their
// reviews, announcements and procedures to read, and salaries overdue.

import { waitingChecks } from './attendance.js';
import { docsWaiting } from './docs.js';
import { leaveWaiting } from './leave.js';
import { reviewsWaiting } from './performance.js';
import { rotaWaiting } from './rota.js';
import { tasksToCheck } from './tasks.js';
import { salaryOverdue } from './payroll.js';

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
  };
}

export const WAITING_HANDLERS = {
  'people.waiting': waiting,
};
