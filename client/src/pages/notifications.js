// Notifications: the last 12 months, newest first, grouped by day. Search
// by any word, filter by part of the app, or show only unread; "Load more"
// brings older ones; "Mark all read" clears the bell; each can be dismissed.

import { html, on, render } from '../ui/html.js';
import { emptyState, errorBox } from '../ui/feedback.js';
import { errorText } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { onArea } from '../core/live.js';
import { setState } from '../core/state.js';
import { dateShort } from '../core/format.js';
import { NOTIFY_AREAS } from '../../../shared/contract/actions.js';
import { notificationItem } from './notify-common.js';

const AREA_LABEL = { accounts: 'ntf.area.accounts', books: 'ntf.area.books', cafe: 'ntf.area.cafe', hr: 'ntf.area.hr', tasks: 'ntf.area.tasks' };
const SEARCH_WAIT_MS = 300;

// The day a notification came, in Bangladesh.
const dayOf = (at) => new Date(Date.parse(at) + 6 * 3600000).toISOString().slice(0, 10);

function listView(items) {
  if (!items.length) return emptyState(t('ntf.none'));
  const days = [];
  for (const n of items) {
    const day = dayOf(n.at);
    if (!days.length || days[days.length - 1].day !== day) days.push({ day, items: [] });
    days[days.length - 1].items.push(n);
  }
  return days.map((d) => html`<h3 class="section-title">${dateShort(`${d.day}T06:00:00Z`)}</h3>
    <ul class="notify-list">${d.items.map((n) => notificationItem(n, html`
      ${n.read ? '' : html`<button type="button" class="btn btn-small" data-act="read" data-id="${n.id}">${t('ntf.mark_read')}</button>`}
      <button type="button" class="btn btn-small" data-act="dismiss" data-id="${n.id}">${t('msg.dismiss')}</button>`))}</ul>`);
}

export const notificationsPage = {
  path: '/notifications',
  title: 'nav.notifications',
  mount(el) {
    const filters = { area: null, unread: false, q: '' };
    let items = [];
    let more = false;
    let asked = 0;
    render(el, html`<div class="list-bar">
        <input type="search" class="ntf-search" aria-label="${t('ntf.search')}" placeholder="${t('ntf.search')}" autocomplete="off">
        <select class="ntf-area" aria-label="${t('ntf.area')}"><option value="">${t('ntf.area.all')}</option>
          ${NOTIFY_AREAS.map((a) => html`<option value="${a}">${t(AREA_LABEL[a])}</option>`)}</select>
        <label><input type="checkbox" class="ntf-unread"> ${t('ntf.unread_only')}</label>
        <button type="button" class="btn" data-act="all">${t('ntf.mark_all')}</button>
      </div>
      <div class="ntf-body" aria-busy="true"></div>
      <div class="form-actions ntf-more" hidden><button type="button" class="btn" data-act="more">${t('ntf.more')}</button></div>`);
    const body = el.querySelector('.ntf-body');
    const moreBar = el.querySelector('.ntf-more');

    // Only the newest request may draw.
    async function load(append = false) {
      const mine = ++asked;
      try {
        const { data } = await read('notify.list', { ...filters, offset: append ? items.length : 0 });
        if (mine !== asked) return;
        items = append ? [...items, ...data.items] : data.items;
        more = data.more;
        render(body, listView(items));
        body.removeAttribute('aria-busy');
        moreBar.hidden = !more;
      } catch (err) {
        render(body, errorBox(errorText(err)));
      }
    }
    const refreshCount = () => read('notify.count').then((r) => setState({ unread: r.data.unread })).catch(() => {});
    const act = async (action, payload) => {
      try {
        await write(action, payload);
        await load();
        refreshCount();
      } catch (err) {
        toast(errorText(err), 'error');
      }
    };

    let timer = null;
    const onInput = (e) => {
      if (e.target.matches('.ntf-search')) {
        clearTimeout(timer);
        timer = setTimeout(() => {
          filters.q = e.target.value.trim();
          load();
        }, SEARCH_WAIT_MS);
      }
    };
    const onChange = (e) => {
      if (e.target.matches('.ntf-area')) filters.area = e.target.value || null;
      else if (e.target.matches('.ntf-unread')) filters.unread = e.target.checked;
      else return;
      load();
    };
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    const offClick = on(el, 'click', {
      seen: (e, a) => write('notify.read', { id: a.dataset.id }).then(refreshCount).catch(() => {}),
      read: (e, btn) => act('notify.read', { id: btn.dataset.id }),
      dismiss: (e, btn) => act('notify.dismiss', { id: btn.dataset.id }),
      all: () => act('notify.read', { id: null }),
      more: () => load(true),
    });
    const offArea = onArea('core', () => load());
    load();
    return () => {
      clearTimeout(timer);
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
      offClick();
      offArea();
    };
  },
};
