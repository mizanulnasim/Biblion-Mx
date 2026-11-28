// Apps Script entry points. The build turns these exports into the global
// functions Apps Script calls.

import { handle } from './kernel/router.js';
import { CONTRACT } from '../shared/contract/actions.js';
import { jsonOutput } from './platform.js';
import { runJobs } from './kernel/jobs.js';
import { initialize as initializeApp, runSelfTest as selfTest } from './kernel/deploy.js';

// The browser sends text/plain so no CORS preflight is needed.
export function doPost(e) {
  const body = e && e.postData ? e.postData.contents : '';
  return jsonOutput(handle(body));
}

// Run by an hourly time-driven trigger (Triggers → Add trigger → jobHourly).
export function jobHourly() {
  return runJobs();
}

// Public health check.
export function doGet() {
  return jsonOutput({ ok: true, data: { app: 'biblion', contract: CONTRACT } });
}

// Run once by the deployer from the script editor: the spreadsheets, the
// Drive folder and the hourly trigger, then the self test.
export function initialize() {
  return initializeApp();
}

// Checks the deployment; the result is in the editor's execution log.
export function runSelfTest() {
  return selfTest();
}
