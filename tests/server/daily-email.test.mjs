// The shareholders' daily warnings email on the real server bundle: sent
// once a day after closing, only to shareholders who gave an address and
// left it on, only with something to say, in their language.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shop, setSettings } from './shop.mjs';

const DAY = 86400000;
const today = () => new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
const plus = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// The shop "closes" at 00:01 and the email goes straight after, so it is
// due for yesterday whenever the test runs.
function shopWithEmail() {
  const s = shop();
  setSettings(s, 'attendance', { 'attendance.shop_open': '00:00', 'attendance.shop_close': '00:01', 'notify.after_close_min': 0 });
  s.call(s.owner, 'start.date.save', { start_date: plus(today(), -30) });
  return s;
}

test('sent once for yesterday: no shift, not closed, an entry waiting', () => {
  const s = shopWithEmail();
  assert.equal(s.call(s.manager, 'me.notify', { email: 'boss@example.com', daily: true }).data.error.code, 'FORBIDDEN');
  s.call(s.owner, 'me.notify', { email: 'owner@example.com', daily: true });
  // A manager's entry over the limit waits for a shareholder.
  s.call(s.manager, 'money.save', { kind: 'expense', date: today(), amount: 5000, account_id: s.ids.cash, category_id: s.ids.milk });
  s.server.job();
  assert.equal(s.state.mails.length, 1);
  const [mail] = s.state.mails;
  assert.equal(mail.to, 'owner@example.com');
  assert.match(mail.body, /No daily shift was entered for/);
  assert.match(mail.body, /isn't closed yet/);
  assert.match(mail.body, /1 money entry waits for your approval/);
  assert.match(mail.subject, /3 things need you/);
  // The same day is never sent twice; the next run sends today's.
  s.server.job();
  assert.equal(s.state.mails.length, 2);
  s.server.job();
  assert.equal(s.state.mails.length, 2);
});

test('nothing to say, turned off, or no address: no email; Bangla for a Bangla reader', () => {
  const s = shopWithEmail();
  s.call(s.owner, 'start.date.save', { start_date: plus(today(), 5) });
  s.call(s.owner, 'me.notify', { email: 'owner@example.com', daily: true });
  s.server.job();
  assert.equal(s.state.mails.length, 0);
  // Something to say, but the email is turned off.
  s.call(s.manager, 'money.save', { kind: 'expense', date: today(), amount: 5000, account_id: s.ids.cash, category_id: s.ids.milk });
  s.call(s.owner, 'me.notify', { email: 'owner@example.com', daily: false });
  s.server.job();
  assert.equal(s.state.mails.length, 0);
  s.call(s.owner, 'me.settings', { lang: 'bn' });
  s.call(s.owner, 'me.notify', { email: 'owner@example.com', daily: true });
  s.state.props.DAILY_EMAIL_DAY = '';
  s.server.job();
  assert.match(s.state.mails[0].body, /আপনার অনুমোদনের অপেক্ষায়/);
});
