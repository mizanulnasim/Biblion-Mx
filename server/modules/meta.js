// What the app needs to draw itself for the signed-in person, and their
// personal settings.

import { saved } from '../../shared/contract/reply.js';
import { CONTRACT } from '../../shared/contract/actions.js';
import { effectivePermissions, roleById } from '../../shared/schema/permissions.js';
import { PERSONAL_DEFAULTS } from '../../shared/schema/settings.js';
import { staffOfUser } from './staff.js';

// staff: the person's own staff record, if they have one (for punching).
export function metaFor(user, db) {
  const role = roleById(user.role_id);
  const staff = staffOfUser(db, user.id);
  return {
    contract: CONTRACT,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role_id: user.role_id,
      level: role ? role.level : 0,
    },
    staff: staff ? { id: staff.id, name: staff.name } : null,
    permissions: effectivePermissions(user),
    settings: { ...PERSONAL_DEFAULTS, ...(user.settings || {}) },
  };
}

function saveSettings(ctx, input) {
  const next = { ...(ctx.user.settings || {}) };
  for (const key of Object.keys(input)) if (input[key] !== null) next[key] = input[key];
  const user = ctx.db.update('Users', ctx.user, { settings: next });
  return saved(user.id, metaFor(user, ctx.db));
}

export const META_HANDLERS = {
  'meta.get': (ctx) => metaFor(ctx.user, ctx.db),
  'me.settings': saveSettings,
};
