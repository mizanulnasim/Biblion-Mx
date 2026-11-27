// Message text on the server, for emails, in a person's language. The
// build puts the messages in the server bundle as BIBLION_LOCALES.

import { digitsFor, formatMessage, groupDigits } from '../../shared/lib/messages.js';

const WEEKDAYS = ['date.wd.sun', 'date.wd.mon', 'date.wd.tue', 'date.wd.wed', 'date.wd.thu', 'date.wd.fri', 'date.wd.sat'];
const MONTHS = [
  'date.mon.jan', 'date.mon.feb', 'date.mon.mar', 'date.mon.apr', 'date.mon.may', 'date.mon.jun',
  'date.mon.jul', 'date.mon.aug', 'date.mon.sep', 'date.mon.oct', 'date.mon.nov', 'date.mon.dec',
];

export function text(lang, id, params = {}) {
  const messages = (globalThis.BIBLION_LOCALES || {})[lang] || {};
  return id in messages ? formatMessage(lang, messages[id], params) : id;
}

// "Sat 12 Dec" from "2026-12-12".
export function dayText(lang, date) {
  const d = new Date(`${date}T00:00:00Z`);
  return text(lang, 'date.short', { wd: text(lang, WEEKDAYS[d.getUTCDay()]), day: d.getUTCDate(), mon: text(lang, MONTHS[d.getUTCMonth()]) });
}

// "Tk 1,250" or "১,২৫০ টাকা".
export function moneyText(lang, amount) {
  const abs = Math.abs(Math.round(amount * 100)) / 100;
  const whole = Math.trunc(abs);
  const cents = Math.round((abs - whole) * 100);
  const figures = digitsFor(lang, groupDigits(whole) + (cents ? `.${String(cents).padStart(2, '0')}` : ''));
  return text(lang, amount < 0 ? 'money.amount_negative' : 'money.amount', { amount: figures });
}
