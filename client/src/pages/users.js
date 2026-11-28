// Users: who can sign in, their role and whether they are active.

import { html } from '../ui/html.js';
import { mountList } from '../ui/list.js';
import { chip } from '../ui/feedback.js';
import { formDialog } from '../ui/dialog.js';
import { bindForm, formView } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { t } from '../core/i18n.js';
import { write } from '../core/api.js';
import { getState } from '../core/state.js';
import { dateShortTime } from '../core/format.js';
import { ACTIONS } from '../../../shared/contract/actions.js';
import { ROLES, roleById } from '../../../shared/schema/permissions.js';

const STATUS = { active: ['users.active', 'ok'], inactive: ['users.inactive', 'muted'] };

function userForm(user) {
  const isSelf = user && user.id === getState().meta.user.id;
  const fields = [
    { name: 'display_name', label: t('users.name'), required: true },
    { name: 'username', label: t('signin.username'), help: t('setup.username_help'), required: true },
    {
      name: 'role_id', label: t('users.role'), type: 'select', required: true,
      options: ROLES.map((r) => ({ value: r.id, label: t(r.name) })),
      help: isSelf ? t('users.self_help') : '',
    },
    {
      name: 'status', label: t('users.status'), type: 'select', required: true,
      options: [{ value: 'active', label: t('users.active') }, { value: 'inactive', label: t('users.inactive') }],
    },
    { name: 'own_password', label: t('users.own_password'), type: 'checkbox', help: t('users.own_password_help') },
    {
      name: 'password', label: user ? t('users.new_password') : t('signin.password'), type: 'password',
      help: user ? t('users.new_password_help') : t('setup.password_help'), autocomplete: 'new-password', required: !user,
    },
  ];
  return formView({
    fields,
    values: user || { role_id: 'ROL-STAFF', status: 'active' },
    submit: user ? t('common.save') : t('users.add'),
  });
}

function openUser(user, onSaved) {
  const dialog = formDialog(user ? t('users.edit_title', { name: user.display_name }) : t('users.add_title'), userForm(user));
  bindForm(dialog.querySelector('form.form'), {
    schema: ACTIONS['users.save'].schema,
    busyLabel: t('common.saving'),
    mapValues: (v) => ({ ...v, id: user ? user.id : null, version: user ? user.version : null, password: v.password || null }),
    onSubmit: (values) => write('users.save', values),
    onSaved: () => {
      dialog.close();
      toast(t('users.saved'));
      onSaved();
    },
  });
}

export const usersPage = {
  path: '/users',
  title: 'nav.users',
  perm: 'users.manage',
  mount(el) {
    const list = mountList(el, {
      key: 'users',
      action: 'users.list',
      area: 'core',
      searchLabel: t('users.search'),
      empty: t('users.empty'),
      emptySearch: t('list.no_match'),
      tools: html`<button type="button" class="btn btn-primary" data-act="tool" data-tool="add">${t('users.add')}</button>`,
      columns: [
        { label: t('users.name'), cell: (u) => u.display_name },
        { label: t('signin.username'), cell: (u) => u.username, kind: 'code' },
        { label: t('users.role'), cell: (u) => t(roleById(u.role_id).name), kind: 'nowrap' },
        { label: t('users.status'), cell: (u) => chip(t(STATUS[u.status][0]), STATUS[u.status][1]), kind: 'nowrap' },
        { label: t('users.last_sign_in'), cell: (u) => (u.last_login_at ? dateShortTime(u.last_login_at) : t('users.never')), kind: 'nowrap' },
      ],
      onRow: (user) => openUser(user, () => list.reload()),
      onTool: () => openUser(null, () => list.reload()),
    });
    return () => list.destroy();
  },
};
