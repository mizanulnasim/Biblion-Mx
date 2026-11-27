// Every action's handler, by action name. The router refuses an action that
// is in the contract but has no handler here, and the hygiene check refuses
// a handler that is not in the contract.

import { areaVersions } from '../kernel/areas.js';
import { AUDIT_HANDLERS } from './audit.js';
import { ATTENDANCE_HANDLERS } from './attendance.js';
import { AUTH_HANDLERS } from './auth.js';
import { BOOK_HANDLERS } from './books.js';
import { CAFE_HANDLERS } from './cafe.js';
import { CAFE_ORDER_HANDLERS } from './cafe-orders.js';
import { CLOSING_HANDLERS } from './closing.js';
import { INTAKE_HANDLERS } from './intake.js';
import { META_HANDLERS } from './meta.js';
import { MONEY_HANDLERS } from './money.js';
import { SETTINGS_HANDLERS } from './settings.js';
import { SETUP_MONEY_HANDLERS } from './setup-money.js';
import { REQUISITION_HANDLERS } from './requisitions.js';
import { SHIFT_HANDLERS } from './shift.js';
import { SPECIAL_ORDER_HANDLERS } from './special-orders.js';
import { STOCKTAKE_HANDLERS } from './stocktake.js';
import { SUPPLIER_HANDLERS } from './suppliers.js';
import { SETUP_HANDLERS } from './setup.js';
import { STAFF_HANDLERS } from './staff.js';
import { ROTA_HANDLERS } from './rota.js';
import { LEAVE_HANDLERS } from './leave.js';
import { PAYROLL_HANDLERS } from './payroll.js';
import { TASK_HANDLERS } from './tasks.js';
import { SEPARATION_HANDLERS } from './separation.js';
import { DOC_HANDLERS } from './docs.js';
import { PERFORMANCE_HANDLERS } from './performance.js';
import { WAITING_HANDLERS } from './waiting.js';
import { RECRUITMENT_HANDLERS } from './recruitment.js';
import { USER_HANDLERS } from './users.js';
import { MONTH_HANDLERS } from './month.js';
import { START_HANDLERS } from './start.js';

export const HANDLERS = Object.freeze({
  ...SETUP_HANDLERS,
  ...AUTH_HANDLERS,
  ...META_HANDLERS,
  ...USER_HANDLERS,
  ...MONTH_HANDLERS,
  ...START_HANDLERS,
  ...AUDIT_HANDLERS,
  ...SETTINGS_HANDLERS,
  ...SETUP_MONEY_HANDLERS,
  ...MONEY_HANDLERS,
  ...SHIFT_HANDLERS,
  ...CLOSING_HANDLERS,
  ...SUPPLIER_HANDLERS,
  ...BOOK_HANDLERS,
  ...REQUISITION_HANDLERS,
  ...SPECIAL_ORDER_HANDLERS,
  ...STOCKTAKE_HANDLERS,
  ...INTAKE_HANDLERS,
  ...CAFE_HANDLERS,
  ...CAFE_ORDER_HANDLERS,
  ...STAFF_HANDLERS,
  ...ATTENDANCE_HANDLERS,
  ...ROTA_HANDLERS,
  ...LEAVE_HANDLERS,
  ...PAYROLL_HANDLERS,
  ...TASK_HANDLERS,
  ...SEPARATION_HANDLERS,
  ...DOC_HANDLERS,
  ...PERFORMANCE_HANDLERS,
  ...WAITING_HANDLERS,
  ...RECRUITMENT_HANDLERS,
  'sync.version': () => ({ areas: areaVersions() }),
});
