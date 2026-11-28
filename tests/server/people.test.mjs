// Announcements, procedures and performance reviews on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function team() {
  const s = shop();
  const users = s.call(s.owner, 'users.list', {}).data.items;
  const userId = (name) => users.find((u) => u.username === name).id;
  const add = (fields) => s.call(s.owner, 'staff.save', { status: 'active', joined_on: plus(today(), -60), days_off: [], ...fields }).data.record_id;
  s.ids.sumi = add({ name: 'Sumi', user_id: userId('staff') });
  s.ids.rafi = add({ name: 'Rafi', user_id: userId('manager') });
  return s;
}

const doc = (s, who, fields) => s.call(who, 'docs.save', { audience: 'everyone', status: 'active', staff_ids: [], ...fields }).data;

test('announcements reach their audience; reading and acknowledging are counted', () => {
  const s = team();
  const id = doc(s, s.manager, { kind: 'announcement', title: 'Eid hours', body: 'Open 2pm to 10pm on Eid.', needs_ack: true, show_until: plus(today(), 3) }).record_id;
  doc(s, s.manager, { kind: 'announcement', title: 'Managers meet Sunday', body: 'At 9am.', audience: 'managers' });
  assert.deepEqual(s.call(s.staff, 'docs.mine').data.announcements.map((d) => d.title), ['Eid hours']);
  assert.equal(s.call(s.manager, 'docs.mine').data.announcements.length, 2);
  const waiting = s.call(s.staff, 'people.waiting').data.docs;
  assert.deepEqual([waiting.unread, waiting.to_ack, waiting.pinned.length], [1, 1, 1]);
  s.call(s.staff, 'docs.mark', { id, ack: false });
  assert.equal(s.call(s.staff, 'people.waiting').data.docs.unread, 0);
  s.call(s.staff, 'docs.mark', { id, ack: true });
  assert.equal(s.call(s.staff, 'people.waiting').data.docs.to_ack, 0);
  const people = s.call(s.manager, 'docs.manage', { kind: 'announcement' }).data.items.find((d) => d.id === id).people;
  assert.deepEqual(people.filter((p) => p.acked).map((p) => p.name), ['Staff']);
  assert.equal(s.call(s.staff, 'docs.save', { kind: 'announcement', title: 'x', body: 'x', audience: 'everyone', status: 'active', staff_ids: [] }).data.error.code, 'FORBIDDEN');
});

test('a procedure changed in words is acknowledged again; one for chosen people reaches only them', () => {
  const s = team();
  const saved = doc(s, s.manager, { kind: 'sop', title: 'Opening the shop', body: 'Unlock, lights, till float.' });
  s.call(s.staff, 'docs.mark', { id: saved.record_id, ack: true });
  assert.equal(s.call(s.staff, 'docs.mine').data.procedures[0].acked, true);
  const current = s.call(s.manager, 'docs.manage', { kind: 'procedures' }).data.items[0];
  const edit = s.call(s.manager, 'docs.save', { ...current, staff_ids: [], body: 'Unlock, lights, till float, café machine on.' }).data;
  assert.equal(edit.data.new_version, true);
  assert.equal(s.call(s.staff, 'docs.mine').data.procedures[0].acked, false);
  doc(s, s.manager, { kind: 'jd', title: 'Café assistant', body: 'Makes drinks.', audience: 'people', staff_ids: [{ id: s.ids.sumi }] });
  assert.deepEqual(s.call(s.staff, 'docs.mine').data.procedures.map((d) => d.title).sort(), ['Café assistant', 'Opening the shop']);
  assert.deepEqual(s.call(s.manager, 'docs.mine').data.procedures.map((d) => d.title), ['Opening the shop']);
  assert.equal(doc(s, s.manager, { kind: 'jd', title: 'x', body: 'x', audience: 'people' }).error.fields.staff_ids.code, 'val.required');
});

test('a review: own view first, scored, shared with the facts, acknowledged; nobody reviews themselves', () => {
  const s = team();
  const id = s.call(s.manager, 'reviews.start', { staff_id: s.ids.sumi, from: plus(today(), -30), to: today() }).data.record_id;
  assert.equal(s.call(s.manager, 'reviews.start', { staff_id: s.ids.rafi, from: today(), to: today() }).data.error.code, 'OWN_ENTRY');
  const lines = (n) => Array.from({ length: 8 }, () => ({ score: n, note: '' }));
  assert.equal(s.call(s.manager, 'reviews.score', { id, lines: lines(4), share: true }).data.error.code, 'CONFLICT');
  s.call(s.staff, 'reviews.self', { id, lines: lines(5) });
  // Before it is shared, the person doesn't see the manager's scores.
  s.call(s.manager, 'reviews.score', { id, lines: lines(3), summary: 'Steady month.' });
  assert.equal(s.call(s.staff, 'reviews.list').data.mine.length, 0);
  const partial = [{ score: 4 }, { score: null }];
  assert.equal(s.call(s.manager, 'reviews.score', { id, lines: partial, share: true }).data.error.fields['lines.1.score'].code, 'val.required');
  const shared = s.call(s.manager, 'reviews.score', { id, lines: lines(4), summary: 'Good month.', share: true }).data;
  assert.equal(shared.status, 'saved', JSON.stringify(shared.error));
  const mine = s.call(s.staff, 'reviews.list').data.mine[0];
  assert.deepEqual([mine.status, mine.criteria[0].score, mine.summary], ['shared', 4, 'Good month.']);
  assert.ok('worked_days' in mine.facts && 'tasks_done' in mine.facts);
  assert.equal(s.call(s.staff, 'people.waiting').data.reviews, 1);
  s.call(s.staff, 'reviews.ack', { id, comment: 'Thank you' });
  assert.equal(s.call(s.manager, 'reviews.list').data.theirs[0].staff_comment, 'Thank you');
  assert.equal(s.call(s.manager, 'reviews.score', { id, lines: lines(1) }).data.error.code, 'CONFLICT');
  // A manager's review is a shareholder's.
  assert.equal(s.call(s.owner, 'reviews.start', { staff_id: s.ids.rafi, from: today(), to: today() }).data.status, 'saved');
});
