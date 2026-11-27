// Tasks on the real server bundle: repeating and one-off, given to a person
// or a role, done, checked, needing their record, moved by leave, and in
// day closing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const DAY = 86400000;
const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

function team() {
  const s = shop();
  const users = s.call(s.owner, 'users.list', {}).data.items;
  const userId = (name) => users.find((u) => u.username === name).id;
  const add = (fields) => s.call(s.owner, 'staff.save', { status: 'active', joined_on: plus(today(), -100), days_off: [], ...fields }).data.record_id;
  s.ids.sumi = add({ name: 'Sumi', user_id: userId('staff') });
  s.ids.rafi = add({ name: 'Rafi', user_id: userId('manager') });
  s.ids.boss = add({ name: 'Owner', user_id: userId('owner') });
  return s;
}

const mine = (s, who) => s.call(who, 'tasks.mine').data.items;

test('a daily task is made for today and tomorrow, once, and only on working days', () => {
  const s = team();
  const saved = s.call(s.manager, 'tasks.template.save', { title: 'Wipe the café tables', staff_id: s.ids.sumi, repeat: 'daily', due_time: '11:00', start_date: today(), status: 'active' }).data;
  assert.equal(saved.status, 'saved');
  assert.deepEqual(mine(s, s.staff).map((t) => t.due_date), [today(), plus(today(), 1)]);
  s.server.job();
  s.server.job();
  assert.equal(mine(s, s.staff).length, 2);
  // Tomorrow off: tomorrow's task isn't made for a new template.
  s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: plus(today(), 1), value: 'off' });
  s.call(s.manager, 'tasks.template.save', { title: 'Sweep', staff_id: s.ids.sumi, repeat: 'daily', start_date: today(), status: 'active' });
  assert.equal(mine(s, s.staff).filter((t) => t.title === 'Sweep').length, 1);
  assert.equal(s.call(s.staff, 'tasks.template.save', { title: 'x', staff_id: s.ids.sumi, repeat: 'daily', start_date: today(), status: 'active' }).error.code, 'FORBIDDEN');
});

test('weekly and monthly repeats need their days', () => {
  const s = team();
  const weekly = s.call(s.manager, 'tasks.template.save', { title: 'Order milk', staff_id: s.ids.sumi, repeat: 'weekly', days: [], start_date: today(), status: 'active' }).data;
  assert.equal(weekly.error.fields.days.code, 'val.required');
  const monthly = s.call(s.manager, 'tasks.template.save', { title: 'Pay rent', staff_id: s.ids.rafi, repeat: 'monthly', start_date: today(), status: 'active', link: 'money:expense' }).data;
  assert.equal(monthly.error.fields.day_of_month.code, 'val.required');
  assert.equal(s.call(s.manager, 'tasks.template.save', { title: 'x', staff_id: s.ids.rafi, repeat: 'daily', start_date: today(), status: 'active', link: 'page:nowhere' }).data.error.fields.link.code, 'val.choice');
});

test('every task is checked by someone more senior; sent back; nobody checks their own; a shareholder\'s own is final', () => {
  const s = team();
  const id = s.call(s.manager, 'tasks.create', { title: 'Shelve new arrivals', staff_id: s.ids.sumi, due_date: today() }).data.record_id;
  assert.equal(s.call(s.manager, 'tasks.complete', { id }).data.error.code, 'NOT_FOUND');
  assert.equal(s.call(s.staff, 'tasks.complete', { id, note: 'All on the new shelf' }).data.data.status, 'to_check');
  assert.equal(s.call(s.manager, 'people.waiting').data.tasks, 1);
  assert.equal(s.call(s.manager, 'tasks.verify', { id, decision: 'reject' }).data.error.fields.note.code, 'val.required');
  s.call(s.manager, 'tasks.verify', { id, decision: 'reject', note: 'Poetry is on the wrong shelf' });
  const back = mine(s, s.staff).find((t) => t.id === id);
  assert.deepEqual([back.status, back.check_note], ['open', 'Poetry is on the wrong shelf']);
  s.call(s.staff, 'tasks.comment', { id, text: 'Moved it' });
  s.call(s.staff, 'tasks.complete', { id });
  assert.equal(s.call(s.manager, 'tasks.verify', { id, decision: 'accept' }).data.status, 'saved');
  assert.equal(mine(s, s.staff).find((t) => t.id === id).status, 'done');
  // The manager's own task waits for a shareholder.
  const own = s.call(s.owner, 'tasks.create', { title: 'Call the publisher', staff_id: s.ids.rafi, due_date: today() }).data.record_id;
  assert.equal(s.call(s.manager, 'tasks.complete', { id: own }).data.data.status, 'to_check');
  assert.equal(s.call(s.manager, 'tasks.verify', { id: own, decision: 'accept' }).data.error.code, 'OWN_ENTRY');
  assert.equal(s.call(s.owner, 'tasks.verify', { id: own, decision: 'accept' }).data.status, 'saved');
  // A shareholder's own task is final when done.
  const boss = s.call(s.owner, 'tasks.create', { title: 'Sign the lease', staff_id: s.ids.boss, due_date: today() }).data.record_id;
  assert.equal(s.call(s.owner, 'tasks.complete', { id: boss }).data.data.status, 'done');
});

