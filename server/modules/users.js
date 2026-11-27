// Users: list and save. Roles are the three system roles for now.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { roleById } from '../../shared/schema/permissions.js';
import { page } from '../kernel/paging.js';
import { passwordFields } from './auth.js';

function listItem(u) {
  return {
    id: u.id,
    display_name: u.display_name,
    username: u.username,
    role_id: u.role_id,
    status: u.status,
    // May change their own password (shareholders always may).
    own_password: roleById(u.role_id).level === 3 || (u.perm_grants || []).includes('me.password'),
    last_login_at: u.last_login_at,
    version: u.version,
  };
}

function list(ctx, query) {
  const result = page(ctx.db.all('Users'), query, (u) => `${u.display_name} ${u.username} ${u.status}`);
  return { ...result, items: result.items.map(listItem) };
}

function fieldError(field, code) {
  return new AppError('VALIDATION', {}, { [field]: { code, params: {} } });
}

function activeOwners(users) {
  return users.filter((u) => u.status === 'active' && roleById(u.role_id).level === 3);
}

function save(ctx, input) {
  const { db } = ctx;
  const users = db.all('Users');
  const clash = users.find((u) => u.username === input.username && u.id !== input.id);
  if (clash) throw fieldError('username', 'val.taken');

  const base = { display_name: input.display_name, username: input.username, role_id: input.role_id, status: input.status };
  // Passwords are set by shareholders; others change their own only when allowed.
  const grantsOf = (u) => {
    const others = ((u && u.perm_grants) || []).filter((g) => g !== 'me.password');
    return input.own_password && roleById(input.role_id).level < 3 ? [...others, 'me.password'] : others;
  };
  if (!input.id) {
    if (!input.password) throw fieldError('password', 'val.required');
    const row = db.insert('Users', {
      ...base, perm_grants: grantsOf(null), perm_denies: [], settings: {}, failed_attempts: 0, ...passwordFields(input.password),
    });
    return saved(row.id, listItem(row));
  }

  const current = users.find((u) => u.id === input.id);
  if (!current) throw new AppError('NOT_FOUND');
  if (!input.version) throw fieldError('version', 'val.required');
  if (current.id === ctx.user.id && (input.status !== 'active' || input.role_id !== current.role_id)) {
    throw fieldError(input.status !== 'active' ? 'status' : 'role_id', 'val.not_self');
  }
  const losesOwner = roleById(current.role_id).level === 3 && (input.status !== 'active' || roleById(input.role_id).level !== 3);
  if (losesOwner && activeOwners(users).length <= 1) throw fieldError('role_id', 'val.last_owner');

  const withGrants = { ...base, perm_grants: grantsOf(current) };
  const patch = input.password ? { ...withGrants, ...passwordFields(input.password), failed_attempts: 0, locked_until: '' } : withGrants;
  const row = db.update('Users', current, patch, input.version);
  return saved(row.id, listItem(row));
}

export const USER_HANDLERS = {
  'users.list': list,
  'users.save': save,
};
