// Permissions are added here only when a feature that checks them is built.
// Roles carry a level: owner/shareholder 3, manager 2, staff 1.
// A user can be granted extra permissions or have some taken away.

//   acc.entry         use the money screen (enter money and see own entries)
//   acc.expense …     enter that kind directly; without it, a manager may
//                     send the kind as a request for a shareholder
//   acc.daily         enter the daily shift
//   closing.day       close a day (reopening one is for shareholders: acc.approve)
//   acc.vendor.purchase / acc.vendor.pay / acc.publisher.pay   vendor and publisher kinds
//   books.view        see the book catalogue and stock
//   books.catalog     add and edit titles
//   books.receive     record deliveries
//   books.sell        type book sales
//   books.adjust      stock changes with a reason
//   books.requisition draft, send and close requisitions to publishers
//   books.order       take a customer's special order (staff too)
//   books.orders      see and follow up special orders (customer names and phones)
//   intake.upload     upload documents and confirm what they make
//   cafe.view         see café items, stock and orders
//   cafe.count        the daily café count and waste (staff too)
//   cafe.order        make café orders; cafe.approve approves them
//   cafe.receive      enter what an order brought (bills, expiry dates)
//   cafe.setup        café items and their ordering rules
//   setup.books       vendors and publishers and their terms
//   acc.view_all      see every money entry and the account balances
//   acc.approve       approve entries waiting for a shareholder
//   acc.setup         money accounts, categories, due contacts, shareholders
//   settings.manage   business settings (approvals)
//   staff.view        see staff records (without the private parts below)
//   staff.edit        add and edit staff records, set their punch PIN
//   staff.identity    see and edit NID, date of birth and address
//   staff.emergency   see and edit emergency contacts
//   staff.family      see and edit family details
//   salary.view       see salaries; salary.edit changes them
//   attendance.view   everyone's attendance
//   attendance.manage check punches, decide corrections, add missing punches,
//                     and set up shop punch devices
//   schedule.view     everyone's rota
//   schedule.manage   set the rota and shifts; decide shift choices, swaps
//                     and day-off moves; public holidays
//   leave.approve     decide leave and record leave for someone
//   leave.adjust      change someone's leave balance, with a reason
//   payroll.view      everyone's payslips and pay accounts
//   payroll.manage    issue and cancel payslips, set starting pay balances
//   tasks.create      give someone a one-off task
//   tasks.manage      repeating tasks; move or cancel anyone's task
//   tasks.view_all    see everyone's tasks
//   tasks.verify      check tasks that need a check
//   separation.manage record and accept someone leaving, hand over their
//                     tasks, complete it; issue experience and release letters
//   acc.staffpay      staff pay kinds on the money screen (salary, food
//                     allowance, bonus, advance, deduction)
// Everyone works with their own punches, corrections, rota requests, leave,
// payslips and tasks without a permission.
const PERMISSIONS = Object.freeze([
  'users.manage', 'audit.view', 'settings.manage',
  'acc.entry', 'acc.expense', 'acc.income', 'acc.dues', 'acc.loans', 'acc.transfer', 'acc.shareholders',
  'acc.daily', 'closing.day', 'acc.view_all', 'acc.approve', 'acc.setup',
  'acc.vendor.purchase', 'acc.vendor.pay', 'acc.publisher.pay',
  'books.view', 'books.catalog', 'books.receive', 'books.sell', 'books.adjust', 'setup.books',
  'books.requisition', 'books.order', 'books.orders', 'settings.books', 'intake.upload',
  'cafe.view', 'cafe.count', 'cafe.order', 'cafe.approve', 'cafe.receive', 'cafe.setup',
  'staff.view', 'staff.edit', 'staff.identity', 'staff.emergency', 'staff.family', 'salary.view', 'salary.edit',
  'attendance.view', 'attendance.manage', 'schedule.view', 'schedule.manage', 'leave.approve', 'leave.adjust',
  'payroll.view', 'payroll.manage', 'acc.staffpay',
  'tasks.create', 'tasks.manage', 'tasks.view_all', 'tasks.verify', 'separation.manage',
]);

// Staff never enter money, so the Staff role has no money permission.
export const ROLES = Object.freeze([
  { id: 'ROL-OWNER', key: 'owner', name: 'role.owner', level: 3, permissions: PERMISSIONS },
  { id: 'ROL-MANAGER', key: 'manager', name: 'role.manager', level: 2, permissions: [
    'acc.entry', 'acc.expense', 'acc.transfer', 'acc.dues', 'acc.daily', 'closing.day', 'acc.vendor.purchase',
    'books.view', 'books.catalog', 'books.receive', 'books.sell', 'books.adjust',
    'books.requisition', 'books.order', 'books.orders', 'intake.upload',
    'cafe.view', 'cafe.count', 'cafe.order', 'cafe.approve', 'cafe.receive',
    'staff.view', 'staff.edit', 'staff.emergency', 'attendance.view', 'attendance.manage',
    'schedule.view', 'schedule.manage', 'leave.approve',
    'tasks.create', 'tasks.manage', 'tasks.view_all', 'tasks.verify', 'separation.manage',
  ] },
  { id: 'ROL-STAFF', key: 'staff', name: 'role.staff', level: 1, permissions: ['books.order', 'books.view', 'cafe.count'] },
]);

export function roleById(id) {
  return ROLES.find((r) => r.id === id) || null;
}

export function effectivePermissions(user) {
  const role = roleById(user.role_id);
  const set = new Set(role ? role.permissions : []);
  for (const p of user.perm_grants || []) if (PERMISSIONS.includes(p)) set.add(p);
  for (const p of user.perm_denies || []) set.delete(p);
  return [...set].sort();
}