test('a task for a role: anyone of it may do it, and it becomes theirs', () => {
  const s = team();
  const id = s.call(s.manager, 'tasks.create', { title: 'Lock the back door', role: 'staff', due_date: today() }).data.record_id;
  assert.equal(s.call(s.manager, 'tasks.create', { title: 'x', due_date: today() }).data.error.fields.staff_id.code, 'val.required');
  assert.equal(s.call(s.manager, 'tasks.create', { title: 'x', staff_id: s.ids.sumi, role: 'staff', due_date: today() }).data.error.fields.staff_id.code, 'val.required');
  assert.equal(mine(s, s.staff).find((t) => t.id === id).role, 'staff');
  assert.equal(mine(s, s.manager).some((t) => t.id === id), false);
  assert.equal(s.call(s.manager, 'tasks.complete', { id }).data.error.code, 'NOT_FOUND');
  s.call(s.staff, 'tasks.complete', { id });
  const done = s.call(s.manager, 'tasks.list', { date: today() }).data.to_check.find((t) => t.id === id);
  assert.equal(done.staff_name, 'Sumi');
  // A repeating task for a role is made on days anyone of it works.
  s.call(s.manager, 'tasks.template.save', { title: 'Sweep', role: 'staff', repeat: 'daily', start_date: today(), status: 'active' });
  assert.equal(mine(s, s.staff).filter((t) => t.title === 'Sweep').length, 2);
});

test('a linked task needs its record, unless a manager allows it with a reason', () => {
  const s = team();
  const id = s.call(s.manager, 'tasks.create', { title: 'Count the café', staff_id: s.ids.sumi, due_date: today(), link: 'page:cafe_count' }).data.record_id;
  assert.equal(s.call(s.staff, 'tasks.complete', { id }).data.error.code, 'TASK_RECORD');
  assert.equal(s.call(s.staff, 'tasks.allow', { id, reason: 'x' }).error.code, 'FORBIDDEN');
  assert.equal(s.call(s.manager, 'tasks.allow', { id, reason: 'The scale was broken' }).data.status, 'saved');
  assert.equal(s.call(s.staff, 'tasks.complete', { id }).data.data.status, 'to_check');
  // With the record saved, it is done with it.
  const item = s.call(s.owner, 'cafe.item.save', { name: 'Milk', unit: 'l', kind: 'stock', status: 'active' }).data;
  const counted = s.call(s.manager, 'tasks.create', { title: 'Count again', staff_id: s.ids.sumi, due_date: today(), link: 'page:cafe_count' }).data.record_id;
  assert.equal(item.status, 'saved', JSON.stringify(item));
  s.call(s.staff, 'cafe.count.save', { date: today(), lines: [{ item_id: item.record_id, counted: 5 }] });
  // Done with the exact record: picked from those made since the task.
  assert.equal(s.call(s.staff, 'tasks.complete', { id: counted }).data.error.code, 'TASK_RECORD');
  const made = s.call(s.staff, 'tasks.records', { id: counted }).data.items;
  assert.equal(made.length, 1);
  assert.equal(s.call(s.staff, 'tasks.complete', { id: counted, record_id: made[0].id }).data.status, 'saved');
  assert.equal(mine(s, s.staff).find((t) => t.id === counted).record_id, made[0].id);
});

