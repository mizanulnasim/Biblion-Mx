// Notices: announcements, and my job description and procedures, to read
// and acknowledge. Managers write announcements (with who has read them)
// and job descriptions and procedures (with who has acknowledged them).

import { html, on, render } from '../ui/html.js';
import { chip, emptyState, errorBox, staleNotice } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, errorText, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { read, write } from '../core/api.js';
import { can } from '../core/state.js';
import { onArea } from '../core/live.js';
import { dateShort } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';

const KIND = { announcement: 'notices.kind.announcement', jd: 'notices.kind.jd', sop: 'notices.kind.sop' };
const AUDIENCE = { everyone: 'notices.audience.everyone', staff: 'notices.audience.staff', managers: 'notices.audience.managers', people: 'notices.audience.people' };

function docItem(d) {
  return html`<li class="check-item doc-item">
    <details data-id="${d.id}" ${d.read ? '' : 'data-unread="1"'}>
      <summary><strong>${d.title}</strong> ${d.kind !== 'announcement' ? chip(t(KIND[d.kind]), 'muted') : ''}
        ${d.read ? '' : chip(t('notices.new'), 'warn')} ${d.acked ? chip(t('notices.acked'), 'ok') : ''}
        <span class="muted">${dateShort(d.published_at)}</span></summary>
      <div class="letter-text">${d.body}</div>
    </details>
    ${d.needs_ack && !d.acked ? html`<span class="check-actions"><button type="button" class="btn btn-small btn-primary" data-act="ack" data-id="${d.id}">${t('notices.ack')}</button></span>` : ''}
  </li>`;
}

