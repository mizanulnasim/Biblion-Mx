// Messages on Home: left for the person an event is about, kept until they
// dismiss them, and never for their own doing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const DAY = 86400000;
const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const messages = (s, who) => s.call(who, 'people.waiting').data.messages;

function team() {
  const s = shop();
  const users = s.call(s.owner, 'users.list', {}).data.items;
  const userId = (name) => users.find((u) => u.username === name).id;
  const add = (fields) => s.call(s.owner, 'staff.save', { status: 'active', work_start: '10:00', work_end: '18:00', days_off: [], joined_on: plus(today(), -400), ...fields }).data.record_id;
  s.ids.sumi = add({ name: 'Sumi', user_id: userId('staff'), salary: 12000 });
  s.ids.rafi = add({ name: 'Rafi', user_id: userId('manager') });
  return s;
}

test('a leave decision and a salary paid leave messages until dismissed', () => {
  const s = team();
  const from = plus(today(), 20);
  const id = s.call(s.staff, 'leave.apply', { kind: 'unpaid', from, to: from, reason: 'Exam' }).data.record_id;
  s.call(s.manager, 'leave.decide', { id, decision: 'reject', note: 'Stock-take that day' });
  s.call(s.owner, 'money.save', { kind: 'salary_paid', date: today(), amount: 5000, account_id: s.ids.cash, party_id: s.ids.sumi, period: today().slice(0, 7) });
  const mine = messages(s, s.staff);
  assert.deepEqual(mine.map((m) => m.text.t).sort(), ['msg.leave_declined', 'msg.salary_paid']);
  const declined = mine.find((m) => m.text.t === 'msg.leave_declined');
  assert.deepEqual(declined.text.p, { from: { d: from }, to: { d: from }, note: 'Stock-take that day' });
  // Only the person it is for may dismiss it.
  assert.equal(s.call(s.manager, 'messages.dismiss', { id: declined.id }).data.error.code, 'NOT_FOUND');
  s.call(s.staff, 'messages.dismiss', { id: declined.id });
  assert.deepEqual(messages(s, s.staff).map((m) => m.text.t), ['msg.salary_paid']);
});

test('an entry cancelled by someone else tells who entered it; cancelling your own tells nobody', () => {
  const s = team();
  const a = s.call(s.manager, 'money.save', { kind: 'expense', date: today(), amount: 500, account_id: s.ids.cash, category_id: s.ids.milk }).data.record_id;
  const b = s.call(s.owner, 'money.save', { kind: 'expense', date: today(), amount: 300, account_id: s.ids.cash, category_id: s.ids.milk }).data.record_id;
  s.call(s.owner, 'money.cancel', { id: a, reason: 'Wrong category' });
  s.call(s.owner, 'money.cancel', { id: b, reason: 'Typed twice' });
  assert.deepEqual(messages(s, s.manager).map((m) => m.text.p.reason), ['Wrong category']);
  assert.deepEqual(messages(s, s.owner), []);
});

test('a task given for a day off moves earlier, and the doer is told', () => {
  const s = team();
  const off = plus(today(), 3);
  s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: off, value: 'off' });
  s.call(s.manager, 'tasks.create', { title: 'Dust the shelves', staff_id: s.ids.sumi, due_date: off });
  const [m] = messages(s, s.staff);
  assert.equal(m.text.t, 'msg.task_moved');
  assert.deepEqual([m.text.p.from, m.text.p.to], [{ d: off }, { d: plus(off, -1) }]);
  // The manager gave it, so isn't told about their own doing.
  assert.deepEqual(messages(s, s.manager), []);
});
