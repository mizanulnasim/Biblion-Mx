// Settings and their defaults. Business settings become editable in Settings
// when that page is built; personal settings follow the person to any device.

export const BUSINESS_DEFAULTS = Object.freeze({
  'auth.session_days': 30,
  'auth.max_failed': 5,
  'auth.lock_minutes': 15,
  // Money approvals: a manager's entry above the limit waits for a
  // shareholder; each switch is 'final' (final for a manager) or
  // 'shareholder' (a shareholder confirms).
  'approve.money_limit': 2000,
  'approve.rule.expense': 'final',
  'approve.rule.income': 'final',
  'approve.rule.transfer': 'final',
  'approve.rule.daily': 'final',
  'approve.rule.vendor': 'final',
  'approve.rule.publisher': 'final',
  // Requisitions: drafted automatically each week, each month, or not at all;
  // a first requisition looks back this many days of sales.
  'books.req_auto': 'off',
  'books.req_days': 30,
  // Reading documents: the optional Gemini key is used for receipts and bills
  // ('bills') or not at all ('off').
  'intake.ai': 'off',
  // Café: an order by a manager is final, or a shareholder confirms it;
  // expiry is warned this many days ahead; suggestions need this many
  // days of counts, from the last 28.
  'approve.cafe_order': 'final',
  'cafe.expiry_warn_days': 2,
  'cafe.min_history_days': 14,
  'approve.rule.other': 'final',
  // Attendance. The shop's position (empty: no location check), how far
  // from it a phone may punch, and the least precise position accepted.
  // gps.exception: a punch from further away is 'check'ed by a manager
  // (with the person's reason) or 'block'ed.
  'gps.lat': null,
  'gps.lng': null,
  'gps.radius_m': 50,
  'gps.max_accuracy_m': 100,
  'gps.exception': 'check',
  // Minutes of grace before a punch counts as late or early, and after the
  // end of work before a missing "out" counts as incomplete.
  'attendance.late_grace_min': 0,
  'attendance.early_grace_min': 0,
  'attendance.incomplete_after_min': 120,
  // The same punch twice within this many seconds is one punch.
  'attendance.duplicate_window_sec': 120,
  // A phone clock this many minutes wrong is marked on the punch.
  'attendance.clock_skew_flag_min': 5,
  // Punches kept on a phone: refused when older than this many days, and
  // checked by a manager unless this is true.
  'attendance.offline_max_age_days': 7,
  'attendance.offline_auto_validate': false,
});

const BRAND_ACCENT = '#4f46e5';

export const PERSONAL_DEFAULTS = Object.freeze({
  lang: 'en',
  theme: 'system',
  accent: BRAND_ACCENT,
});
