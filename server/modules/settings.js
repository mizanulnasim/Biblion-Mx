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

export const SETTINGS_HANDLERS = {
  'settings.approvals': (ctx) => approvalSettings(ctx.db),
  'settings.approvals.save': saveApprovals,
  'settings.books': (ctx) => booksSettings(ctx.db),
  'settings.books.save': saveBooks,
};
