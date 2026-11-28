// Run once by the deployer from the Apps Script editor.
//
// initialize(): makes the spreadsheets with every table's sheet, the Drive
// folder for files, and the hourly trigger. Biblion's starting lists are
// made when the first shareholder signs up (server/modules/setup.js), so
// they belong to a real person from the start.
//
// runSelfTest(): checks the deployment and writes what it found to the
// execution log; it fails, naming each problem, if anything is wrong.
// It reads only: nothing is written to the data.

import { TABLES } from '../store/tables.js';
import { createDatabase, openDb } from '../store/db.js';
import { addHourlyTrigger, folderFor, getProp, hasHourlyTrigger, mailQuota, report } from '../platform.js';

export function initialize() {
  createDatabase();
  const db = openDb(new Date());
  for (const table of Object.keys(TABLES)) db.all(table);
  folderFor('uploads');
  if (!hasHourlyTrigger()) addHourlyTrigger();
  return runSelfTest();
}

const CHECKS = [
  ['Every table has its sheet and columns', () => {
    const db = openDb(new Date());
    for (const table of Object.keys(TABLES)) db.all(table);
    return true;
  }],
  ['The Drive folder for files', () => Boolean(getProp('FOLDER_ROOT'))],
  ['The hourly trigger (jobHourly)', hasHourlyTrigger],
  ['Email can be sent today', () => mailQuota() > 0],
  ['A first shareholder, or the one-time setup code', () => openDb(new Date()).all('Users').some((u) => u.role_id === 'ROL-OWNER') || Boolean(getProp('SETUP_CODE'))],
];

export function runSelfTest() {
  const lines = CHECKS.map(([name, check]) => {
    let ok = false;
    let why = '';
    try {
      ok = Boolean(check());
    } catch (err) {
      why = ` (${err.message})`;
    }
    return { ok, text: `${ok ? '✓' : '✗'} ${name}${why}` };
  });
  report(lines.map((l) => l.text).join('\n'));
  const failed = lines.filter((l) => !l.ok);
  if (failed.length) throw new Error(`Self test: ${failed.length} problem(s): ${failed.map((l) => l.text.slice(2)).join('; ')}`);
  return lines.map((l) => l.text);
}
