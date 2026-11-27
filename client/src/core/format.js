// Dates and times for display, always in Bangladesh time (UTC+6, no daylight
// saving). Lists show "Sat 21 Nov"; documents show "21 Nov 2026".

import { localDigits, t } from './i18n.js';

const DHAKA_OFFSET_MS = 6 * 3600000;
const WEEKDAYS = ['date.wd.sun', 'date.wd.mon', 'date.wd.tue', 'date.wd.wed', 'date.wd.thu', 'date.wd.fri', 'date.wd.sat'];
const MONTHS = [
  'date.mon.jan', 'date.mon.feb', 'date.mon.mar', 'date.mon.apr', 'date.mon.may', 'date.mon.jun',
  'date.mon.jul', 'date.mon.aug', 'date.mon.sep', 'date.mon.oct', 'date.mon.nov', 'date.mon.dec',
];

function parts(iso) {
  const d = new Date(Date.parse(iso) + DHAKA_OFFSET_MS);
  return {
    wd: t(WEEKDAYS[d.getUTCDay()]),
    day: d.getUTCDate(),
    mon: t(MONTHS[d.getUTCMonth()]),
    year: d.getUTCFullYear(),
    time: localDigits(`${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`),
  };
}

export function dateTime(iso) {
  if (!iso) return '';
  const p = parts(iso);
  return t('date.long_time', p);
}

export function dateShortTime(iso) {
  if (!iso) return '';
  const p = parts(iso);
  return t('date.short_time', p);
}

// "10:02", Bangladesh time.
export function timeOf(iso) {
  return iso ? parts(iso).time : '';
}

// "7 h 18 min", or "18 min" under an hour, from minutes.
export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  return h ? t('date.duration', { h, m: minutes % 60 }) : t('date.minutes', { m: minutes });
}

export function dateShort(iso) {
  if (!iso) return '';
  return t('date.short', parts(iso));
}

// morning before 12:00, afternoon before 17:00, then evening (Dhaka time).
export function partOfDay(ms) {
  const hour = new Date(ms + DHAKA_OFFSET_MS).getUTCHours();
  if (hour < 12) return 'morning';
  return hour < 17 ? 'afternoon' : 'evening';
}

// Groups digits the Bangladesh way: 1,00,000 (lakh) and 1,00,00,000 (crore).
function groupDigits(whole) {
  const s = String(whole);
  if (s.length <= 3) return s;
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${s.slice(-3)}`;
}

function grouped(abs) {
  const whole = Math.trunc(abs);
  const cents = Math.round((abs - whole) * 100);
  return localDigits(groupDigits(whole) + (cents ? `.${String(cents).padStart(2, '0')}` : ''));
}

// "Tk 1,250" or "১,২৫০ টাকা"; paisa shown only when there are any.
export function money(amount) {
  const abs = Math.abs(Math.round(amount * 100)) / 100;
  return t(amount < 0 ? 'money.amount_negative' : 'money.amount', { amount: grouped(abs) });
}

// An amount in a table column: "1,250", "−1,250", or "–" for none.
export function figure(amount) {
  const abs = Math.abs(Math.round(amount * 100)) / 100;
  if (!abs) return '–';
  return `${amount < 0 ? '−' : ''}${grouped(abs)}`;
}

// "Nov 2026" from "2026-11".
export function monthLabel(month) {
  return t('date.month_year', { mon: t(MONTHS[Number(month.slice(5, 7)) - 1]), year: localDigits(month.slice(0, 4)) });
}

// Today's date in Bangladesh, as YYYY-MM-DD.
export function today() {
  return new Date(Date.now() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}