test('a payment task is tied to the entry made from it and needs the receipt, which is filed on the entry', () => {
  const s = team();
  const id = s.call(s.owner, 'tasks.create', { title: 'Pay the electricity bill', staff_id: s.ids.rafi, due_date: today(), link: 'money:expense' }).data.record_id;
  const category = s.call(s.owner, 'setup.category.save', { name: 'Electricity', area: 'shared', status: 'active' }).data.record_id;
  const entry = s.call(s.manager, 'money.save', { kind: 'expense', date: today(), amount: 1500, account_id: s.ids.cash, category_id: category }).data.record_id;
  assert.equal(s.call(s.manager, 'tasks.record', { id, record_id: entry }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'tasks.complete', { id }).data.error.fields.receipt.code, 'val.photo_needed');
  s.call(s.manager, 'tasks.attach', { id, slot: 'receipt', name: 'bill.jpg', mime: 'image/jpeg', data: Buffer.from('a bill').toString('base64') });
  assert.equal(s.call(s.manager, 'tasks.complete', { id }).data.status, 'saved');
  // The receipt is now filed on the entry itself.
  assert.equal(s.call(s.manager, 'tasks.records', { id }).data.items.find((r) => r.id === entry).has_receipt, true);
});

test('approved leave skips repeating tasks and moves one-off tasks to the working day before it', () => {
  const s = team();
  const d = plus(today(), 3);
  s.call(s.manager, 'tasks.template.save', { title: 'Count the till', staff_id: s.ids.sumi, repeat: 'daily', start_date: today(), status: 'active' });
  const once = s.call(s.manager, 'tasks.create', { title: 'Return damaged copies', staff_id: s.ids.sumi, due_date: d }).data.record_id;
  // The day before the leave is off: it moves two days earlier.
  s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: plus(d, -1), value: 'off' });
  s.call(s.manager, 'leave.apply', { staff_id: s.ids.sumi, kind: 'unpaid', from: d, to: d, reason: 'Exam' });
  const items = mine(s, s.staff);
  assert.equal(items.filter((t) => t.title === 'Count the till' && t.due_date === d).every((t) => t.status === 'skipped'), true);
  const moved = items.find((t) => t.id === once);
  assert.deepEqual([moved.due_date, moved.moved_from, moved.move_flag], [plus(d, -2), d, '']);
  // Given for a day off: moved to the working day before, both dates kept.
  s.call(s.manager, 'rota.set', { staff_id: s.ids.sumi, date: plus(today(), 5), value: 'off' });
  const given = s.call(s.manager, 'tasks.create', { title: 'Dust the atlas shelf', staff_id: s.ids.sumi, due_date: plus(today(), 5) }).data.data;
  assert.deepEqual([given.due_date, given.moved_from], [plus(today(), 4), plus(today(), 5)]);
  // Leave from today: no earlier working day, so it stays and is flagged.
  const now = s.call(s.manager, 'tasks.create', { title: 'Wrap gifts', staff_id: s.ids.sumi, due_date: today() }).data.record_id;
  s.call(s.manager, 'leave.apply', { staff_id: s.ids.sumi, kind: 'unpaid', from: today(), to: today(), reason: 'Sick' });
  const flagged = mine(s, s.staff).find((t) => t.id === now);
  assert.deepEqual([flagged.due_date, flagged.move_flag], [today(), 'no_day']);
});

test('not done with a reason; day closing warns about open tasks', () => {
  const s = team();
  const a = s.call(s.manager, 'tasks.create', { title: 'Clean the coffee machine', staff_id: s.ids.sumi, due_date: today() }).data.record_id;
  s.call(s.manager, 'tasks.create', { title: 'Restock cups', staff_id: s.ids.sumi, due_date: today() });
  const step = () => s.call(s.manager, 'closing.day', { date: today() }).data.steps.find((x) => x.id === 'tasks');
  assert.deepEqual([step().state, step().params.count], ['warn', 2]);
  assert.equal(s.call(s.staff, 'tasks.not_done', { id: a, reason: 'Descaler ran out' }).data.status, 'saved');
  assert.equal(step().params.count, 1);
  const list = s.call(s.manager, 'tasks.list', { date: today() }).data.items;
  assert.equal(list.find((t) => t.id === a).note, 'Descaler ran out');
  assert.equal(s.call(s.staff, 'tasks.list', {}).error.code, 'FORBIDDEN');
});

