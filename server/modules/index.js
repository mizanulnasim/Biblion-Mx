// Every action's handler, by action name. The router refuses an action that
// is in the contract but has no handler here, and the hygiene check refuses
// a handler that is not in the contract.

import { areaVersions } from '../kernel/areas.js';
import { AUDIT_HANDLERS } from './audit.js';
import { AUTH_HANDLERS } from './auth.js';
import { CLOSING_HANDLERS } from './closing.js';
import { META_HANDLERS } from './meta.js';
import { MONEY_HANDLERS } from './money.js';
import { SETTINGS_HANDLERS } from './settings.js';
import { SETUP_MONEY_HANDLERS } from './setup-money.js';
import { SHIFT_HANDLERS } from './shift.js';
import { SETUP_HANDLERS } from './setup.js';
import { USER_HANDLERS } from './users.js';

export const HANDLERS = Object.freeze({
  ...SETUP_HANDLERS,
  ...AUTH_HANDLERS,
  ...META_HANDLERS,
  ...USER_HANDLERS,
  ...AUDIT_HANDLERS,
  ...SETTINGS_HANDLERS,
  ...SETUP_MONEY_HANDLERS,
  ...MONEY_HANDLERS,
  ...SHIFT_HANDLERS,
  ...CLOSING_HANDLERS,
  'sync.version': () => ({ areas: areaVersions() }),
});
