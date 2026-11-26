// Scheduled work. Apps Script calls jobHourly() every hour (a time-driven
// trigger the deployer adds once). Each job decides for itself whether its
// period has come, and remembers the last period it ran in a Script
// Property, so running it twice in an hour does nothing twice.

import { isInitialized, openDb } from '../store/db.js';
import { withLock } from '../platform.js';
import { bumpArea } from './areas.js';
import { autoRequisitions } from '../modules/requisitions.js';

const JOBS = [{ id: 'req_auto', area: 'books', run: autoRequisitions }];

export function runJobs() {
  if (!isInitialized()) return {};
  const done = withLock(() => {
    const results = {};
    for (const job of JOBS) {
      const db = openDb(new Date());
      db.setActor({ id: 'SYSTEM', display_name: 'Biblion' });
      db.setContext({ action: `job.${job.id}`, op_id: '' });
      results[job.id] = job.run(db);
      if (results[job.id]) bumpArea(job.area);
    }
    return results;
  });
  return done ? done.value : {};
}
