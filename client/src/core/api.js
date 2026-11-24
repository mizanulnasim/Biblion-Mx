// The only way pages reach the server.
//   read(action, payload)   → {data, cachedAt}; cachedAt is set when the
//                             reply came from the phone's copy
//   write(action, payload)  → {status: saved | needs_input | rejected | queued}
// Errors that are not about the entry (sign-in needed, no permission, app
// out of date, no connection) are thrown as ApiError.

import { ACTIONS, CONTRACT } from '../../../shared/contract/actions.js';
import { idbStore } from '../offline/idb.js';
import { createSync, newItem } from '../offline/sync.js';
import { device, getState, setState } from './state.js';

export class ApiError extends Error {
  constructor(code, params = {}, fields = null) {
    super(code);
    this.code = code;
    this.params = params;
    this.fields = fields;
  }
}

const RETRY_DELAYS = [600, 1200];
const TIMEOUT_MS = 20000;

const cache = idbStore('cache');
const queue = idbStore('queue');
const handlers = { authLost: () => {}, updateNeeded: () => {}, areaChanged: () => {} };

export function onApiEvent(name, fn) {
  handlers[name] = fn;
}

function newOpId() {
  return crypto.randomUUID();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// One POST. Resolves to the reply envelope; a failed connection resolves to
// {ok:false, error:{code:'NETWORK'}} so callers handle every outcome alike.
async function post(action, payload, opId) {
  const url = (window.BIBLION_CONFIG || {}).API_URL;
  const body = JSON.stringify({ action, payload, token: device.get('token'), op_id: opId, contract: CONTRACT });
  for (let attempt = 0; ; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(String(res.status));
      const reply = await res.json();
      if (!getState().online) setState({ online: true });
      if (!reply.ok && reply.error.code === 'AUTH_REQUIRED') handlers.authLost();
      if (!reply.ok && reply.error.code === 'UPDATE_APP') handlers.updateNeeded();
      return reply;
    } catch (err) {
      if (attempt >= RETRY_DELAYS.length) {
        setState({ online: false });
        return { ok: false, error: { code: 'NETWORK', params: {} } };
      }
      await wait(RETRY_DELAYS[attempt]);
    }
  }
}

function userId() {
  const meta = getState().meta;
  return meta ? meta.user.id : '';
}

function cacheKey(action, payload) {
  return `${userId()}|${action}|${JSON.stringify(payload)}`;
}

export async function read(action, payload = {}) {
  const def = ACTIONS[action];
  const reply = await post(action, payload);
  if (reply.ok) {
    if (def.cache) await cache.put({ key: cacheKey(action, payload), user_id: userId(), data: reply.data, saved_at: Date.now() });
    return { data: reply.data, cachedAt: null };
  }
  if (reply.error.code === 'NETWORK' && def.cache) {
    const copy = await cache.get(cacheKey(action, payload));
    if (copy) return { data: copy.data, cachedAt: copy.saved_at };
  }
  throw new ApiError(reply.error.code, reply.error.params, reply.error.fields);
}

// `label` names the entry on "Saved on this phone".
export async function write(action, payload = {}, { opId = newOpId(), label = '' } = {}) {
  const def = ACTIONS[action];
  const reply = await post(action, payload, opId);
  if (reply.ok) {
    if (reply.data.status === 'saved' && def.area) handlers.areaChanged(def.area);
    return reply.data;
  }
  if (reply.error.code === 'NETWORK' && def.offline && userId()) {
    await queue.put(newItem({ op_id: opId, owner: userId(), action, payload, label, now: Date.now() }));
    await refreshQueueCount();
    return { status: 'queued', op_id: opId };
  }
  throw new ApiError(reply.error.code, reply.error.params, reply.error.fields);
}

// ---- Saved on this phone -------------------------------------------------

export async function queueItems() {
  const owner = userId();
  return (await queue.all()).filter((i) => i.owner_user_id === owner).sort((a, b) => a.created_at - b.created_at);
}

export async function refreshQueueCount() {
  const items = await queueItems();
  setState({
    queued: items.length,
    attention: items.filter((i) => i.status === 'needs_input' || i.status === 'failed').length,
  });
}

function withSyncLock(fn) {
  if (!navigator.locks) return fn();
  return navigator.locks.request('bm.sync', { ifAvailable: true }, (lock) => (lock ? fn() : null));
}

const sync = createSync({
  queue,
  send: (item) => post(item.action, item.payload, item.op_id),
  lock: withSyncLock,
  now: () => Date.now(),
});

export async function sendQueue() {
  const owner = userId();
  if (!owner) return null;
  const report = await sync.run(owner);
  await refreshQueueCount();
  return report;
}

// Puts an item back in line now; `payload` replaces the old one when the
// person answered a prompt or edited the entry.
export async function retryItem(opId, payload) {
  const item = await queue.get(opId);
  if (!item) return;
  await queue.put({ ...item, payload: payload || item.payload, status: 'pending', next_try_at: 0, attempts: 0, prompt: null });
  await sendQueue();
}

export async function removeItem(opId) {
  await queue.remove(opId);
  await refreshQueueCount();
}

// Sign-out: copies of business data are deleted from this phone. Unsent
// items stay, belong to this person, and go when they sign in again.
export async function clearUserData() {
  const id = userId();
  for (const entry of await cache.all()) if (entry.user_id === id) await cache.remove(entry.key);
  device.remove('token');
  device.remove('meta');
}
