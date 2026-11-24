// Error codes the server returns. The server never sends English sentences:
// it sends a code plus parameters, and the client shows the message for the code.

const ERRORS = Object.freeze({
  AUTH_REQUIRED: 'err.auth_required',
  AUTH_FAILED: 'err.auth_failed',
  LOCKED_OUT: 'err.locked_out',
  FORBIDDEN: 'err.forbidden',
  VALIDATION: 'err.validation',
  CONFLICT: 'err.conflict',
  NOT_FOUND: 'err.not_found',
  NOT_INITIALIZED: 'err.not_initialized',
  ALREADY_SET_UP: 'err.already_set_up',
  UPDATE_APP: 'err.update_app',
  BAD_REQUEST: 'err.bad_request',
  BUSY: 'err.busy',
  SERVER: 'err.server',
  NETWORK: 'err.network',
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
