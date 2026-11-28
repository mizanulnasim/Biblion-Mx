// The one entry point for every API call.
// Request: {action, payload, token, op_id, contract, client_now}
// Reply:   {ok: true, data} or {ok: false, error: {code, params, fields}}
// A write's `data` is always {status: saved | needs_input | rejected, ...}.

import { ACTIONS, CONTRACT } from '../../shared/contract/actions.js';
import { AppError } from '../../shared/contract/errors.js';
import { SAVED, rejected } from '../../shared/contract/reply.js';
import { validate } from '../../shared/lib/validate.js';
import { effectivePermissions, roleById } from '../../shared/schema/permissions.js';
import { isInitialized, openDb } from '../store/db.js';
import { withLock } from '../platform.js';
import { bumpArea } from './areas.js';
import { resolveSession } from '../modules/auth.js';
import { HANDLERS } from '../modules/index.js';

const fail = (code, params = {}, fields = null) => ({ ok: false, error: { code, params, fields } });

const SETUP_ACTIONS = new Set(['ping', 'setup.status', 'setup.owner']);

function runWrite(def, req, ctx, handler, input) {
  const { db } = ctx;
  // Before first-owner setup there is no database, so nothing can be stored yet.
  if (def.replay !== false && isInitialized()) {
    const done = db.findOne('Ops', 'op_id', req.op_id);
    if (done) return done.reply;
  }
  let reply;
  // Nothing is half-saved: a write that fails part-way is undone.
  db.begin();
  try {
    reply = handler(ctx, input);
  } catch (err) {
    db.rollback();
    if (!(err instanceof AppError)) throw err;
    return rejected(err.code, err.params, err.fields);
  }
  if (reply.status === SAVED) {
    if (def.replay !== false) {
      db.insert('Ops', { op_id: req.op_id, user_id: ctx.user ? ctx.user.id : '', action: req.action, record_id: reply.record_id || '', reply });
    }
    if (def.area) bumpArea(def.area);
  }
  // Written while the lock is still held.
  db.flush();
  return reply;
}

function dispatch(req) {
  if (req.contract !== CONTRACT) return fail('UPDATE_APP', { server: CONTRACT });
  const def = ACTIONS[req.action];
  const handler = HANDLERS[req.action];
  if (!def || !handler) return fail('BAD_REQUEST');
  if (def.write && (typeof req.op_id !== 'string' || req.op_id.length < 8)) return fail('BAD_REQUEST');
  if (!SETUP_ACTIONS.has(req.action) && !isInitialized()) return fail('NOT_INITIALIZED');

  const db = openDb(new Date(), { cache: true });
  db.setContext({ action: req.action, op_id: req.op_id || '' });
  // What the phone's clock showed when it sent the request (to correct punch times).
  const clientNow = typeof req.client_now === 'string' && !Number.isNaN(Date.parse(req.client_now)) ? req.client_now : null;
  const ctx = { db, user: null, session: null, level: 0, can: () => false, clientNow };

  if (!def.public) {
    const found = resolveSession(db, req.token);
    if (!found) return fail('AUTH_REQUIRED');
    const permissions = new Set(effectivePermissions(found.user));
    ctx.user = found.user;
    ctx.session = found.session;
    ctx.level = roleById(found.user.role_id).level;
    ctx.can = (perm) => permissions.has(perm);
    db.setActor(found.user);
    if (def.perm && !ctx.can(def.perm)) return fail('FORBIDDEN');
  }

  const { value, fields } = validate(def.schema || {}, req.payload);
  if (fields) return def.write ? { ok: true, data: rejected('VALIDATION', {}, fields) } : fail('VALIDATION', {}, fields);

  if (!def.write) {
    const data = handler(ctx, value);
    db.flush();
    return { ok: true, data };
  }
  const locked = withLock(() => runWrite(def, req, ctx, handler, value));
  if (!locked) return fail('BUSY');
  return { ok: true, data: locked.value };
}

export function handle(body) {
  let req;
  try {
    req = JSON.parse(body);
  } catch (err) {
    return fail('BAD_REQUEST');
  }
  if (!req || typeof req !== 'object' || typeof req.action !== 'string') return fail('BAD_REQUEST');
  try {
    return dispatch(req);
  } catch (err) {
    if (err instanceof AppError) return fail(err.code, err.params, err.fields);
    // Unexpected failures are written to the Apps Script execution log for the
    // owner; the person sees a general error.
    console.error(err && err.stack ? err.stack : String(err));
    return fail('SERVER');
  }
}
