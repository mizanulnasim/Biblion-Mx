// Setup: every described setting, by section, and people's own values.

import test from 'node:test';
import assert from 'node:assert/strict';
import { setSettings, settingsOf, shop } from './shop.mjs';
import { SETTINGS, SETTING_AREAS } from '../../shared/schema/settings.js';

const userId = (s, name) => s.call(s.owner, 'settings.view').data.users.find((u) => u.name === name).id;

test('a shareholder sees every section, with every setting described for it', () => {
  const s = shop();
  const { areas } = s.call(s.owner, 'settings.view').data;
  assert.deepEqual(Object.keys(areas), Object.keys(SETTING_AREAS));
  for (const area of Object.keys(areas)) {
    assert.deepEqual(areas[area].map((i) => i.key), Object.keys(SETTINGS).filter((k) => SETTINGS[k].area === area));
  }
  assert.equal(settingsOf(s, 'shop')['shop.name'], 'Biblion');
});

// Gives one person an extra permission, straight in the Users sheet.
function grant(s, username, perm) {
  const sheet = Object.values(s.state.books).find((b) => b.sheets.Users).sheets.Users;
  const [header, ...lines] = sheet.cells;
  const line = lines.find((l) => l[header.indexOf('username')] === username);
  line[header.indexOf('perm_grants')] = JSON.stringify([perm]);
  s.state.cache = {};
}

test('others see only the sections their permissions allow', () => {
  const s = shop();
  assert.equal(s.call(s.manager, 'settings.view').error.code, 'FORBIDDEN');
  grant(s, 'manager', 'setup.tasks');
  const view = s.call(s.manager, 'settings.view').data;
  assert.deepEqual([Object.keys(view.areas), view.users], [['tasks'], []]);
  assert.equal(setSettings(s, 'tasks', { 'tasks.days_ahead': 3 }, s.manager).data.status, 'saved');
  assert.equal(s.call(s.manager, 'settings.shop.save', { 'shop.name': 'x' }).error.code, 'FORBIDDEN');
});

test('a section is checked as a whole and saved tidied', () => {
  const s = shop();
  assert.equal(setSettings(s, 'attendance', { 'gps.lat': 23.8 }).data.error.fields['gps.lng'].code, 'val.required');
  const twice = [{ from: '2026-01-01', amount: 100 }, { from: '2026-01-01', amount: 120 }];
  assert.equal(setSettings(s, 'payroll', { 'food.rates': twice }).data.error.fields['food.rates'].code, 'val.taken');
  assert.equal(setSettings(s, 'payroll', { 'food.rates': [{ from: '2026-06-01', amount: 120 }, { from: '2000-01-01', amount: 100 }] }).data.status, 'saved');
  assert.deepEqual(settingsOf(s, 'payroll')['food.rates'].map((r) => r.from), ['2000-01-01', '2026-06-01']);
  setSettings(s, 'shop', { 'staff.number_prefix': 'bk' });
  assert.equal(settingsOf(s, 'shop')['staff.number_prefix'], 'BK');
});

test('the sign-in lock follows its settings', () => {
  const s = shop();
  setSettings(s, 'security', { 'auth.max_failed': 3 });
  for (let i = 0; i < 3; i++) assert.equal(s.call(null, 'auth.login', { username: 'staff', password: 'wrong-pass' }).data.error.code, 'AUTH_FAILED');
  assert.equal(s.call(null, 'auth.login', { username: 'staff', password: 'staff-pass' }).data.error.code, 'LOCKED_OUT');
});

test('one person can have their own value, shown in Setup and reset there', () => {
  const s = shop();
  const staff = userId(s, 'Staff');
  const own = (value) => s.call(s.owner, 'settings.person.save', { key: 'staff.self_edit', user_id: staff, value }).data;
  assert.equal(own('true').status, 'saved');
  assert.equal(own('false').data.find((i) => i.key === 'staff.self_edit').own[0].value, false);
  assert.equal(s.call(s.staff, 'meta.get').data.settings['staff.self_edit'], false);
  assert.equal(s.call(s.manager, 'meta.get').data.settings['staff.self_edit'], true);
  assert.equal(s.call(s.owner, 'settings.person.save', { key: 'theme', user_id: staff, value: 'pink' }).data.error.fields.value.code, 'val.choice');
  assert.deepEqual(own(null).data.find((i) => i.key === 'staff.self_edit').own, []);
  assert.equal(s.call(s.staff, 'meta.get').data.settings['staff.self_edit'], true);
});

test('to start, a manager\'s money entries follow "other entries": a shareholder confirms', () => {
  const s = shop();
  setSettings(s, 'approvals', { 'approve.rule.other': 'shareholder' });
  assert.equal(settingsOf(s, 'approvals')['approve.rule.expense'], 'same');
  const boot = s.call(s.manager, 'money.boot').data;
  assert.equal(boot.approval.rules.expense, 'shareholder');
  setSettings(s, 'approvals', { 'approve.rule.expense': 'final' });
  assert.equal(s.call(s.manager, 'money.boot').data.approval.rules.expense, 'final');
});
