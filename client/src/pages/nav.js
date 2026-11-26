// The menu. Each item shows only to people with its permission.
// `bottom` items also sit in the phone's bottom bar.

export const NAV = Object.freeze([
  { path: '/', title: 'nav.home', icon: 'home', bottom: true },
  { path: '/daily', title: 'nav.daily', hint: 'nav.daily_hint', icon: 'daily', perm: 'acc.daily', bottom: true },
  { path: '/money', title: 'nav.money', hint: 'nav.money_hint', icon: 'money', perm: 'acc.entry', bottom: true },
  { path: '/books', title: 'nav.books', hint: 'nav.books_hint', icon: 'book', perm: 'books.view' },
  { path: '/books/reqs', title: 'nav.requisitions', hint: 'nav.requisitions_hint', icon: 'truck', perm: 'books.requisition' },
  { path: '/books/orders', title: 'nav.orders', hint: 'nav.orders_hint', icon: 'users', perm: 'books.orders' },
  { path: '/books/order', title: 'order.new_title', hint: 'nav.order_hint', icon: 'book', perm: 'books.order' },
  { path: '/books/stocktake', title: 'nav.stocktake', hint: 'nav.stocktake_hint', icon: 'log', perm: 'books.adjust' },
  { path: '/suppliers', title: 'nav.suppliers', hint: 'nav.suppliers_hint', icon: 'truck', perm: 'acc.view_all' },
  { path: '/closing', title: 'nav.closing', hint: 'nav.closing_hint', icon: 'lock', perm: 'closing.day' },
  { path: '/setup/money', title: 'nav.setup_money', hint: 'nav.setup_money_hint', icon: 'wallet', perm: 'acc.setup' },
  { path: '/settings/books', title: 'nav.settings_books', hint: 'nav.settings_books_hint', icon: 'settings', perm: 'settings.books' },
  { path: '/settings/approvals', title: 'nav.approvals', hint: 'nav.approvals_hint', icon: 'check', perm: 'settings.manage' },
  { path: '/users', title: 'nav.users', hint: 'nav.users_hint', icon: 'users', perm: 'users.manage' },
  { path: '/activity', title: 'nav.activity', hint: 'nav.activity_hint', icon: 'log', perm: 'audit.view' },
  { path: '/saved', title: 'nav.saved', hint: 'nav.saved_hint', icon: 'phone', bottom: true },
  { path: '/me', title: 'nav.me', hint: 'nav.me_hint', icon: 'settings' },
]);
