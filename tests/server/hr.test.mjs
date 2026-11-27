// Staff records and attendance on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { shop } from './shop.mjs';
import { punchText } from '../../shared/hr/attendance.js';

const SHOP = { lat: 23.7808, lng: 90.4106 };
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const json = (v) => JSON.parse(JSON.stringify(v));

function hr() {
  const s = shop();
  const users = s.call(s.owner, 'users.list', {}).data.items;
  const userId = (name) => users.find((u) => u.username === name).id;
  const add = (fields) => s.call(s.owner, 'staff.save', { status: 'active', ...fields }).data.record_id;
  s.ids.staff_rec = add({ name: 'Sumi', user_id: userId('staff'), work_start: '10:00', work_end: '18:00', pin: '2468', salary: 12000, nid: '1990123456' });
  s.ids.manager_rec = add({ name: 'Rafi', user_id: userId('manager'), work_start: '10:00', work_end: '18:00' });
  s.ids.owner_rec = add({ name: 'Owner', user_id: userId('owner') });
  s.call(s.owner, 'settings.attendance.save', {
    ...s.call(s.owner, 'settings.attendance').data, lat: SHOP.lat, lng: SHOP.lng,
  });
  return s;
}

const punch = (s, who, fields) => s.call(who, 'attendance.punch', { type: 'in', device_ts: ago(0), lat: SHOP.lat, lng: SHOP.lng, accuracy: 10, ...fields }).data;

test('private parts of a staff record go only to those allowed to see them', () => {
  const s = hr();
  const asManager = s.call(s.manager, 'staff.list', {}).data.items.find((x) => x.name === 'Sumi');
  assert.equal(asManager.salary, undefined);
  assert.equal(asManager.nid, undefined);
  assert.deepEqual(json(asManager.emergency), []);
  assert.equal(asManager.pin_set, true);
  const asOwner = s.call(s.owner, 'staff.list', {}).data.items.find((x) => x.name === 'Sumi');
  assert.equal(asOwner.salary, 12000);
  assert.equal(asOwner.nid, '1990123456');
  // A manager's save leaves the salary and NID alone.
  assert.equal(s.call(s.manager, 'staff.save', { ...asManager, salary: 1, nid: 'x', pin: null }).data.status, 'saved');
  const again = s.call(s.owner, 'staff.list', {}).data.items.find((x) => x.name === 'Sumi');
  assert.equal(again.salary, 12000);
  assert.equal(again.nid, '1990123456');
  assert.equal(s.call(s.staff, 'staff.list', {}).error.code, 'FORBIDDEN');
  // One staff record per sign-in.
  const clash = s.call(s.owner, 'staff.save', { name: 'Other', status: 'active', user_id: asOwner.user_id }).data;
  assert.equal(clash.error.fields.user_id.code, 'val.taken');
  assert.equal(s.call(s.staff, 'meta.get').data.staff.name, 'Sumi');
});

test('a phone punch at the shop is ok; a double tap is one punch; out comes after in', () => {
  const s = hr();
  const first = punch(s, s.staff, {});
  assert.equal(first.status, 'saved');
  assert.equal(first.data.status, 'ok');
  const twin = punch(s, s.staff, {});
  assert.equal(twin.data.duplicate, true);
  assert.equal(twin.record_id, first.record_id);
  assert.equal(punch(s, s.manager, { type: 'out' }).error.code, 'NOT_IN');
  const today = s.call(s.staff, 'attendance.today').data;
  assert.equal(today.next, 'out');
  assert.ok(['in', 'incomplete'].includes(today.day.state));
});

test('a second "in" outside the double-tap window says since when you are in', () => {
  const s = hr();
  s.call(s.owner, 'settings.attendance.save', { ...s.call(s.owner, 'settings.attendance').data, duplicate_window_sec: 30 });
  assert.equal(punch(s, s.staff, { device_ts: ago(1.5) }).data.status, 'ok');
  const again = punch(s, s.staff, {});
  assert.equal(again.error.code, 'SEQUENCE');
  assert.match(again.error.params.time, /^\d{2}:\d{2}$/);
});

test('in, out, then in again moments later is a new punch, not a double tap', () => {
  const s = hr();
  punch(s, s.staff, { device_ts: ago(1) });
  punch(s, s.staff, { type: 'out', device_ts: ago(0.5) });
  const again = punch(s, s.staff, {});
  assert.equal(again.data.duplicate, false);
  assert.equal(s.call(s.staff, 'attendance.today').data.next, 'out');
});