test('a task for a position or a team: one anyone of it may do, or a copy for each person', () => {
  const s = team();
  const both = (fields) => s.call(s.owner, 'staff.list', {}).data.items.filter((x) => ['Sumi', 'Rafi'].includes(x.name)).forEach((x) => {
    s.call(s.owner, 'staff.save', { ...x, days_off: x.days_off.map((day) => ({ day })), pin: null, ...fields });
  });
  both({ position: 'Café' });
  const shared = s.call(s.manager, 'tasks.create', { title: 'Clean the espresso machine', position: 'Café', priority: 'high', due_date: today() }).data.record_id;
  assert.equal(mine(s, s.staff).find((x) => x.id === shared).priority, 'high');
  assert.ok(mine(s, s.manager).some((x) => x.id === shared));
  const teamId = s.call(s.owner, 'tasks.team.save', { name: 'Closing team', members: [{ id: s.ids.sumi }, { id: s.ids.rafi }], status: 'active' }).data.record_id;
  const each = s.call(s.manager, 'tasks.create', { title: 'Read the new menu', team_id: teamId, each: true, due_date: today() }).data;
  assert.equal(each.data.count, 2);
  assert.equal(mine(s, s.staff).filter((x) => x.title === 'Read the new menu').length, 1);
  assert.equal(s.call(s.manager, 'tasks.create', { title: 'x', position: 'Nobody', each: true, due_date: today() }).data.error.fields.staff_id.code, 'val.nobody');
  // A repeating task with a copy each is made per person.
  s.call(s.manager, 'tasks.template.save', { title: 'Count the till', team_id: teamId, each: true, repeat: 'daily', start_date: today(), status: 'active' });
  assert.equal(mine(s, s.staff).filter((x) => x.title === 'Count the till').length, 2);
  assert.equal(mine(s, s.manager).filter((x) => x.title === 'Count the till').length, 2);
});

test('a checklist and evidence: required answers, numbers in range, photos and a note before it is done', () => {
  const s = team();
  const id = s.call(s.manager, 'tasks.create', {
    title: 'Fridge check', staff_id: s.ids.sumi, due_date: today(), evidence_after: true, evidence_note: true,
    checklist: [{ label: 'Doors closed', type: 'check', required: true }, { label: 'Temperature', type: 'number', required: true, min: 1, max: 5, unit: '°C' }, { label: 'Shelf', type: 'photo', required: true }],
  }).data.record_id;
  const task = mine(s, s.staff).find((x) => x.id === id);
  assert.deepEqual(task.checklist.map((c) => c.id), ['c1', 'c2', 'c3']);
  const tooWarm = s.call(s.staff, 'tasks.complete', { id, answers: [{ item: 'c1', value: '' }, { item: 'c2', value: '9' }] }).data.error.fields;
  assert.deepEqual(Object.keys(tooWarm).sort(), ['after', 'answers.c1', 'answers.c2', 'answers.c3', 'note']);
  assert.equal(tooWarm['answers.c2'].code, 'val.between');
  const photo = { name: 'p.jpg', mime: 'image/jpeg', data: Buffer.from('a photo').toString('base64') };
  assert.equal(s.call(s.staff, 'tasks.attach', { id, slot: 'c3', ...photo }).data.status, 'saved');
  assert.equal(s.call(s.staff, 'tasks.attach', { id, slot: 'after', ...photo }).data.status, 'saved');
  assert.equal(s.call(s.staff, 'tasks.attach', { id, slot: 'nowhere', ...photo }).data.error.fields.slot.code, 'val.choice');
  const done = s.call(s.staff, 'tasks.complete', { id, note: 'All fine', answers: [{ item: 'c1', value: 'yes' }, { item: 'c2', value: '4' }] }).data;
  assert.equal(done.data.status, 'to_check');
  assert.deepEqual(mine(s, s.staff).find((x) => x.id === id).answers, { c1: 'yes', c2: '4' });
});

test('a report-printing task is done once the report is printed from it', () => {
  const s = team();
  const id = s.call(s.owner, 'tasks.create', { title: 'Print last month\'s report', staff_id: s.ids.boss, due_date: today(), link: 'report:month' }).data.record_id;
  assert.equal(s.call(s.owner, 'tasks.complete', { id }).data.error.code, 'TASK_RECORD');
  // Only people who may see the report print it.
  assert.equal(s.call(s.manager, 'reports.printed', { report: 'month', ref: '2026-10' }).data.error.code, 'FORBIDDEN');
  const printed = s.call(s.owner, 'reports.printed', { report: 'month', ref: '2026-10' }).data.record_id;
  s.call(s.owner, 'tasks.record', { id, record_id: printed });
  assert.equal(s.call(s.owner, 'tasks.complete', { id }).data.data.status, 'done');
});
