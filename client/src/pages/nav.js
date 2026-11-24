// The menu. Each item shows only to people with its permission.
// `bottom` items also sit in the phone's bottom bar.

export const NAV = Object.freeze([
  { path: '/', title: 'nav.home', icon: 'home', bottom: true },
  { path: '/users', title: 'nav.users', hint: 'nav.users_hint', icon: 'users', perm: 'users.manage' },
  { path: '/activity', title: 'nav.activity', hint: 'nav.activity_hint', icon: 'log', perm: 'audit.view' },
  { path: '/saved', title: 'nav.saved', hint: 'nav.saved_hint', icon: 'phone', bottom: true },
  { path: '/me', title: 'nav.me', hint: 'nav.me_hint', icon: 'settings', bottom: true },
]);
