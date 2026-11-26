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
  'approve.rule.other': 'final',
});

const BRAND_ACCENT = '#4f46e5';

export const PERSONAL_DEFAULTS = Object.freeze({
  lang: 'en',
  theme: 'system',
  accent: BRAND_ACCENT,
});
