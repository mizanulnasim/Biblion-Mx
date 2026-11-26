// The menu. Each item shows only to people with its permission.
// `bottom` items also sit in the phone's bottom bar.

export const NAV = Object.freeze([
  { path: '/', title: 'nav.home', icon: 'home', bottom: true },
  { path: '/daily', title: 'nav.daily', hint: 'nav.daily_hint', icon: 'daily', perm: 'acc.daily', bottom: true },
  { path: '/money', title: 'nav.money', hint: 'nav.money_hint', icon: 'money', perm: 'acc.entry', bottom: true },
  { path: '/books', title: 'nav.books', hint: 'nav.books_hint', icon: 'book', perm: 'books.view' },
  { path: '/suppliers', title: 'nav.suppliers', hint: 'nav.suppliers_hint', icon: 'truck', perm: 'acc.view_all' },
  { path: '/closing', title: 'nav.closing', hint: 'nav.closing_hint', icon: 'lock', perm: 'closing.day' },
  { path: '/setup/money', title: 'nav.setup_money', hint: 'nav.setup_money_hint', icon: 'wallet', perm: 'acc.setup' },
  { path: '/settings/approvals', title: 'nav.approvals', hint: 'nav.approvals_hint', icon: 'check', perm: 'settings.manage' },
  { path: '/users', title: 'nav.users', hint: 'nav.users_hint', icon: 'users', perm: 'users.manage' },
  { path: '/activity', title: 'nav.activity', hint: 'nav.activity_hint', icon: 'log', perm: 'audit.view' },
  { path: '/saved', title: 'nav.saved', hint: 'nav.saved_hint', icon: 'phone', bottom: true },
  { path: '/me', title: 'nav.me', hint: 'nav.me_hint', icon: 'settings' },
]);
