// The offline queue's sending rules, against an in-memory queue and a fake server.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSync, newItem } from '../../client/src/offline/sync.js';

function memoryQueue(items = []) {
  const map = new Map(items.map((i) => [i.op_id, i]));
  return {
    map,
    all: async () => [...map.values()].map((i) => ({ ...i })),
    put: async (item) => { map.set(item.op_id, { ...item }); },
    remove: async (id) => { map.delete(id); },
  };
}

const item = (op_id, extra = {}) => ({ ...newItem({ op_id, owner: 'U1', action: 'x.save', payload: {}, label: op_id, now: Number(op_id.slice(-1)) }), ...extra });
const ok = (status, more = {}) => ({ ok: true, data: { status, ...more } });
const freeLock = (fn) => fn();

function setup(items, replies) {
  const queue = memoryQueue(items);
  const sent = [];
  let clock = 1000;
  const sync = createSync({
    queue,
    send: async (i) => {
      sent.push(i.op_id);
      return typeof replies === 'function' ? replies(i) : replies[i.op_id];
    },
    lock: freeLock,
    now: () => clock,
  });
  return { queue, sent, sync, tick: (ms) => { clock += ms; } };
}

test('S1: "needs input" keeps the item with its prompt; only "saved" removes', async () => {
  const prompt = { warnings: [{ code: 'dup.twin', params: {} }] };
  const { queue, sync } = setup([item('a1'), item('b2')], { a1: ok('needs_input', { prompt }), b2: ok('saved') });
  const report = await sync.run('U1');
  assert.deepEqual(report, { sent: 1, attention: 1 });
  assert.equal(queue.map.get('a1').status, 'needs_input');
  assert.deepEqual(queue.map.get('a1').prompt, prompt);
  assert.equal(queue.map.has('b2'), false);
});

test('a rejected entry is kept as failed with the reason', async () => {
  const error = { code: 'VALIDATION', params: {}, fields: { amount: { code: 'val.required' } } };
  const { queue, sync } = setup([item('a1')], { a1: ok('rejected', { error }) });
  await sync.run('U1');
  assert.equal(queue.map.get('a1').status, 'failed');
  assert.deepEqual(queue.map.get('a1').last_error, error);
});

test('S3: only the signed-in person\'s items are sent', async () => {
  const { queue, sent, sync } = setup([item('a1'), item('b2', { owner_user_id: 'U2' })], () => ok('saved'));
  await sync.run('U1');
  assert.deepEqual(sent, ['a1']);
  assert.equal(queue.map.has('b2'), true);
});

test('items go oldest first, one at a time', async () => {
  const { sent, sync } = setup([item('c3'), item('a1'), item('b2')], () => ok('saved'));
  await sync.run('U1');
  assert.deepEqual(sent, ['a1', 'b2', 'c3']);
});

test('S5: a network failure stops the run, counts a try and backs off', async () => {
  const net = { ok: false, error: { code: 'NETWORK', params: {} } };
  const { queue, sent, sync, tick } = setup([item('a1'), item('b2')], () => net);
  await sync.run('U1');
  assert.deepEqual(sent, ['a1']);
  const first = queue.map.get('a1');
  assert.equal(first.attempts, 1);
  assert.equal(first.status, 'pending');
  assert.equal(first.next_try_at, 1000 + 5000);
  // Not due yet: b2 goes first next time, a1 waits for its back-off.
  await sync.run('U1');
  assert.deepEqual(sent, ['a1', 'b2']);
  tick(5000);
  await sync.run('U1');
  assert.equal(queue.map.get('a1').attempts, 2);
  assert.equal(queue.map.get('a1').next_try_at, 6000 + 10000);
});

test('S5: after 8 failed tries the item is marked failed for the person', async () => {
  const { queue, sync, tick } = setup([item('a1')], () => ({ ok: false, error: { code: 'NETWORK', params: {} } }));
  for (let i = 0; i < 8; i++) {
    await sync.run('U1');
    tick(60 * 60000);
  }
  assert.equal(queue.map.get('a1').status, 'failed');
  assert.equal(queue.map.get('a1').attempts, 8);
});

test('S6: an item waits for the item it depends on', async () => {
  const replies = { a1: { ok: false, error: { code: 'BUSY', params: {} } }, b2: ok('saved'), c3: ok('saved') };
  const { sent, sync } = setup([item('a1'), item('b2', { depends_on: 'a1' }), item('c3')], replies);
  await sync.run('U1');
  assert.deepEqual(sent, ['a1', 'c3']);
});

test('S4: nothing is sent when another tab holds the lock', async () => {
  const queue = memoryQueue([item('a1')]);
  const sync = createSync({ queue, send: async () => ok('saved'), lock: async () => null, now: () => 0 });
  assert.equal(await sync.run('U1'), null);
  assert.equal(queue.map.has('a1'), true);
});

test('an item left "sending" by a closed tab is sent again with the same op_id', async () => {
  const { sent, sync } = setup([item('a1', { status: 'sending' })], () => ok('saved'));
  await sync.run('U1');
  assert.deepEqual(sent, ['a1']);
});

test('"permission denied" is not retried', async () => {
  const { queue, sync } = setup([item('a1')], () => ({ ok: false, error: { code: 'FORBIDDEN', params: {} } }));
  await sync.run('U1');
  assert.equal(queue.map.get('a1').status, 'failed');
  assert.equal(queue.map.get('a1').attempts, 0);
});
