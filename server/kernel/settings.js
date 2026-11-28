// Settings: the starting values in shared/schema/settings.js, overridden by
// rows in the Settings table, and for a personal setting by the person's
// own value (kept on their sign-in).

import { BUSINESS_DEFAULTS, PERSONAL_KEYS, SETTINGS } from '../../shared/schema/settings.js';
import { APPROVAL_RULES } from '../../shared/rules/approval.js';

// user: whose own value counts, for a personal setting.
export function setting(db, key, user) {
  const own = user && SETTINGS[key].personal && user.settings ? user.settings[key] : undefined;
  if (own !== undefined) return own;
  const row = db.findOne('Settings', 'key', key);
  return row ? row.value : BUSINESS_DEFAULTS[key];
}

export function saveSetting(db, key, value) {
  const row = db.findOne('Settings', 'key', key);
  if (!row) db.insert('Settings', { key, value });
  else if (row.value !== value) db.update('Settings', row, { value });
}

// Every personal setting as it applies to one person.
export function personalSettings(db, user) {
  const out = {};
  for (const key of PERSONAL_KEYS) out[key] = setting(db, key, user);
  return out;
}

export function approvalSettings(db) {
  const rules = {};
  for (const rule of APPROVAL_RULES) rules[rule] = setting(db, `approve.rule.${rule}`);
  return { limit: setting(db, 'approve.money_limit'), rules };
}
