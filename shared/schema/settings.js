// Settings and their defaults. Business settings become editable in Settings
// when that page is built; personal settings follow the person to any device.

export const BUSINESS_DEFAULTS = Object.freeze({
  'auth.session_days': 30,
  'auth.max_failed': 5,
  'auth.lock_minutes': 15,
});

const BRAND_ACCENT = '#4f46e5';

export const PERSONAL_DEFAULTS = Object.freeze({
  lang: 'en',
  theme: 'system',
  accent: BRAND_ACCENT,
});
