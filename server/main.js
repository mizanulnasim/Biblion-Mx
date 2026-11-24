// Apps Script entry points. The build turns these exports into the global
// functions Apps Script calls.

import { handle } from './kernel/router.js';
import { CONTRACT } from '../shared/contract/actions.js';
import { jsonOutput } from './platform.js';

// The browser sends text/plain so no CORS preflight is needed.
export function doPost(e) {
  const body = e && e.postData ? e.postData.contents : '';
  return jsonOutput(handle(body));
}

// Public health check.
export function doGet() {
  return jsonOutput({ ok: true, data: { app: 'biblion', contract: CONTRACT } });
}
