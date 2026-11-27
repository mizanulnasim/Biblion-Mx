// Home: a greeting, what waits for this person (entries to approve, their
// own entries waiting for a shareholder, anything saved on this phone), and
// their shortcuts. People with a staff record punch in and out here, and
// managers see attendance checks waiting for them.

import { html, on, render } from '../ui/html.js';
import { errorBox } from '../ui/feedback.js';
import { errorText } from '../ui/form.js';
import { read } from '../core/api.js';
import { onArea } from '../core/live.js';
import { dateShortTime, money } from '../core/format.js';
import { details, kindLabel, reasonTexts } from './money-common.js';
import { openEntry } from './money-entry.js';
import { icon } from '../ui/icons.js';
import { t } from '../core/i18n.js';
import { can, getState, subscribe } from '../core/state.js';
import { dateShort, partOfDay } from '../core/format.js';
import { NAV, NAV_GROUPS } from './nav.js';
import { punchCard, startPunch } from './attendance-common.js';

const GREETINGS = { morning: 'home.greeting_morning', afternoon: 'home.greeting_afternoon', evening: 'home.greeting_evening' };

// Entries waiting for a shareholder, with why each waits.
function waitingView(home) {
  if (!home) return '';
  if (home.error) return errorBox(home.error);
  return html`
    ${home.waiting.length ? html`<section class="panel waiting">
      <h3 class="section-title">${t('home.waiting_for_you', { count: home.waiting.length })}</h3>
      <ul class="waiting-list">${home.waiting.map((e) => html`<li>
        <button type="button" class="waiting-item" data-act="open" data-id="${e.id}">
          <span class="waiting-main"><strong>${kindLabel(e.kind)} · ${money(e.amount)}</strong> <span class="muted">${details(e)}</span></span>
          <span class="muted">${t('money.by_at', { name: e.entered_by_name, time: dateShortTime(e.created_at) })}</span>
          <span class="waiting-why">${reasonTexts(e.wait_reasons).join(' · ')}</span>
        </button></li>`)}</ul>
    </section>` : ''}
    ${home.today && !home.today.shift ? html`<a class="notice notice-warn" href="#/daily">${icon('daily')}<span>${t('home.shift_todo')}</span></a>` : ''}
    ${home.today && home.today.shift && !home.today.closed ? html`<a class="notice" href="#/closing">${icon('lock')}<span>${t('home.close_todo')}</span></a>` : ''}
    ${home.mine_waiting ? html`<a class="notice" href="#/money?state=waiting">${icon('money')}
      <span>${t('home.mine_waiting', { count: home.mine_waiting })}</span></a>` : ''}`;
}

function attendanceView(att) {
  if (!att) return '';
  if (att.error) return errorBox(att.error);
  return html`${att.staff && att.day ? punchCard(att) : ''}
    ${att.checks ? html`<a class="notice notice-warn" href="#/attendance">${icon('clock')}<span>${t('home.attendance_checks', { count: att.checks })}</span></a>` : ''}
    ${att.rota ? html`<a class="notice notice-warn" href="#/rota">${icon('daily')}<span>${t('home.rota_waiting', { count: att.rota })}</span></a>` : ''}
    ${att.leave ? html`<a class="notice notice-warn" href="#/leave">${icon('badge')}<span>${t('home.leave_waiting', { count: att.leave })}</span></a>` : ''}`;
}

function view(state, home, att) {
  const now = Date.now();
  const shortcuts = NAV.filter((item) => item.path !== '/' && (!item.perm || can(item.perm)));
  return html`
    <section class="hero">
      <p class="hero-date">${dateShort(new Date(now).toISOString())}</p>
      <h2 class="hero-title">${t(GREETINGS[partOfDay(now)], { name: state.meta.user.display_name })}</h2>
    </section>
    ${attendanceView(att)}
    ${waitingView(home)}
    ${state.queued || state.attention ? html`
      <a class="notice ${state.attention ? 'notice-warn' : ''}" href="#/saved">
        ${icon('phone')}
        <span>${state.attention ? t('home.saved_attention', { count: state.attention }) : t('home.saved_waiting', { count: state.queued })}</span>
      </a>` : ''}
    ${NAV_GROUPS.map((g) => {
      const mine = shortcuts.filter((item) => item.group === g.id);
      return mine.length ? html`<h3 class="section-title">${t(g.label)}</h3>
        <ul class="tiles">${mine.map((item) => html`
          <li><a class="tile" href="#${item.path}">${icon(item.icon)}<span class="tile-title">${t(item.title)}</span><span class="tile-text">${t(item.hint)}</span></a></li>`)}
        </ul>` : '';
    })}`;
}

export const homePage = {
  path: '/',
  title: 'nav.home',
  mount(el) {
    let home = null;
    let att = null;
    const draw = () => render(el, view(getState(), home, att));
    const loadAttendance = async () => {
      if (!can('self.staff|attendance.manage|schedule.manage|leave.approve')) return;
      try {
        att = (await read('attendance.today')).data;
      } catch (err) {
        att = { error: errorText(err) };
      }
      draw();
    };
    const load = async () => {
      if (!can('acc.entry')) return;
      try {
        home = (await read('home.get')).data;
      } catch (err) {
        home = { error: errorText(err) };
      }
      draw();
    };
    draw();
    load();
    loadAttendance();
    const unsubscribe = subscribe(draw);
    const offArea = onArea('money', load);
    const offHr = onArea('hr', loadAttendance);
    const offClick = on(el, 'click', {
      open: (e, btn) => openEntry(btn.dataset.id, load),
      punch: (e, btn) => startPunch(btn, loadAttendance),
    });
    return () => {
      unsubscribe();
      offArea();
      offHr();
      offClick();
    };
  },
};
