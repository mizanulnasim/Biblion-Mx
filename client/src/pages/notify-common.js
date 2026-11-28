// A notification as a list item: its words, when, and what closed it.
// Used on Home and on the notifications page.

import { html } from '../ui/html.js';
import { t } from '../core/i18n.js';
import { dateShort, dateShortTime, monthLabel, money } from '../core/format.js';
import { kindLabel } from './money-common.js';

// A stored message's words: dates, amounts, months and money kinds in the
// person's language.
function messageText(text) {
  const params = {};
  for (const [k, v] of Object.entries(text.p || {})) {
    if (v && typeof v === 'object') {
      if ('d' in v) params[k] = dateShort(`${v.d}T06:00:00Z`);
      else if ('m' in v) params[k] = money(v.m);
      else if ('mo' in v) params[k] = v.mo ? monthLabel(v.mo) : '';
      else params[k] = kindLabel(v.k);
    } else {
      params[k] = v;
    }
  }
  return t(text.t, params);
}

// actions: the buttons after it (Home: dismiss; the page: read, dismiss).
export function notificationItem(n, actions) {
  const words = messageText(n.text);
  return html`<li class="notify-item ${n.read ? '' : 'is-unread'}">
    <span class="notify-text">${n.link ? html`<a href="#${n.link}" data-act="seen" data-id="${n.id}">${words}</a>` : words}
      <span class="muted"> · ${dateShortTime(n.at)}</span>
      ${n.done ? html`<span class="muted"> · ${messageText(n.done)}</span>` : ''}</span>
    ${actions}
  </li>`;
}
