// Applicants and onboarding on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);

test('an applicant moves through the stages and, hired, becomes staff with onboarding', () => {
  const s = shop();
  const id = s.call(s.manager, 'applicants.save', { name: 'Nadia', phone: '01811-000000', position: 'Café assistant', source: 'Facebook post' }).data.record_id;
  assert.equal(s.call(s.staff, 'applicants.list', {}).error.code, 'FORBIDDEN');
  const move = (fields) => s.call(s.manager, 'applicants.stage', { id, ...fields }).data;
  assert.equal(move({ stage: 'interview' }).error.fields.interview_at.code, 'val.required');
  assert.equal(move({ stage: 'hired' }).error.code, 'CONFLICT');
  move({ stage: 'interview', interview_at: `${today()} 15:00` });
  assert.equal(move({ stage: 'offered', offer_salary: 11000 }).error.fields.start_date.code, 'val.required');
  move({ stage: 'offered', offer_salary: 11000, start_date: today(), note: 'Accepted on the phone' });
  const hired = move({ stage: 'hired' });
  assert.ok(hired.data.staff_id);
  const staff = s.call(s.owner, 'staff.list', {}).data.items.find((x) => x.id === hired.data.staff_id);
  assert.deepEqual([staff.name, staff.position, staff.salary, staff.joined_on, staff.phone], ['Nadia', 'Café assistant', 11000, today(), '01811000000']);
  const a = s.call(s.manager, 'applicants.list', {}).data.items[0];
  assert.deepEqual(a.history.map((h) => h.stage), ['new', 'interview', 'offered', 'hired']);
  assert.equal(s.call(s.manager, 'applicants.list', { stage: 'open' }).data.items.length, 0);

  const ob = s.call(s.manager, 'onboarding.list').data.items[0];
  assert.equal(ob.staff.name, 'Nadia');
  assert.equal(ob.steps.length, 7);
  assert.deepEqual(ob.facts, { sign_in: false, pin: false });
  const tick = (step) => s.call(s.manager, 'steps.tick', { list: 'onboarding', ref: ob.id, step, done: true }).data;
  for (let i = 0; i < 6; i++) tick(String(i));
  assert.equal(s.call(s.manager, 'onboarding.list').data.items[0].steps[0].by, 'Manager');
  assert.equal(tick('6').data.finished, true);
  // Done: nothing more can be ticked.
  assert.equal(tick('0').error.code, 'CONFLICT');
  assert.equal(s.call(s.manager, 'onboarding.list').data.items.length, 0);
});

test('turning someone down needs a note', () => {
  const s = shop();
  const id = s.call(s.manager, 'applicants.save', { name: 'Tanvir', position: 'Bookseller' }).data.record_id;
  assert.equal(s.call(s.manager, 'applicants.stage', { id, stage: 'rejected' }).data.error.fields.note.code, 'val.required');
  assert.equal(s.call(s.manager, 'applicants.stage', { id, stage: 'rejected', note: 'Needs weekends off' }).data.status, 'saved');
  assert.equal(s.call(s.manager, 'applicants.list', { stage: 'rejected' }).data.items.length, 1);
});
