// Notifications: for the person an event is about (never their own doing),
// on Home until read or dismissed; approvals worked out by the ladder and
// closed once decided; history, the bell and the hourly email.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const DAY = 86400000;
const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const messages = (s, who) => s.call(who, 'people.waiting').data.notifications.filter((n) => n.text.t.startsWith('msg.'));
const approvals = (s, who) => s.call(who, 'notify.list', {}).data.items.filter((n) => n.text.t.startsWith('ntf.'));

function team() {
  const s = shop();
  const users = s.call(s.owner, 'users.list', {}).data.items;
  const userId = (name) => users.find((u) => u.username === name).id;
  const add = (fields) => s.call(s.owner, 'staff.save', { status: 'active', work_start: '10:00', work_end: '18:00', days_off: [], joined_on: plus(today(), -400), ...fields }).data.record_id;
  s.ids.sumi = add({ name: 'Sumi', user_id: userId('staff'), salary: 12000 });
  s.ids.rafi = add({ name: 'Rafi', user_id: userId('manager') });
  return s;
}

test('a leave decision and a salary paid stay on Home until dismissed', () => {
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
  assert.equal(s.call(s.manager, 'notify.dismiss', { id: declined.id }).data.error.code, 'NOT_FOUND');
  s.call(s.staff, 'notify.dismiss', { id: declined.id });
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

test('what waits for someone notifies only those the ladder allows, and closes once decided', () => {
  const s = team();
  const from = plus(today(), 20);
  // The staff member's leave goes to a manager or a shareholder.
  const id = s.call(s.staff, 'leave.apply', { kind: 'unpaid', from, to: from, reason: 'Exam' }).data.record_id;
  assert.deepEqual(approvals(s, s.manager).map((n) => [n.text.t, n.text.p.name, n.done]), [['ntf.leave_waiting', 'Sumi', null]]);
  assert.equal(approvals(s, s.owner).length, 1);
  assert.equal(approvals(s, s.staff).length, 0);
  assert.equal(s.call(s.owner, 'notify.count').data.unread, 1);
  // Looking twice makes no second one.
  assert.equal(approvals(s, s.owner).length, 1);
  // The manager decides: it leaves the owner's list too, saying who.
  s.call(s.manager, 'leave.decide', { id, decision: 'accept' });
  const [closed] = approvals(s, s.owner);
  assert.deepEqual([closed.done, closed.read], [{ t: 'ntf.done_by', p: { name: 'Manager' } }, true]);
  assert.equal(s.call(s.owner, 'notify.count').data.unread, 0);
  // A manager's own leave goes to a shareholder only.
  s.call(s.manager, 'leave.apply', { kind: 'unpaid', from, to: from, reason: 'Wedding' });
  assert.equal(approvals(s, s.manager).filter((n) => !n.done).length, 0);
  assert.equal(approvals(s, s.owner).filter((n) => !n.done).length, 1);
});

test('history filters by part and word; mark all read; email once an hour while unread', () => {
  const s = team();
  s.call(s.manager, 'money.save', { kind: 'expense', date: today(), amount: 5000, account_id: s.ids.cash, category_id: s.ids.milk });
  const from = plus(today(), 20);
  s.call(s.staff, 'leave.apply', { kind: 'unpaid', from, to: from, reason: 'Exam' });
  const list = (payload) => s.call(s.owner, 'notify.list', payload).data.items.map((n) => n.text.t);
  assert.deepEqual(list({ area: 'accounts' }), ['ntf.money_waiting']);
  assert.deepEqual(list({ q: 'sumi leave' }), ['ntf.leave_waiting']);
  s.call(s.owner, 'me.notify', { email: 'owner@example.com', enabled: true });
  s.server.job();
  const mails = s.state.mails.filter((m) => /notification/.test(m.subject));
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /2 new notifications/);
  assert.match(mails[0].body, /Manager's Expense of Tk 5,000 waits for you/);
  s.server.job();
  assert.equal(s.state.mails.filter((m) => /notification/.test(m.subject)).length, 1);
  s.call(s.owner, 'notify.read', {});
  assert.deepEqual(list({ unread: true }), []);
});
