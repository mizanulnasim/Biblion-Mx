// Settings → Approvals: the money amount limit and the switch for each kind.

import { saved } from '../../shared/contract/reply.js';
import { APPROVAL_RULES } from '../../shared/rules/approval.js';
import { approvalSettings, saveSetting } from '../kernel/settings.js';

function saveApprovals(ctx, input) {
  saveSetting(ctx.db, 'approve.money_limit', input.limit);
  for (const rule of APPROVAL_RULES) saveSetting(ctx.db, `approve.rule.${rule}`, input[rule]);
  return saved(null, approvalSettings(ctx.db));
}

export const SETTINGS_HANDLERS = {
  'settings.approvals': (ctx) => approvalSettings(ctx.db),
  'settings.approvals.save': saveApprovals,
};
