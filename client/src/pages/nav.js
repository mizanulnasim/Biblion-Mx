// The menu, in sections. Each item shows only to people with its
// permission, and a section only when something in it shows.
// `bottom` items also sit in the phone's bottom bar.

export const NAV_GROUPS = Object.freeze([
  { id: 'today', label: 'nav.group.today' },
  { id: 'money', label: 'nav.group.money' },
  { id: 'books', label: 'nav.group.books' },
  { id: 'cafe', label: 'nav.group.cafe' },
  { id: 'people', label: 'nav.group.people' },
  { id: 'settings', label: 'nav.group.settings' },
]);

export const NAV = Object.freeze([
  { path: '/', group: 'today', title: 'nav.home', icon: 'home', bottom: true },
  { path: '/upload', group: 'today', title: 'nav.upload', hint: 'nav.upload_hint', icon: 'upload', perm: 'intake.upload' },
  { path: '/uploads', group: 'today', title: 'nav.uploads', hint: 'nav.uploads_hint', icon: 'log', perm: 'intake.upload' },
  { path: '/daily', group: 'today', title: 'nav.daily', hint: 'nav.daily_hint', icon: 'daily', perm: 'acc.daily', bottom: true },
  { path: '/cafe/count', group: 'today', title: 'nav.cafe_count', hint: 'nav.cafe_count_hint', icon: 'cup', perm: 'cafe.count', bottom: true },
  { path: '/me/attendance', group: 'today', title: 'nav.my_attendance', hint: 'nav.my_attendance_hint', icon: 'clock', perm: 'self.staff' },
  { path: '/rota', group: 'today', title: 'nav.rota', hint: 'nav.rota_hint', icon: 'daily', perm: 'schedule.view|self.staff' },
  { path: '/leave', group: 'today', title: 'nav.leave', hint: 'nav.leave_hint', icon: 'badge', perm: 'leave.approve|self.staff' },
  { path: '/closing', group: 'today', title: 'nav.closing', hint: 'nav.closing_hint', icon: 'lock', perm: 'closing.day' },
  { path: '/saved', group: 'today', title: 'nav.saved', hint: 'nav.saved_hint', icon: 'phone' },
  { path: '/money', group: 'money', title: 'nav.money', hint: 'nav.money_hint', icon: 'money', perm: 'acc.entry', bottom: true },
  { path: '/suppliers', group: 'money', title: 'nav.suppliers', hint: 'nav.suppliers_hint', icon: 'truck', perm: 'acc.view_all' },
  { path: '/setup/money', group: 'money', title: 'nav.setup_money', hint: 'nav.setup_money_hint', icon: 'wallet', perm: 'acc.setup' },
  { path: '/books', group: 'books', title: 'nav.books', hint: 'nav.books_hint', icon: 'book', perm: 'books.view' },
  { path: '/books/reqs', group: 'books', title: 'nav.requisitions', hint: 'nav.requisitions_hint', icon: 'truck', perm: 'books.requisition' },
  { path: '/books/orders', group: 'books', title: 'nav.orders', hint: 'nav.orders_hint', icon: 'users', perm: 'books.orders' },
  { path: '/books/order', group: 'books', title: 'order.new_title', hint: 'nav.order_hint', icon: 'book', perm: 'books.order' },
  { path: '/books/stocktake', group: 'books', title: 'nav.stocktake', hint: 'nav.stocktake_hint', icon: 'log', perm: 'books.adjust' },
  { path: '/cafe/orders', group: 'cafe', title: 'nav.cafe_orders', hint: 'nav.cafe_orders_hint', icon: 'truck', perm: 'cafe.view' },
  { path: '/cafe/items', group: 'cafe', title: 'nav.cafe_items', hint: 'nav.cafe_items_hint', icon: 'cup', perm: 'cafe.view' },
  { path: '/staff', group: 'people', title: 'nav.staff', hint: 'nav.staff_hint', icon: 'badge', perm: 'staff.view' },
  { path: '/attendance', group: 'people', title: 'nav.attendance', hint: 'nav.attendance_hint', icon: 'clock', perm: 'attendance.view' },
  { path: '/users', group: 'people', title: 'nav.users', hint: 'nav.users_hint', icon: 'users', perm: 'users.manage' },
  { path: '/activity', group: 'people', title: 'nav.activity', hint: 'nav.activity_hint', icon: 'log', perm: 'audit.view' },
  { path: '/settings/intake', group: 'settings', title: 'nav.settings_intake', hint: 'nav.settings_intake_hint', icon: 'settings', perm: 'settings.manage' },
  { path: '/settings/cafe', group: 'settings', title: 'nav.settings_cafe', hint: 'nav.settings_cafe_hint', icon: 'settings', perm: 'settings.manage' },
  { path: '/settings/books', group: 'settings', title: 'nav.settings_books', hint: 'nav.settings_books_hint', icon: 'settings', perm: 'settings.books' },
  { path: '/settings/attendance', group: 'settings', title: 'nav.settings_attendance', hint: 'nav.settings_attendance_hint', icon: 'settings', perm: 'settings.manage' },
  { path: '/settings/leave', group: 'settings', title: 'nav.settings_leave', hint: 'nav.settings_leave_hint', icon: 'settings', perm: 'settings.manage' },
  { path: '/settings/approvals', group: 'settings', title: 'nav.approvals', hint: 'nav.approvals_hint', icon: 'check', perm: 'settings.manage' },
  { path: '/me', group: 'settings', title: 'nav.me', hint: 'nav.me_hint', icon: 'settings' },
]);
