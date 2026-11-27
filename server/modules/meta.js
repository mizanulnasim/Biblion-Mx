// What the app needs to draw itself for the signed-in person, and their
// personal settings.

import { saved } from '../../shared/contract/reply.js';
import { AppError } from '../../shared/contract/errors.js';
import { CONTRACT } from '../../shared/contract/actions.js';
import { effectivePermissions, roleById } from '../../shared/schema/permissions.js';
import { PERSONAL_DEFAULTS } from '../../shared/schema/settings.js';
import { setting } from '../kernel/settings.js';
import { staffOfUser } from './staff.js';

// The shop's details, for the letterhead.
export const SHOP_KEYS = Object.freeze({ name: 'shop.name', tagline: 'shop.tagline', address: 'shop.address', phone: 'shop.phone', email: 'shop.email' });

export function shopDetails(db) {
  const out = {};
  for (const [name, key] of Object.entries(SHOP_KEYS)) out[name] = setting(db, key);
  return out;
}

// staff: the person's own staff record, if they have one (for punching);
// shop: the shop's details, for the letterhead.
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
    shop: shopDetails(db),
  };
}

function saveSettings(ctx, input) {
  const next = { ...(ctx.user.settings || {}) };
  for (const key of Object.keys(input)) if (input[key] !== null) next[key] = input[key];
  const user = ctx.db.update('Users', ctx.user, { settings: next });
  return saved(user.id, metaFor(user, ctx.db));
}

// Only shareholders get the daily warnings email.
function saveNotify(ctx, { email, daily }) {
  if (ctx.level < 3) throw new AppError('FORBIDDEN');
  const user = ctx.db.update('Users', ctx.user, { settings: { ...(ctx.user.settings || {}), notify_email: email || '', notify_daily: daily } });
  return saved(user.id, metaFor(user, ctx.db));
}

export const META_HANDLERS = {
  'meta.get': (ctx) => metaFor(ctx.user, ctx.db),
  'me.settings': saveSettings,
  'me.notify': saveNotify,
};
