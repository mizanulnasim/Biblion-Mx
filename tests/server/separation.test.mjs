// Someone leaving, the final settlement, and letters, on the real server bundle.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop } from './shop.mjs';

const DAY = 86400000;
const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysIn = (date) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();

function team() {
  const s = shop();
  const users = s.call(s.owner, 'users.list', {}).data.items;
  const userId = (name) => users.find((u) => u.username === name).id;
  const add = (fields) => s.call(s.owner, 'staff.save', { status: 'active', joined_on: plus(today(), -200), days_off: [], ...fields }).data.record_id;
  s.ids.sumi = add({ name: 'Sumi', user_id: userId('staff'), position: 'Café assistant', salary: 12000, work_start: '10:00', work_end: '18:00' });
  s.ids.rafi = add({ name: 'Rafi', user_id: userId('manager'), salary: 20000 });
  // Calendar months here (the accounting month has its own tests).
  s.call(s.owner, 'settings.payroll.save', { divisor: 'fixed_30', food_rule: 'every_day', food_rates: [{ from: '2000-01-01', amount: 0 }], month_start_day: 1 });
  return s;
}

test('a resignation: asked, accepted, tasks handed over, settled, completed', () => {
  const s = team();
  // Notice today, last day yesterday: in the past, so it can be completed.
  const last = plus(today(), -1);
  const asked = s.call(s.staff, 'separation.submit', { kind: 'resignation', notice_date: plus(last, -10), last_day: last, reason: 'Moving to Chattogram' }).data;
  assert.equal(asked.data.accepted, false);
  assert.equal(s.call(s.staff, 'separation.submit', { kind: 'resignation', last_day: last, reason: 'x' }).data.error.code, 'OVERLAP');
  assert.equal(s.call(s.staff, 'separation.submit', { kind: 'termination', staff_id: s.ids.rafi, last_day: last, reason: 'x' }).data.error.code, 'FORBIDDEN');
  const id = asked.record_id;
  assert.equal(s.call(s.manager, 'separation.accept', { id }).data.status, 'saved');
  // Tasks go to Rafi.
  s.call(s.manager, 'tasks.create', { title: 'Order cups', staff_id: s.ids.sumi, due_date: today() });
  s.call(s.manager, 'tasks.template.save', { title: 'Wipe tables', staff_id: s.ids.sumi, repeat: 'daily', start_date: today(), status: 'active' });
  // The one-off task and the repeating task (none is made after the last day).
  assert.equal(s.call(s.manager, 'separation.handover', { id, to_staff_id: s.ids.rafi }).data.data.moved, 2);
  // Settlement: payslips must be issued first.
  const draft = s.call(s.owner, 'separation.settlement', { id }).data.figures;
  assert.ok(draft.missing_payslips.length >= 1);
  assert.equal(s.call(s.owner, 'separation.confirm', { id }).data.error.code, 'PAYSLIPS_MISSING');
  for (const month of draft.missing_payslips) s.call(s.owner, 'payroll.issue', { staff_id: s.ids.sumi, month, unpaid_absent_days: 0 });
  // 10 days' notice of 30 expected: 20 days cut at 12000/30 a day; unused leave paid at the same rate.
  const figures = s.call(s.owner, 'separation.settlement', { id, leave_days: 2 }).data.figures;
  assert.deepEqual([figures.notice_short, figures.notice_cut, figures.leave_days, figures.leave_pay], [20, 8000, 2, 800]);
  assert.equal(s.call(s.owner, 'separation.confirm', { id, leave_days: 2 }).data.status, 'saved');
  const account = s.call(s.owner, 'payroll.month', { month: last.slice(0, 7) }).data.rows.find((r) => r.staff.name === 'Sumi').account;
  assert.equal(account.settlement, 800 - 8000);
  assert.equal(account.owed, figures.owed - 7200);
  assert.equal(s.call(s.manager, 'separation.complete', { id }).data.status, 'saved');
  assert.equal(s.call(s.staff, 'meta.get').error.code, 'AUTH_REQUIRED');
  const sumi = s.call(s.owner, 'staff.list', { status: 'left' }).data.items.find((x) => x.name === 'Sumi');
  assert.equal(sumi.left_on, last);
});

test('a manager\'s leaving is for a shareholder; the last day pays only the days to it', () => {
  const s = team();
  const last = `${today().slice(0, 7)}-10`;
  const asked = s.call(s.manager, 'separation.submit', { kind: 'resignation', notice_date: plus(last, -30), last_day: last, reason: 'Studies' }).data;
  assert.equal(s.call(s.manager, 'separation.accept', { id: asked.record_id }).data.error.code, 'OWN_ENTRY');
  assert.equal(s.call(s.owner, 'separation.accept', { id: asked.record_id }).data.status, 'saved');
  const row = s.call(s.owner, 'payroll.month', { month: last.slice(0, 7) }).data.rows.find((r) => r.staff.name === 'Rafi');
  assert.equal(row.slip.employed_days, 10);
  assert.equal(row.slip.base, Math.round((20000 * 10) / 30));
  assert.equal(s.call(s.owner, 'separation.settlement', { id: asked.record_id }).data.figures.notice_short, 0);
  assert.ok(daysIn(last) >= 28);
});

test('a withdrawn resignation clears the last day', () => {
  const s = team();
  const asked = s.call(s.owner, 'separation.submit', { staff_id: s.ids.sumi, kind: 'termination', last_day: plus(today(), 20), reason: 'Shop closing the café' }).data;
  assert.equal(asked.data.accepted, true);
  assert.equal(s.call(s.owner, 'separation.complete', { id: asked.record_id }).data.error.code, 'CONFLICT');
  assert.equal(s.call(s.staff, 'separation.withdraw', { id: asked.record_id, reason: 'Kept on' }).data.status, 'saved');
  assert.equal(s.call(s.owner, 'staff.list', {}).data.items.find((x) => x.name === 'Sumi').left_on, '');
});

test('letters are filled from the record and kept as issued; templates refuse unknown placeholders', () => {
  const s = team();
  const id = s.call(s.manager, 'letters.issue', { staff_id: s.ids.sumi, kind: 'offer' }).data.record_id;
  const letter = s.call(s.staff, 'letters.get', { id }).data;
  assert.equal(letter.title, 'Offer of employment');
  assert.ok(letter.paragraphs.some((p) => p.includes('Café assistant') && p.includes('Tk 12,000')));
  assert.ok(letter.paragraphs.some((p) => p.includes('10:00 to 18:00')));
  assert.equal(s.call(s.manager, 'letters.issue', { staff_id: s.ids.sumi, kind: 'release' }).data.error.fields.kind.code, 'val.no_last_day');
  const settings = s.call(s.owner, 'settings.letters').data;
  const bad = s.call(s.owner, 'settings.letters.save', { ...settings, offer: 'Offer\n\nDear {{nmae}}' }).data;
  assert.deepEqual([bad.error.fields.offer.code, bad.error.fields.offer.params.names], ['val.placeholder', 'nmae']);
  s.call(s.owner, 'settings.letters.save', { ...settings, offer: 'Offer\n\nDear {{name}}, welcome.' });
  // The letter already issued keeps its words.
  assert.equal(s.call(s.staff, 'letters.get', { id }).data.title, 'Offer of employment');
  assert.equal(s.call(s.manager, 'letters.list', { staff_id: s.ids.sumi }).data.items.length, 1);
});