test('days before a person joined are not counted', () => {
  const s = hr();
  const sumi = s.call(s.owner, 'staff.list', {}).data.items.find((x) => x.name === 'Sumi');
  const today = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
  s.call(s.owner, 'staff.save', { ...sumi, joined_on: today, pin: null });
  const days = s.call(s.staff, 'attendance.mine', {}).data.days;
  assert.deepEqual(days.map((d) => d.date), [today]);
});

test('away from the shop: a reason sends it for a check, or it is blocked', () => {
  const s = hr();
  const far = { lat: SHOP.lat + 0.01, lng: SHOP.lng };
  const noReason = punch(s, s.staff, far);
  assert.equal(noReason.error.fields.reason.code, 'val.outside');
  assert.ok(noReason.error.fields.reason.params.distance > 1000);
  const withReason = punch(s, s.staff, { ...far, reason: 'Collecting books from Banglabazar' });
  assert.equal(withReason.data.status, 'check');
  assert.equal(punch(s, s.manager, { lat: null, lng: null }).error.code, 'LOCATION_REQUIRED');
  assert.equal(punch(s, s.manager, { accuracy: 500 }).error.fields.reason.code, 'val.vague_location');
  s.call(s.owner, 'settings.attendance.save', { ...s.call(s.owner, 'settings.attendance').data, exception: 'block' });
  assert.equal(punch(s, s.manager, { ...far, reason: 'x' }).error.code, 'OUTSIDE');
});

test('a punch kept on the phone is checked, and refused when too old; a wrong clock is corrected', () => {
  const s = hr();
  const late = punch(s, s.staff, { device_ts: ago(180) });
  assert.equal(late.data.status, 'check');
  assert.equal(punch(s, s.manager, { device_ts: ago(8 * 24 * 60) }).error.code, 'TOO_OLD');
  // The manager's phone is 30 minutes fast: the punch is corrected and marked.
  const reply = s.server.post({ action: 'attendance.punch', token: s.manager, op_id: crypto.randomUUID(), contract: 1, client_now: new Date(Date.now() + 30 * 60000).toISOString(), payload: { type: 'in', device_ts: new Date(Date.now() + 30 * 60000).toISOString(), lat: SHOP.lat, lng: SHOP.lng, accuracy: 5 } }).data;
  assert.equal(reply.data.status, 'ok');
  assert.ok(Math.abs(Date.parse(reply.data.at) - Date.now()) < 60000);
  const mine = s.call(s.manager, 'attendance.mine', {}).data.days[0].punches[0];
  assert.deepEqual(json(mine.flags), ['skew']);
});

test('checks: nobody decides their own, and a manager\'s waits for a shareholder', () => {
  const s = hr();
  const far = { lat: SHOP.lat + 0.01, lng: SHOP.lng, reason: 'Bank' };
  const staffPunch = punch(s, s.staff, far).record_id;
  const managerPunch = punch(s, s.manager, far).record_id;
  const managerSees = s.call(s.manager, 'attendance.checks').data;
  assert.deepEqual(managerSees.punches.map((p) => p.id), [staffPunch]);
  assert.equal(s.call(s.manager, 'attendance.decide', { kind: 'punch', id: managerPunch, decision: 'accept' }).data.error.code, 'OWN_ENTRY');
  assert.equal(s.call(s.manager, 'attendance.decide', { kind: 'punch', id: staffPunch, decision: 'reject' }).data.error.fields.note.code, 'val.required');
  assert.equal(s.call(s.manager, 'attendance.decide', { kind: 'punch', id: staffPunch, decision: 'accept' }).data.status, 'saved');
  assert.equal(s.call(s.owner, 'attendance.decide', { kind: 'punch', id: managerPunch, decision: 'reject', note: 'Not agreed' }).data.status, 'saved');
  assert.ok(['not_in', 'absent'].includes(s.call(s.manager, 'attendance.today').data.day.state));
});

