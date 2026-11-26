// Settings → Approvals: the money amount limit and the switch for each kind.

import { saved } from '../../shared/contract/reply.js';
import { APPROVAL_RULES } from '../../shared/rules/approval.js';
import { approvalSettings, saveSetting, setting } from '../kernel/settings.js';

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

export const SETTINGS_HANDLERS = {
  'settings.cafe': (ctx) => cafeSettings(ctx.db),
  'settings.cafe.save': saveCafe,
  'settings.approvals': (ctx) => approvalSettings(ctx.db),
  'settings.approvals.save': saveApprovals,
  'settings.books': (ctx) => booksSettings(ctx.db),
  'settings.books.save': saveBooks,
};
