// Business settings: the defaults from shared/schema/settings.js, overridden
// by rows in the Settings table.

import { BUSINESS_DEFAULTS } from '../../shared/schema/settings.js';
import { APPROVAL_RULES } from '../../shared/rules/approval.js';

export function setting(db, key) {
  const row = db.findOne('Settings', 'key', key);
  return row ? row.value : BUSINESS_DEFAULTS[key];
}

export function saveSetting(db, key, value) {
  const row = db.findOne('Settings', 'key', key);
  if (!row) db.insert('Settings', { key, value });
  else if (row.value !== value) db.update('Settings', row, { value });
}

export function approvalSettings(db) {
  const rules = {};
  for (const rule of APPROVAL_RULES) rules[rule] = setting(db, `approve.rule.${rule}`);
  return { limit: setting(db, 'approve.money_limit'), rules };
}