test('a correction waits for a manager, then becomes a punch that replaces the wrong one', () => {
  const s = hr();
  const wrong = punch(s, s.staff, {}).record_id;
  const date = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
  const asked = s.call(s.staff, 'attendance.fix', { date, type: 'in', time: '00:01', replaces: wrong, reason: 'Phone was off; I came at the start' }).data;
  assert.equal(asked.data.final, false);
  assert.equal(s.call(s.manager, 'attendance.checks').data.fixes.length, 1);
  assert.equal(s.call(s.manager, 'attendance.decide', { kind: 'fix', id: asked.record_id, decision: 'accept' }).data.status, 'saved');
  const day = s.call(s.staff, 'attendance.mine', {}).data.days[0];
  assert.deepEqual(day.punches.map((p) => [p.source, p.status]), [['fix', 'ok'], ['phone', 'replaced']]);
  // A manager adding a missing punch for staff is final; for themselves it waits.
  assert.equal(s.call(s.manager, 'attendance.fix', { staff_id: s.ids.staff_rec, date, type: 'out', time: '00:02', reason: 'Forgot' }).data.data.final, true);
  assert.equal(s.call(s.manager, 'attendance.fix', { date, type: 'in', time: '00:03', reason: 'Forgot' }).data.data.final, false);
  assert.equal(s.call(s.staff, 'attendance.fix', { staff_id: s.ids.manager_rec, date, type: 'in', time: '00:03', reason: 'x' }).data.error.code, 'FORBIDDEN');
});

test('a shop device signs punches with the person\'s PIN; wrong PINs lock the PIN for a while', () => {
  const s = hr();
  const reg = s.call(s.manager, 'attendance.device.register', { name: 'Counter tablet' }).data;
  const { device_id: deviceId, secret } = reg.data;
  assert.equal(JSON.stringify(s.state).split(secret).length - 1, 1, 'the secret is kept once, on the device row');
  const ts = new Date().toISOString();
  const sig = crypto.createHmac('sha256', secret).update(`${deviceId}|${ts}`).digest('hex');
  const list = s.call(null, 'attendance.device.staff', { device_id: deviceId, ts, sig }).data;
  const sumi = list.staff.find((x) => x.name === 'Sumi');
  assert.equal(sumi.next, 'in');
  assert.equal(sumi.pin_hash, undefined);
  assert.equal(s.call(null, 'attendance.device.staff', { device_id: deviceId, ts, sig: 'ab'.repeat(32) }).error.code, 'DEVICE');

  const signed = (pin, fields = {}) => {
    const key = crypto.pbkdf2Sync(pin, Buffer.from(sumi.pin_salt, 'hex'), sumi.pin_iter, 32, 'sha256').toString('hex');
    const p = { punch_id: crypto.randomUUID(), staff_id: sumi.id, type: 'in', device_ts: new Date().toISOString(), lat: null, lng: null, accuracy: null, device_id: deviceId, ...fields };
    return { ...p, sig: crypto.createHmac('sha256', secret + key).update(punchText(p)).digest('hex') };
  };
  const ok = s.call(null, 'attendance.device.punch', signed('2468')).data;
  assert.equal(ok.data.status, 'ok');
  // A punch changed after signing is refused.
  const changed = { ...signed('2468', { type: 'out' }), type: 'in' };
  assert.equal(s.call(null, 'attendance.device.punch', changed).data.error.code, 'PIN_WRONG');
  for (let i = 0; i < 4; i++) s.call(null, 'attendance.device.punch', signed('0000', { type: 'out' }));
  assert.equal(s.call(null, 'attendance.device.punch', signed('2468', { type: 'out' })).data.error.code, 'PIN_LOCKED');

  const dev = s.call(s.manager, 'attendance.devices').data.items[0];
  assert.ok(dev.last_punch_at);
  s.call(s.manager, 'attendance.device.save', { id: dev.id, version: dev.version, name: dev.name, status: 'inactive' });
  assert.equal(s.call(null, 'attendance.device.punch', signed('2468')).data.error.code, 'DEVICE');
});

test('the board shows everyone\'s day; staff set their own PIN', () => {
  const s = hr();
  punch(s, s.staff, {});
  const rows = s.call(s.manager, 'attendance.board', {}).data.rows;
  assert.deepEqual(rows.map((r) => [r.staff.name, ['in', 'incomplete'].includes(r.state)]), [['Owner', false], ['Rafi', false], ['Sumi', true]]);
  assert.equal(s.call(s.staff, 'attendance.board', {}).error.code, 'FORBIDDEN');
  assert.equal(s.call(s.staff, 'attendance.pin', { pin: '12' }).data.error.fields.pin.code, 'val.pin');
  assert.equal(s.call(s.staff, 'attendance.pin', { pin: '1357' }).data.status, 'saved');
});
