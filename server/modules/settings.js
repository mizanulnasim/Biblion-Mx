// Settings → Approvals: the money amount limit and the switch for each kind.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { APPROVAL_RULES } from '../../shared/rules/approval.js';
import { approvalSettings, saveSetting, setting } from '../kernel/settings.js';
import { SHOP_KEYS, shopDetails } from './meta.js';

function saveApprovals(ctx, input) {
  saveSetting(ctx.db, 'approve.money_limit', input.limit);
  for (const rule of APPROVAL_RULES) saveSetting(ctx.db, `approve.rule.${rule}`, input[rule]);
  return saved(null, approvalSettings(ctx.db));
}

function booksSettings(db) {
  return { req_auto: setting(db, 'books.req_auto'), req_days: setting(db, 'books.req_days') };
}

function saveBooks(ctx, input) {
  saveSetting(ctx.db, 'books.req_auto', input.req_auto);
  saveSetting(ctx.db, 'books.req_days', input.req_days);
  return saved(null, booksSettings(ctx.db));
}

function cafeSettings(db) {
  return { approve: setting(db, 'approve.cafe_order'), expiry_warn_days: setting(db, 'cafe.expiry_warn_days'), min_history_days: setting(db, 'cafe.min_history_days') };
}

function saveCafe(ctx, input) {
  saveSetting(ctx.db, 'approve.cafe_order', input.approve);
  saveSetting(ctx.db, 'cafe.expiry_warn_days', input.expiry_warn_days);
  saveSetting(ctx.db, 'cafe.min_history_days', input.min_history_days);
  return saved(null, cafeSettings(ctx.db));
}

// Settings → Attendance: the payload names, and the setting each one is.
const ATTENDANCE_KEYS = Object.freeze({
  lat: 'gps.lat', lng: 'gps.lng', radius_m: 'gps.radius_m', max_accuracy_m: 'gps.max_accuracy_m', exception: 'gps.exception',
  late_grace: 'attendance.late_grace_min', early_grace: 'attendance.early_grace_min', incomplete_after: 'attendance.incomplete_after_min',
  duplicate_window_sec: 'attendance.duplicate_window_sec', clock_skew_flag_min: 'attendance.clock_skew_flag_min',
  offline_max_age_days: 'attendance.offline_max_age_days', offline_auto_validate: 'attendance.offline_auto_validate',
  device_enabled: 'attendance.device_enabled', shop_open: 'attendance.shop_open', shop_close: 'attendance.shop_close',
});

function attendanceSettings(db) {
  const out = {};
  for (const [name, key] of Object.entries(ATTENDANCE_KEYS)) out[name] = setting(db, key);
  return out;
}

function saveAttendance(ctx, input) {
  if ((input.lat === null) !== (input.lng === null)) {
    throw new AppError('VALIDATION', {}, { [input.lat === null ? 'lat' : 'lng']: { code: 'val.required', params: {} } });
  }
  if (input.shop_close <= input.shop_open) throw new AppError('VALIDATION', {}, { shop_close: { code: 'val.time_after', params: {} } });
  for (const [name, key] of Object.entries(ATTENDANCE_KEYS)) saveSetting(ctx.db, key, name === 'offline_auto_validate' || name === 'device_enabled' ? Boolean(input[name]) : input[name]);
  return saved(null, attendanceSettings(ctx.db));
}

// Settings → Shop: the details on the letterhead.
function saveShop(ctx, input) {
  for (const [name, key] of Object.entries(SHOP_KEYS)) saveSetting(ctx.db, key, input[name] || '');
  return saved(null, shopDetails(ctx.db));
}

export const SETTINGS_HANDLERS = {
  'settings.shop': (ctx) => shopDetails(ctx.db),
  'settings.shop.save': saveShop,
  'settings.attendance': (ctx) => attendanceSettings(ctx.db),
  'settings.attendance.save': saveAttendance,
  'settings.cafe': (ctx) => cafeSettings(ctx.db),
  'settings.cafe.save': saveCafe,
  'settings.approvals': (ctx) => approvalSettings(ctx.db),
  'settings.approvals.save': saveApprovals,
  'settings.books': (ctx) => booksSettings(ctx.db),
  'settings.books.save': saveBooks,
};
