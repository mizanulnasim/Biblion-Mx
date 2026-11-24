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

export function dateShort(iso) {
  return t('date.short', parts(iso));
}

// 'morning' | 'afternoon' | 'evening' in Bangladesh time.
export function partOfDay(ms) {
  const hour = new Date(ms + DHAKA_OFFSET_MS).getUTCHours();
  if (hour < 12) return 'morning';
  return hour < 17 ? 'afternoon' : 'evening';
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
