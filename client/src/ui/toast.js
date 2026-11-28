// Short messages after an action. Errors stay until closed; others fade.

import { html, on, render } from './html.js';
import { t } from '../core/i18n.js';

let region = null;

export function toast(text, tone = 'info') {
  if (!region) {
    region = document.createElement('div');
    region.className = 'toasts';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
    on(region, 'click', { close: (e, el) => el.closest('.toast').remove() });
  }
  const item = document.createElement('div');
  item.className = `toast toast-${tone}`;
  item.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  render(item, html`<span>${text}</span><button class="icon-btn" data-act="close" aria-label="${t('common.close')}">×</button>`);
  region.append(item);
  if (tone !== 'error') setTimeout(() => item.remove(), 5000);
}
