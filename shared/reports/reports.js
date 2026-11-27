// The printable reports: who may see each, and what it is asked for (a
// date, an accounting month, or a range of dates). Each is built on the
// server as one model (server/modules/reports.js) that the screen, print
// and Excel all show.
export const REPORTS = Object.freeze({
  daily: { perm: 'acc.view_all', input: 'date' },
  monthly: { perm: 'closing.month', input: 'month' },
  shareholders: { perm: 'acc.shareholders', input: 'month' },
  salary: { perm: 'payroll.view', input: 'month' },
  loans: { perm: 'acc.view_all', input: 'month' },
  dues: { perm: 'acc.view_all', input: 'date' },
  all_money: { perm: 'acc.view_all', input: 'range' },
});
