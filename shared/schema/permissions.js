// Permissions are added here only when a feature that checks them is built.
// Roles carry a level: owner/shareholder 3, manager 2, staff 1.
// A user can be granted extra permissions or have some taken away.

//   acc.entry         use the money screen (enter money and see own entries)
//   acc.expense …     enter that kind directly; without it, a manager may
//                     send the kind as a request for a shareholder
//   acc.view_all      see every money entry and the account balances
//   acc.approve       approve entries waiting for a shareholder
//   acc.setup         money accounts, categories, due contacts, shareholders
//   settings.manage   business settings (approvals)
const PERMISSIONS = Object.freeze([
  'users.manage', 'audit.view', 'settings.manage',
  'acc.entry', 'acc.expense', 'acc.income', 'acc.dues', 'acc.loans', 'acc.transfer', 'acc.shareholders',
  'acc.view_all', 'acc.approve', 'acc.setup',
]);

// Staff never enter money, so the Staff role has no money permission.
export const ROLES = Object.freeze([
  { id: 'ROL-OWNER', key: 'owner', name: 'role.owner', level: 3, permissions: PERMISSIONS },
  { id: 'ROL-MANAGER', key: 'manager', name: 'role.manager', level: 2, permissions: ['acc.entry', 'acc.expense', 'acc.transfer', 'acc.dues'] },
  { id: 'ROL-STAFF', key: 'staff', name: 'role.staff', level: 1, permissions: [] },
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
