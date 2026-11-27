// Sign-in, sign-out, password change and session lookup.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { BUSINESS_DEFAULTS } from '../../shared/schema/settings.js';
import { KDF_ITERATIONS, hashPassword, newSalt, newToken, sameHex, tokenHash } from '../kernel/crypto.js';
import { metaFor } from './meta.js';

const DAY_MS = 86400000;
const MINUTE_MS = 60000;

export function passwordFields(password) {
  const salt = newSalt();
  return { pass_hash: hashPassword(password, salt, KDF_ITERATIONS), kdf_salt: salt, kdf_iter: KDF_ITERATIONS };
}

function passwordMatches(user, password) {
  return sameHex(hashPassword(password, user.kdf_salt, user.kdf_iter), user.pass_hash);
}

// Returns the signed-in user for a token, or null.
export function resolveSession(db, token) {
  if (typeof token !== 'string' || token.length < 32) return null;
  const session = db.findOne('Sessions', 'token_hash', tokenHash(token));
  if (!session || session.revoked || session.expires_at <= db.nowIso) return null;
  const user = db.get('Users', session.user_id);
  if (!user || user.status !== 'active') return null;
  return { user, session };
}

function login(ctx, input) {
  const { db } = ctx;
  const user = db.findOne('Users', 'username', input.username);
  if (!user || user.status !== 'active') throw new AppError('AUTH_FAILED');
  db.setActor(user);
  if (user.locked_until && user.locked_until > db.nowIso) {
    const minutes = Math.ceil((Date.parse(user.locked_until) - db.now.getTime()) / MINUTE_MS);
    throw new AppError('LOCKED_OUT', { minutes });
  }
  if (!passwordMatches(user, input.password)) {
    const failed = (user.failed_attempts || 0) + 1;
    const lock = failed >= BUSINESS_DEFAULTS['auth.max_failed'];
    db.update('Users', user, {
      failed_attempts: lock ? 0 : failed,
      locked_until: lock ? new Date(db.now.getTime() + BUSINESS_DEFAULTS['auth.lock_minutes'] * MINUTE_MS).toISOString() : '',
    });
    throw new AppError('AUTH_FAILED');
  }
  const current = db.update('Users', user, { failed_attempts: 0, locked_until: '', last_login_at: db.nowIso });
  const token = newToken();
  db.insert('Sessions', {
    user_id: user.id,
    token_hash: tokenHash(token),
    expires_at: new Date(db.now.getTime() + BUSINESS_DEFAULTS['auth.session_days'] * DAY_MS).toISOString(),
    revoked: false,
  });
  return saved(user.id, { token, meta: metaFor(current, db) });
}

function logout(ctx) {
  ctx.db.update('Sessions', ctx.session, { revoked: true });
  return saved(ctx.session.id);
}

function changePassword(ctx, input) {
  if (!passwordMatches(ctx.user, input.current)) {
    throw new AppError('VALIDATION', {}, { current: { code: 'val.wrong_password', params: {} } });
  }
  ctx.db.update('Users', ctx.user, passwordFields(input.next));
  return saved(ctx.user.id);
}

export const AUTH_HANDLERS = {
  'auth.login': login,
  'auth.logout': logout,
  'auth.password': changePassword,
};
