// The frame around every page: top bar, menu (side bar on wide screens, a
// drawer on phones), the bottom bar on phones, and the connection dot with
// the number of entries saved on this phone.

import { html, on, render } from './html.js';
import { icon } from './icons.js';
import { holdDropped } from './files.js';
import { t } from '../core/i18n.js';
import { can, getState, subscribe } from '../core/state.js';
import { roleById } from '../../../shared/schema/permissions.js';

function visible(items) {
  return items.filter((item) => !item.perm || can(item.perm));
}

function connection(state) {
  const label = state.online
    ? t('shell.online')
    : t('shell.offline');
  return html`
    <a class="conn ${state.online ? 'is-online' : 'is-offline'}" href="#/saved" title="${label}">
      <span class="conn-dot" aria-hidden="true"></span>
      <span class="conn-label">${label}</span>
      ${state.queued ? html`<span class="badge">${t('shell.queued', { count: state.queued })}</span>` : ''}
    </a>`;
}

function navView(items, groups, path, state) {
  const user = state.meta.user;
  const role = roleById(user.role_id);
  return html`
    <div class="nav-head">
      <img class="nav-logo" src="assets/biblion-logo.png" alt="Biblion">
      <button class="icon-btn nav-close" data-act="close-menu" aria-label="${t('shell.close_menu')}">${icon('close')}</button>
    </div>
    <div class="nav-user">
      <span class="avatar" aria-hidden="true">${user.display_name.slice(0, 1).toUpperCase()}</span>
      <span><strong>${user.display_name}</strong><br><span class="muted">${role ? t(role.name) : ''}</span></span>
    </div>
    ${groups.map((g) => {
      const mine = visible(items).filter((item) => item.group === g.id);
      return mine.length ? html`<p class="nav-group">${t(g.label)}</p><ul class="nav-list">
        ${mine.map((item) => html`
        <li><a href="#${item.path}" class="nav-link ${item.path === path ? 'is-current' : ''}" ${item.path === path ? html`aria-current="page"` : ''}>
          ${icon(item.icon)}<span>${t(item.title)}</span>
          ${item.path === '/saved' && state.queued ? html`<span class="badge">${state.queued}</span>` : ''}
        </a></li>`)}
      </ul>` : '';
    })}
    <button class="nav-link nav-signout" data-act="sign-out">${icon('signout')}<span>${t('shell.sign_out')}</span></button>`;
}

function bottomView(items, path) {
  return html`${visible(items).filter((i) => i.bottom).map((item) => html`
    <a href="#${item.path}" class="bottom-link ${item.path === path ? 'is-current' : ''}">${icon(item.icon)}<span>${t(item.title)}</span></a>`)}
    <button class="bottom-link" data-act="open-menu">${icon('menu')}<span>${t('shell.menu')}</span></button>`;
}

// Files dragged over the app show "Drop to upload"; dropped anywhere, they
// open the upload page. (The upload page's own zone handles its drops.)
function dropAnywhere(app) {
  const layer = document.createElement('div');
  layer.className = 'drop-layer';
  layer.hidden = true;
  layer.textContent = t('intake.drop_anywhere');
  app.append(layer);
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer ? e.dataTransfer.types : [])].includes('Files');
  const onEnter = (e) => {
    if (!hasFiles(e) || e.target.closest('[data-role="zone"]')) return;
    depth++;
    layer.hidden = false;
  };
  const onLeave = (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) layer.hidden = true;
  };
  const onOver = (e) => {
    if (hasFiles(e) && !e.target.closest('[data-role="zone"]')) e.preventDefault();
  };
  const onDrop = (e) => {
    if (!hasFiles(e) || e.target.closest('[data-role="zone"]')) return;
    e.preventDefault();
    depth = 0;
    layer.hidden = true;
    holdDropped(e.dataTransfer.files);
    location.hash = `#/upload?dropped=${Date.now()}`;
  };
  window.addEventListener('dragenter', onEnter);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('dragover', onOver);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragenter', onEnter);
    window.removeEventListener('dragleave', onLeave);
    window.removeEventListener('dragover', onOver);
    window.removeEventListener('drop', onDrop);
    layer.remove();
  };
}

// items: [{path, group, title, icon, perm?, bottom?}]; groups: [{id, label}]
export function mountShell(root, { items, groups, onSignOut }) {
  render(root, html`
    <div class="app">
      <header class="topbar">
        <button class="icon-btn menu-btn" data-act="open-menu" aria-label="${t('shell.menu')}">${icon('menu')}</button>
        <h1 class="page-title"></h1>
        ${can('intake.upload') ? html`<a class="icon-btn" href="#/upload" aria-label="${t('nav.upload')}" title="${t('nav.upload')}">${icon('upload')}</a>` : ''}
        <div class="conn-slot"></div>
      </header>
      <nav class="sidenav" aria-label="${t('shell.menu')}"></nav>
      <div class="scrim" data-act="close-menu"></div>
      <main class="outlet" tabindex="-1"></main>
      <nav class="bottombar" aria-label="${t('shell.shortcuts')}"></nav>
    </div>`);
  const app = root.querySelector('.app');
  const nav = root.querySelector('.sidenav');
  const bottom = root.querySelector('.bottombar');
  const title = root.querySelector('.page-title');
  const conn = root.querySelector('.conn-slot');
  let path = '/';

  const draw = () => {
    const state = getState();
    render(nav, navView(items, groups, path, state));
    render(bottom, bottomView(items, path));
    render(conn, connection(state));
  };
  const unsubscribe = subscribe(draw);
  const offDrop = can('intake.upload') ? dropAnywhere(app) : () => {};
  const offClick = on(app, 'click', {
    'open-menu': () => app.classList.add('menu-open'),
    'close-menu': () => app.classList.remove('menu-open'),
    'sign-out': () => onSignOut(),
  });
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) app.classList.remove('menu-open');
  });

  return {
    outlet: root.querySelector('.outlet'),
    setPage(page, nextPath) {
      path = nextPath;
      title.textContent = t(page.title);
      document.title = `${t(page.title)} · Biblion`;
      draw();
    },
    destroy() {
      unsubscribe();
      offClick();
      offDrop();
    },
  };
}
