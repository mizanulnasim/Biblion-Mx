// First-owner setup. The deployer puts a one-time SETUP_CODE in the Script
// Properties; the first owner enters it with their name and password. The
// code is deleted once used, and setup can never run again.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { CONTRACT } from '../../shared/contract/actions.js';
import { createDatabase, isInitialized, newId } from '../store/db.js';
import { deleteProp, getProp, setProp } from '../platform.js';
import { passwordFields } from './auth.js';
import { seedLists } from './lists.js';

function hasOwner(db) {
  return isInitialized() && db.all('Users').length > 0;
}

function setupOwner(ctx, input) {
  const { db } = ctx;
  if (hasOwner(db)) throw new AppError('ALREADY_SET_UP');
  const code = getProp('SETUP_CODE');
  if (!code || code !== input.code) {
    // Ten wrong tries delete the code, so it can't be guessed; the deployer
    // then sets a new one.
    const fails = Number(getProp('SETUP_FAILS') || 0) + 1;
    if (fails >= 10) {
      deleteProp('SETUP_CODE');
      deleteProp('SETUP_FAILS');
    } else {
      setProp('SETUP_FAILS', fails);
    }
    throw new AppError('VALIDATION', {}, { code: { code: 'val.setup_code', params: {} } });
  }
  createDatabase();
  const id = newId('USR');
  db.setActor({ id, display_name: input.display_name });
  db.insert('Users', {
    id,
    username: input.username,
    display_name: input.display_name,
    role_id: 'ROL-OWNER',
    status: 'active',
    perm_grants: [],
    perm_denies: [],
    settings: {},
    failed_attempts: 0,
    ...passwordFields(input.password),
  });
  seedLists(db);
  deleteProp('SETUP_CODE');
  deleteProp('SETUP_FAILS');
  return saved(id);
}

export const SETUP_HANDLERS = {
  'ping': () => ({ contract: CONTRACT }),
  'setup.status': (ctx) => ({ initialized: hasOwner(ctx.db) }),
  'setup.owner': setupOwner,
};
