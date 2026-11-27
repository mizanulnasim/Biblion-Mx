// The shareholders' daily warnings email (owner decision): sent the set
// minutes after the shop closes, only to shareholders who added an address
// in My settings and left it on, and only when there is something to say:
// money overdue, what waits for their approval, the day's shift missing or
// the day not closed, and the drawer short or over. In their language.

import { effectivePermissions, roleById } from '../../shared/schema/permissions.js';
import { dhakaDate } from '../../shared/hr/attendance.js';
import { addDays } from '../../shared/hr/plan.js';
import { getProp, sendMail, setProp } from '../platform.js';
import { setting } from '../kernel/settings.js';
import { dayText, moneyText, text } from '../kernel/i18n.js';
import { isDayClosed } from './closing.js';
import { salaryOverdueList } from './payroll.js';
import { profitOverdue } from './month.js';
import { publishersOverdue } from './suppliers.js';
import { openingWaiting } from './stocktake.js';
import { leaveWaiting } from './leave.js';
import { rotaWaiting } from './rota.js';
import { detailsWaiting } from './staff.js';

const LAST_DAY = 'DAILY_EMAIL_DAY';
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// The request context a job uses to see what a user would see.
function ctxFor(db, user) {
  const permissions = new Set(effectivePermissions(user));
  return { db, user, level: roleById(user.role_id).level, can: (perm) => permissions.has(perm) };
}

// The warnings for one shareholder about day `date`, as lines of text.
function warnings(ctx, date, lang) {
  const { db } = ctx;
  const lines = [];
  const say = (id, params = {}) => lines.push(text(lang, id, params));
  for (const s of salaryOverdueList(db)) say('mail.salary_overdue', { name: s.name, amount: moneyText(lang, s.left), date: dayText(lang, s.due_by) });
  const profit = profitOverdue(ctx);
  if (profit) say('mail.profit_overdue', { amount: moneyText(lang, profit) });
  for (const p of publishersOverdue(ctx)) say('home.publisher_overdue', { name: p.name, since: dayText(lang, p.since), amount: moneyText(lang, p.owed) });
  const money = db.all('Transactions').filter((e) => e.status === 'active' && e.approval === 'waiting' && e.entered_by !== ctx.user.id).length;
  if (money) say('mail.money_waiting', { count: money });
  const cafe = db.all('Cafe_Orders').filter((o) => o.status === 'waiting' && o.entered_by !== ctx.user.id).length;
  if (cafe) say('mail.cafe_waiting', { count: cafe });
  if (openingWaiting(ctx)) say('home.opening_stock');
  const leave = leaveWaiting(ctx);
  if (leave) say('mail.leave_waiting', { count: leave });
  const rota = rotaWaiting(ctx);
  if (rota) say('mail.rota_waiting', { count: rota });
  const details = detailsWaiting(ctx).length;
  if (details) say('mail.details_waiting', { count: details });
  // The day itself, from the day records start.
  const start = setting(db, 'accounting.start_date') || '';
  if (date >= start) {
    const shift = db.all('Transactions').find((e) => e.kind === 'daily_shift' && e.status === 'active' && e.date === date);
    if (!shift) say('mail.no_shift', { date: dayText(lang, date) });
    else if (shift.details.short_over) say(shift.details.short_over < 0 ? 'mail.drawer_short' : 'mail.drawer_over', { date: dayText(lang, date), amount: moneyText(lang, Math.abs(shift.details.short_over)) });
    if (!isDayClosed(db, date)) say('mail.not_closed', { date: dayText(lang, date) });
  }
  return lines;
}

// Sends the email for one day to each shareholder who wants it; returns
// how many were sent.
function sendFor(db, date) {
  let sent = 0;
  for (const user of db.all('Users')) {
    const settings = user.settings || {};
    if (user.status !== 'active' || roleById(user.role_id).level < 3 || !settings.notify_email || settings.notify_daily === false) continue;
    const lang = settings.lang || 'en';
    const lines = warnings(ctxFor(db, user), date, lang);
    if (!lines.length) continue;
    const shop = setting(db, 'shop.name');
    // One refused email (Gmail's daily limit, a bad address) doesn't stop
    // the others or the hourly jobs; the count says how many went.
    try {
      sendMail(settings.notify_email, text(lang, 'mail.subject', { shop, count: lines.length, date: dayText(lang, date) }),
        `${text(lang, 'mail.greeting', { name: user.display_name })}\n\n${lines.map((l) => `• ${l}`).join('\n')}\n\n${text(lang, 'mail.footer', { shop })}\n`);
      sent++;
    } catch {
      // Not sent; tomorrow's email still goes.
    }
  }
  return sent;
}

// Hourly: once the send time for a day has passed (the shop's closing time
// plus the set minutes, which may fall after midnight), that day's email
// goes, once.
export function dailyEmail(db) {
  const nowMs = db.now.getTime();
  const today = dhakaDate(nowMs);
  const minutesNow = Math.floor(((nowMs + 6 * 3600000) % 86400000) / 60000);
  const sendAt = minutesOf(setting(db, 'attendance.shop_close')) + setting(db, 'notify.after_close_min');
  const last = getProp(LAST_DAY) || '';
  for (const [date, due] of [[addDays(today, -1), sendAt - 1440 <= minutesNow], [today, sendAt <= minutesNow]]) {
    if (!due || date <= last) continue;
    setProp(LAST_DAY, date);
    return sendFor(db, date);
  }
  return 0;
}
