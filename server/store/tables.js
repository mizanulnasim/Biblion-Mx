// Tables are added here only when a feature uses them.
// Every row also has the base columns below. Column suffixes:
//   :n number   :b true/false   :j JSON   (no suffix) text
// `secret` columns are never copied into the activity log.
// `log` tables are not themselves written to the activity log.

export const BASE_COLUMNS = Object.freeze(['id', 'created_at', 'created_by', 'updated_at', 'updated_by', 'version:n']);

export const TABLES = Object.freeze({
  Users: {
    group: 'core',
    prefix: 'USR',
    columns: [
      'username', 'display_name', 'role_id', 'status', 'perm_grants:j', 'perm_denies:j', 'settings:j',
      'pass_hash', 'kdf_salt', 'kdf_iter:n', 'failed_attempts:n', 'locked_until', 'last_login_at',
    ],
    secret: ['pass_hash', 'kdf_salt', 'kdf_iter'],
  },
  Sessions: {
    group: 'core',
    prefix: 'SES',
    columns: ['user_id', 'token_hash', 'expires_at', 'revoked:b'],
    secret: ['token_hash'],
    log: true,
  },
  // Every saved write keeps its client op_id here for good, so a write sent
  // twice, even years apart, is applied once (v1 bug S2).
  Ops: {
    group: 'core',
    prefix: 'OPS',
    columns: ['op_id', 'user_id', 'action', 'record_id', 'reply:j'],
    log: true,
  },
  Audit_Log: {
    group: 'core',
    prefix: 'AUD',
    columns: ['user_id', 'user_name', 'action', 'table_name', 'record_id', 'before:j', 'after:j', 'reason', 'op_id'],
    log: true,
  },
});
