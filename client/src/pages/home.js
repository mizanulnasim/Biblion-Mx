// Home: a greeting, anything saved on this phone, and the person's shortcuts.

import { html, render } from '../ui/html.js';
import { icon } from '../ui/icons.js';
import { t } from '../core/i18n.js';
import { can, getState, subscribe } from '../core/state.js';
import { dateShort, partOfDay } from '../core/format.js';
import { NAV } from './nav.js';

const GREETINGS = { morning: 'home.greeting_morning', afternoon: 'home.greeting_afternoon', evening: 'home.greeting_evening' };

function view(state) {
  const now = Date.now();
  const shortcuts = NAV.filter((item) => item.path !== '/' && (!item.perm || can(item.perm)));
  return html`
    <section class="hero">
      <p class="hero-date">${dateShort(new Date(now).toISOString())}</p>
      <h2 class="hero-title">${t(GREETINGS[partOfDay(now)], { name: state.meta.user.display_name })}</h2>
    </section>
    ${state.queued || state.attention ? html`
      <a class="notice ${state.attention ? 'notice-warn' : ''}" href="#/saved">
        ${icon('phone')}
        <span>${state.attention ? t('home.saved_attention', { count: state.attention }) : t('home.saved_waiting', { count: state.queued })}</span>
      </a>` : ''}
    <h3 class="section-title">${t('home.shortcuts')}</h3>
    <ul class="tiles">
      ${shortcuts.map((item) => html`
        <li><a class="tile" href="#${item.path}">${icon(item.icon)}<span class="tile-title">${t(item.title)}</span><span class="tile-text">${t(item.hint)}</span></a></li>`)}
    </ul>`;
}

export const homePage = {
  path: '/',
  title: 'nav.home',
  mount(el) {
    const draw = () => render(el, view(getState()));
    draw();
    return subscribe(draw);
  },
};
