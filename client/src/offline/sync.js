// Sending entries saved on this phone (the offline queue).
// Designed against v1's sync bugs:
//   S1  every reply has an explicit status; only `saved` removes an item.
//       `needs_input` keeps it and shows the same prompt as online.
//   S3  items belong to the person who made them and go only when that
//       person is signed in.
//   S4  one tab at a time (Web Locks).
//   S5  network failures back off exponentially and are counted; after
//       MAX_TRIES the item is marked failed for the person to look at.
//   S6  an item can depend on another (depends_on) and waits for it.
//   S2  the op_id travels with the item and is stored with the record on
//       the server for good, so sending twice never saves twice.

import { NEEDS_INPUT, REJECTED, SAVED } from '../../../shared/contract/reply.js';

const MAX_TRIES = 8;
const BASE_DELAY_MS = 5000;
const MAX_DELAY_MS = 30 * 60000;

// Answers that mean "try again later" rather than "this item is wrong".
const RETRY_LATER = new Set(['NETWORK', 'BUSY', 'SERVER', 'AUTH_REQUIRED', 'UPDATE_APP']);
// Answers after which nothing else can be sent now.
const STOP_ALL = new Set(['NETWORK', 'AUTH_REQUIRED', 'UPDATE_APP']);

export function newItem({ op_id, owner, action, payload, label, depends_on = null, now }) {
  return {
    op_id,
    owner_user_id: owner,
    created_at: now,
    action,
    payload,
    label,
    depends_on,
    attempts: 0,
    next_try_at: 0,
    status: 'pending',
    last_error: null,
    prompt: null,
  };
}

function delayFor(attempts) {
  return Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS);
}

// queue: {all, put, remove}; send(item) resolves to the API envelope
// {ok, data} or {ok:false, error}; a network failure resolves to
// {ok:false, error:{code:'NETWORK'}}. lock(fn) runs fn unless another tab
// already holds the lock (then resolves null).
export function createSync({ queue, send, lock, now }) {
  async function step(owner) {
    const items = await queue.all();
    const waiting = new Set(items.map((i) => i.op_id));
    const next = items
      .filter((i) => i.owner_user_id === owner && i.status === 'pending' && i.next_try_at <= now())
      .sort((a, b) => a.created_at - b.created_at)
      .find((i) => !i.depends_on || !waiting.has(i.depends_on));
    if (!next) return null;

    await queue.put({ ...next, status: 'sending' });
    const res = await send(next);
    if (res.ok && res.data.status === SAVED) {
      await queue.remove(next.op_id);
      return 'sent';
    }
    if (res.ok && res.data.status === NEEDS_INPUT) {
      await queue.put({ ...next, status: 'needs_input', prompt: res.data.prompt });
      return 'attention';
    }
    if (res.ok && res.data.status === REJECTED) {
      await queue.put({ ...next, status: 'failed', last_error: res.data.error });
      return 'attention';
    }
    const error = res.ok ? { code: 'SERVER', params: {} } : res.error;
    if (RETRY_LATER.has(error.code)) {
      const attempts = next.attempts + 1;
      const failed = attempts >= MAX_TRIES;
      await queue.put({
        ...next,
        attempts,
        next_try_at: now() + delayFor(attempts),
        status: failed ? 'failed' : 'pending',
        last_error: error,
      });
      if (failed) return 'attention';
      return STOP_ALL.has(error.code) ? 'stop' : 'retry';
    }
    await queue.put({ ...next, status: 'failed', last_error: error });
    return 'attention';
  }

  // Sends this person's items, oldest first, one at a time.
  // Resolves to {sent, attention}, or null when another tab is sending.
  async function run(owner) {
    return lock(async () => {
      const report = { sent: 0, attention: 0 };
      // An item left "sending" by a closed tab is sent again with the same op_id.
      for (const item of await queue.all()) {
        if (item.status === 'sending') await queue.put({ ...item, status: 'pending' });
      }
      for (;;) {
        const outcome = await step(owner);
        if (outcome === 'sent') report.sent++;
        else if (outcome === 'attention') report.attention++;
        else if (outcome !== 'retry') break;
      }
      return report;
    });
  }

  return { run };
}
