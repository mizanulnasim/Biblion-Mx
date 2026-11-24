// Permissions are added here only when a feature that checks them is built.
// Roles carry a level: owner/shareholder 3, manager 2, staff 1.
// A user can be granted extra permissions or have some taken away.

const PERMISSIONS = Object.freeze(['users.manage', 'audit.view']);

export const ROLES = Object.freeze([
  { id: 'ROL-OWNER', key: 'owner', name: 'role.owner', level: 3, permissions: PERMISSIONS },
  { id: 'ROL-MANAGER', key: 'manager', name: 'role.manager', level: 2, permissions: [] },
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
