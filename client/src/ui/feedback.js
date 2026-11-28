// State chips and the page states: loading, empty, error, and figures from
// the phone's copy.

import { html } from './html.js';
import { t } from '../core/i18n.js';
import { dateShortTime } from '../core/format.js';

// ---- Chips and page states ----------------------------------------------

export function chip(label, tone) {
  return html`<span class="chip chip-${tone}">${label}</span>`;
}

export function emptyState(text) {
  return html`<p class="empty">${text}</p>`;
}

export function errorBox(text) {
  return html`<div class="alert" role="alert">${text}</div>`;
}

export function staleNotice(cachedAt) {
  if (!cachedAt) return '';
  return html`<p class="stale" role="status">${t('state.cached', { time: dateShortTime(new Date(cachedAt).toISOString()) })}</p>`;
}

// Loads data for a view so that only the newest request may draw: a slow
// old reply can't overwrite a newer one. While loading, the old content
// stays and the region is marked busy.
export function latestOnly(region) {
  let seq = 0;
  return async (load, draw, fail) => {
    const mine = ++seq;
    region.setAttribute('aria-busy', 'true');
    try {
      const result = await load();
      if (mine === seq) draw(result);
    } catch (err) {
      if (mine === seq) fail(err);
    } finally {
      if (mine === seq) region.removeAttribute('aria-busy');
    }
  };
}
