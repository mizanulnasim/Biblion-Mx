// The activity log: every change, who made it and when. Read-only.

import { html } from '../ui/html.js';
import { mountList } from '../ui/list.js';
import { formDialog } from '../ui/dialog.js';
import { t } from '../core/i18n.js';
import { dateShortTime, dateTime } from '../core/format.js';

const ACTION_LABELS = {
  'setup.owner': 'activity.do.setup',
  'auth.login': 'activity.do.login',
  'auth.logout': 'activity.do.logout',
  'auth.password': 'activity.do.password',
  'me.settings': 'activity.do.settings',
  'users.save': 'activity.do.user_save',
};

const TABLE_LABELS = { Users: 'activity.table.users' };

const label = (map, key) => (map[key] ? t(map[key]) : key);

function changeText(value) {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function showEntry(entry) {
  const fields = Object.keys(entry.after || {});
  formDialog(label(ACTION_LABELS, entry.action), html`
    <dl class="details">
      <dt>${t('activity.when')}</dt><dd>${dateTime(entry.at)}</dd>
      <dt>${t('activity.who')}</dt><dd>${entry.user_name}</dd>
      <dt>${t('activity.record')}</dt><dd><span>${label(TABLE_LABELS, entry.table_name)}</span> <code>${entry.record_id}</code></dd>
      ${entry.reason ? html`<dt>${t('activity.reason')}</dt><dd>${entry.reason}</dd>` : ''}
    </dl>
    ${fields.length ? html`<table class="table changes">
      <thead><tr><th scope="col">${t('activity.field')}</th><th scope="col">${t('activity.before')}</th><th scope="col">${t('activity.after')}</th></tr></thead>
      <tbody>${fields.map((f) => html`<tr>
        <td data-label="${t('activity.field')}" class="code">${f}</td>
        <td data-label="${t('activity.before')}">${changeText(entry.before ? entry.before[f] : null)}</td>
        <td data-label="${t('activity.after')}">${changeText(entry.after[f])}</td>
      </tr>`)}</tbody>
    </table>` : ''}`);
}

export const activityPage = {
  path: '/activity',
  title: 'nav.activity',
  perm: 'audit.view',
  mount(el) {
    const list = mountList(el, {
      key: 'activity',
      action: 'audit.list',
      area: 'core',
      searchLabel: t('activity.search'),
      empty: t('activity.empty'),
      emptySearch: t('list.no_match'),
      columns: [
        { label: t('activity.when'), cell: (a) => dateShortTime(a.at), kind: 'nowrap' },
        { label: t('activity.who'), cell: (a) => a.user_name },
        { label: t('activity.what'), cell: (a) => label(ACTION_LABELS, a.action) },
        { label: t('activity.record'), cell: (a) => html`${label(TABLE_LABELS, a.table_name)} <code>${a.record_id}</code>`, kind: 'code' },
      ],
      onRow: showEntry,
    });
    return () => list.destroy();
  },
};
