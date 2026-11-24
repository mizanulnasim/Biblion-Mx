// What the app needs to draw itself for the signed-in person, and their
// personal settings.

import { saved } from '../../shared/contract/reply.js';
import { CONTRACT } from '../../shared/contract/actions.js';
import { effectivePermissions, roleById } from '../../shared/schema/permissions.js';
import { PERSONAL_DEFAULTS } from '../../shared/schema/settings.js';

export function metaFor(user) {
  const role = roleById(user.role_id);
  return {
    contract: CONTRACT,
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role_id: user.role_id,
      level: role ? role.level : 0,
    },
    permissions: effectivePermissions(user),
    settings: { ...PERSONAL_DEFAULTS, ...(user.settings || {}) },
  };
}

function saveSettings(ctx, input) {
  const next = { ...(ctx.user.settings || {}) };
  for (const key of Object.keys(input)) if (input[key] !== null) next[key] = input[key];
  const user = ctx.db.update('Users', ctx.user, { settings: next });
  return saved(user.id, metaFor(user));
}

export const META_HANDLERS = {
  'meta.get': (ctx) => metaFor(ctx.user),
  'me.settings': saveSettings,
};
