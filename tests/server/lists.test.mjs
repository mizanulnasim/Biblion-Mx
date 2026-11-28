// Setup lists made from their descriptions (shared/lists/lists.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';
import { LISTS } from '../../shared/lists/lists.js';

// Gives one person an extra permission, straight in the Users sheet.
function grant(s, username, perm) {
  const sheet = Object.values(s.state.books).find((b) => b.sheets.Users).sheets.Users;
  const [header, ...lines] = sheet.cells;
  const line = lines.find((l) => l[header.indexOf('username')] === username);
  line[header.indexOf('perm_grants')] = JSON.stringify([perm]);
  s.state.cache = {};
}

const rows = (s, token, key) => s.call(token, `list.${key}`).data.rows;

test('the first setup makes the starting lists, references resolved', () => {
  const s = shop();
  for (const key of Object.keys(LISTS)) assert.equal(rows(s, s.owner, key).length, LISTS[key].start.length, key);
  const cafe = rows(s, s.owner, 'departments').find((d) => d.name === 'Café');
  const barista = rows(s, s.owner, 'designations').find((d) => d.name === 'Barista');
  assert.equal(barista.department_id, cafe.id);
  assert.equal(barista.flex_hours, 1);
  assert.equal(barista.late_applies, true);
  assert.equal(rows(s, s.owner, 'doc_categories').find((d) => d.name === 'Performance record').staff_see, false);
});

test('only people with the list permission see or change it', () => {
  const s = shop();
  assert.equal(s.call(s.manager, 'list.departments').error.code, 'FORBIDDEN');
  assert.equal(s.call(s.staff, 'list.task_categories.save', { name: 'Kitchen', kind: 'checklist', status: 'active' }).error.code, 'FORBIDDEN');
});

test('names are unique; a near match needs confirming; a reference must exist', () => {
  const s = shop();
  const save = (payload) => s.call(s.owner, 'list.departments.save', { status: 'active', ...payload }).data;
  assert.equal(save({ name: 'café' }).error.fields.name.code, 'val.taken');
  assert.equal(save({ name: 'Bookstores' }).error.fields.name.code, 'val.similar');
  assert.equal(save({ name: 'Bookstores', confirm_similar: true }).status, 'saved');
  const design = (department_id) => s.call(s.owner, 'list.designations.save', { name: 'Cook', department_id, status: 'active' }).data;
  assert.equal(design('DEP-NOSUCH0000').error.fields.department_id.code, 'val.not_found');
  assert.equal(design(null).error.fields.department_id.code, 'val.required');
  const cafe = rows(s, s.owner, 'departments').find((d) => d.name === 'Café');
  const cook = design(cafe.id);
  assert.equal(cook.status, 'saved');
  assert.equal(cook.data.hours_required, null);
});

test('an edit checks the version', () => {
  const s = shop();
  const type = rows(s, s.owner, 'employment_types').find((r) => r.name === 'Intern');
  const edit = (version) => s.call(s.owner, 'list.employment_types.save', { id: type.id, version, name: 'Trainee', status: 'active' }).data;
  assert.equal(edit(type.version).status, 'saved');
  assert.equal(edit(type.version).error.code, 'CONFLICT');
});

test('a shareholder deletes only what nothing refers to; the record leaves every list', () => {
  const s = shop();
  const mgmt = rows(s, s.owner, 'departments').find((d) => d.name === 'Management');
  const remove = (token, r) => s.call(token, 'list.departments.remove', { id: r.id, version: r.version }).data;
  assert.equal(remove(s.owner, mgmt).error.code, 'IN_USE');
  assert.equal(remove(s.owner, mgmt).error.params.count, 1);

  const extra = s.call(s.owner, 'list.departments.save', { name: 'Events', status: 'active' }).data.data;
  // Someone given the permission but not a shareholder can't delete.
  grant(s, 'manager', 'setup.hr');
  assert.equal(s.call(s.manager, 'list.departments').data.can_delete, false);
  assert.equal(remove(s.manager, extra).error.code, 'FORBIDDEN');

  assert.equal(remove(s.owner, extra).status, 'saved');
  assert.ok(!rows(s, s.owner, 'departments').some((d) => d.id === extra.id));
  // A deleted name can be used again.
  assert.equal(s.call(s.owner, 'list.departments.save', { name: 'Events', status: 'active' }).data.status, 'saved');
});
