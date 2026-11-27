// Error codes the server returns. The server never sends English sentences:
// it sends a code plus parameters, and the client shows the message for the code.

const ERRORS = Object.freeze({
  AUTH_REQUIRED: 'err.auth_required',
  AUTH_FAILED: 'err.auth_failed',
  LOCKED_OUT: 'err.locked_out',
  FORBIDDEN: 'err.forbidden',
  VALIDATION: 'err.validation',
  CONFLICT: 'err.conflict',
  OWN_ENTRY: 'err.own_entry',
  NOT_FOUND: 'err.not_found',
  NOT_INITIALIZED: 'err.not_initialized',
  ALREADY_SET_UP: 'err.already_set_up',
  UPDATE_APP: 'err.update_app',
  BAD_REQUEST: 'err.bad_request',
  BUSY: 'err.busy',
  SERVER: 'err.server',
  NETWORK: 'err.network',
  NO_STAFF: 'err.no_staff',
  SEQUENCE: 'err.sequence',
  NOT_IN: 'err.not_in',
  ON_BREAK: 'err.on_break',
  NOT_ON_BREAK: 'err.not_on_break',
  TASK_RECORD: 'err.task_record',
  TOO_OLD: 'err.too_old',
  OUTSIDE: 'err.outside',
  LOCATION_REQUIRED: 'err.location_required',
  PIN_WRONG: 'err.pin_wrong',
  PIN_LOCKED: 'err.pin_locked',
  DEVICE: 'err.device',
  LEAVE_BALANCE: 'err.leave_balance',
  OVERLAP: 'err.overlap',
  NOTICE: 'err.notice',
  NO_DAYS: 'err.no_days',
  PAYSLIPS_MISSING: 'err.payslips_missing',
});

export class AppError extends Error {
  constructor(code, params = {}, fields = null) {
    super(code);
    this.code = ERRORS[code] ? code : 'SERVER';
    this.params = params;
    this.fields = fields;
  }
}

export function errorMessageId(code) {
  return ERRORS[code] || ERRORS.SERVER;
}
