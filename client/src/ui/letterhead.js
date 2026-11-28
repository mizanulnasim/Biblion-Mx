// The letterhead on letters, payslips and reports: the logo, the shop's name
// and description, address, phone and email (Settings → Shop); and the
// signature lines at a document's foot.

import { html } from './html.js';
import { getState } from '../core/state.js';

export function letterhead() {
  const shop = getState().meta.shop;
  const contact = [shop.phone, shop.email].filter(Boolean).join(' · ');
  return html`<header class="letterhead">
    <img class="doc-logo" src="assets/biblion-logo.png" alt="">
    <div class="letterhead-text">
      <strong class="letterhead-name">${shop.name}</strong>
      ${shop.tagline ? html`<span>${shop.tagline}</span>` : ''}
      ${shop.address ? html`<span class="doc-address">${shop.address}</span>` : ''}
      ${contact ? html`<span>${contact}</span>` : ''}
    </div>
  </header>`;
}

// Lines to sign on, each with what it is for.
export function signatures(labels) {
  return html`<div class="signatures">${labels.map((label) => html`<span class="signature">${label}</span>`)}</div>`;
}
