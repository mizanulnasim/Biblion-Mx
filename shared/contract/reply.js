// Every write gets one of three explicit answers. A client never guesses
// success from the shape of a reply (v1 bug S1).
//   saved       the write is stored; `record_id` and `data` describe it
//   needs_input the server wants a decision (warnings to confirm, a reason);
//               the item must be kept and shown to the person
//   rejected    the write can never succeed as sent; `error` says why

export const SAVED = 'saved';
export const NEEDS_INPUT = 'needs_input';
export const REJECTED = 'rejected';

export function saved(recordId = null, data = null) {
  return { status: SAVED, record_id: recordId, data };
}

export function rejected(code, params = {}, fields = null) {
  return { status: REJECTED, error: { code, params, fields } };
}
