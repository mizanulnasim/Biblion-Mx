// The kinds of leave: Paid and Unpaid, there from the start, and the ones
// shareholders add (Leave_Types), each paid or not, from the earned balance
// or not, and allowing half days or not.

import { BUILT_IN_LEAVE } from '../../shared/hr/leave.js';

// Every kind, built-in first: [{id, name, name_bn, paid, from_balance, half_days, status, built_in}].
export function leaveTypes(db) {
  const builtIn = Object.values(BUILT_IN_LEAVE).map((t) => ({ ...t, name: '', name_bn: '', status: 'active', built_in: true }));
  const added = db.all('Leave_Types').map((t) => ({
    id: t.id, version: t.version, name: t.name, name_bn: t.name_bn, paid: t.paid, from_balance: t.from_balance, half_days: t.half_days, status: t.status, built_in: false,
  }));
  return [...builtIn, ...added];
}

export function leaveType(db, id) {
  return leaveTypes(db).find((t) => t.id === id) || null;
}