export const noticesPage = {
  path: '/notices',
  title: 'nav.notices',
  mount(el) {
    async function load() {
      try {
        const { data, cachedAt } = await read('docs.mine');
        render(el, html`${staleNotice(cachedAt)}
          ${can('announcements.manage') || can('responsibilities.manage') ? html`<div class="list-bar">
            ${can('announcements.manage') ? html`<a class="btn" href="#/notices/manage?kind=announcement">${t('notices.manage_announcements')}</a>` : ''}
            ${can('responsibilities.manage') ? html`<a class="btn" href="#/notices/manage?kind=procedures">${t('notices.manage_procedures')}</a>` : ''}</div>` : ''}
          <section class="panel"><h2 class="section-title">${t('notices.announcements')}</h2>
            ${data.announcements.length ? html`<ul class="waiting-list">${data.announcements.map(docItem)}</ul>` : emptyState(t('notices.none'))}</section>
          <section class="panel"><h2 class="section-title">${t('notices.procedures')}</h2>
            ${data.procedures.length ? html`<ul class="waiting-list">${data.procedures.map(docItem)}</ul>` : emptyState(t('notices.no_procedures'))}</section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    // Opening an unread notice marks it read.
    const onToggle = (e) => {
      const box = e.target;
      if (box.tagName !== 'DETAILS' || !box.open || !box.dataset.unread) return;
      delete box.dataset.unread;
      write('docs.mark', { id: box.dataset.id, ack: false });
    };
    el.addEventListener('toggle', onToggle, true);
    const offClick = on(el, 'click', {
      ack: async (e, btn) => {
        btn.disabled = true;
        const reply = await write('docs.mark', { id: btn.dataset.id, ack: true });
        if (reply.status === 'saved' || reply.status === 'queued') {
          toast(t('notices.acked_toast'));
          load();
        }
      },
    });
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      el.removeEventListener('toggle', onToggle, true);
      offClick();
      offArea();
    };
  },
};

function editDoc(doc, kinds, staff, onDone) {
  const announcement = kinds[0] === 'announcement';
  const values = doc ? { ...doc } : { kind: kinds[0], audience: 'everyone', status: 'active', needs_ack: false };
  if (doc) for (const id of doc.staff_ids) values[`person_${id}`] = true;
  const fields = [
    ...(kinds.length > 1 ? [{ name: 'kind', label: t('notices.kind'), type: 'select', required: true, options: kinds.map((k) => ({ value: k, label: t(KIND[k]) })) }] : []),
    { name: 'title', label: t('tasks.title'), required: true },
    { name: 'body', label: t('notices.body'), type: 'textarea', required: true, help: t('notices.body_help') },
    { name: 'audience', label: t('notices.audience'), type: 'select', required: true, options: Object.keys(AUDIENCE).map((k) => ({ value: k, label: t(AUDIENCE[k]) })) },
    ...staff.map((s) => ({ name: `person_${s.id}`, label: s.name, type: 'checkbox' })),
    ...(announcement ? [
      { name: 'needs_ack', label: t('notices.needs_ack'), type: 'checkbox', help: t('notices.needs_ack_help') },
      { name: 'show_until', label: t('notices.show_until'), type: 'date', help: t('notices.show_until_help') },
    ] : []),
    { name: 'status', label: t('users.status'), type: 'select', required: true, options: [{ value: 'active', label: t('users.active') }, { value: 'archived', label: t('notices.archived') }] },
  ];
  const dialog = formDialog(doc ? doc.title : t(announcement ? 'notices.new_announcement' : 'notices.new_procedure'), formView({
    submit: doc ? t('common.save') : t('notices.publish'),
    values,
    fields,
    extra: doc ? html`<p class="help">${t('notices.version_help', { n: doc.version_no })}</p>` : '',
  }));
  const form = dialog.querySelector('form.form');
  for (const area of form.querySelectorAll('textarea')) area.rows = 8;
  const showPeople = () => {
    for (const s of staff) form.elements[`person_${s.id}`].closest('.field').hidden = form.elements.audience.value !== 'people';
  };
  form.elements.audience.addEventListener('change', showPeople);
  showPeople();
  bindForm(form, {
    schema: ACTIONS['docs.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({
      id: doc ? doc.id : null, version: doc ? doc.version : null, kind: v.kind || kinds[0], title: v.title, body: v.body, audience: v.audience,
      staff_ids: staff.filter((s) => v[`person_${s.id}`]).map((s) => ({ id: s.id })), needs_ack: Boolean(v.needs_ack),
      show_until: v.show_until || null, status: v.status,
    }),
    onSubmit: (v) => write('docs.save', v),
    onSaved: (reply) => {
      dialog.close();
      toast(t(reply.data && reply.data.new_version ? 'notices.new_version' : 'setup.saved'));
      onDone();
    },
  });
}

export const manageNoticesPage = {
  path: '/notices/manage',
  title: 'nav.notices',
  perm: 'announcements.manage|responsibilities.manage',
  mount(el, { query }) {
    const kind = query.kind === 'procedures' ? 'procedures' : 'announcement';
    const kinds = kind === 'announcement' ? ['announcement'] : ['jd', 'sop'];
    let data = null;
    async function load() {
      try {
        data = (await read('docs.manage', { kind })).data;
        render(el, html`<div class="list-bar"><button type="button" class="btn btn-primary" data-act="add">${t(kind === 'announcement' ? 'notices.new_announcement' : 'notices.new_procedure')}</button></div>
          <section class="panel">${data.items.length ? html`<ul class="waiting-list">${data.items.map((d) => {
            const done = d.people.filter((p) => (d.needs_ack ? p.acked : p.read));
            const waiting = d.people.filter((p) => !(d.needs_ack ? p.acked : p.read));
            return html`<li class="check-item">
              <span><strong>${d.title}</strong> ${chip(t(KIND[d.kind]), 'muted')} ${d.status === 'archived' ? chip(t('notices.archived'), 'muted') : ''}
                <span class="muted">${t(AUDIENCE[d.audience])} · ${dateShort(d.published_at)}</span></span>
              <span>${t(d.needs_ack ? 'notices.acked_count' : 'notices.read_count', { done: done.length, total: d.people.length })}</span>
              ${waiting.length ? html`<span class="muted">${t('notices.waiting_for', { names: waiting.map((p) => p.name).join(', ') })}</span>` : ''}
              <span class="check-actions"><button type="button" class="btn btn-small" data-act="edit" data-id="${d.id}">${t('common.edit')}</button></span>
            </li>`;
          })}</ul>` : emptyState(t('notices.none_written'))}</section>`);
      } catch (err) {
        render(el, errorBox(errorText(err)));
      }
    }
    const offClick = on(el, 'click', {
      add: () => editDoc(null, kinds, data.staff, load),
      edit: (e, btn) => editDoc(data.items.find((d) => d.id === btn.dataset.id), kinds, data.staff, load),
    });
    const offArea = onArea('hr', load);
    render(el, html`<div aria-busy="true"></div>`);
    load();
    return () => {
      offClick();
      offArea();
    };
  },
};
