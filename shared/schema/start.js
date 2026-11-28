// Getting started (owner decision): the start date, then each kind of
// opening figure in order. A step marked `manual` is ticked done by a
// shareholder; the others are done when the app sees them.
//   date         the day records start (opening figures are as of then)
//   accounts     money account balances
//   shareholders shop cash each shareholder held, and what was owed each way
//   dues         other people's dues
//   suppliers    what was owed to each vendor and publisher
//   advances     staff advances and pay owed
//   leave        staff leave balances
//   stock        the opening book stock, approved by someone else
//   cafe         the first café count
export const START_STEPS = Object.freeze([
  { id: 'date', manual: false, path: '' },
  { id: 'accounts', manual: true, path: '/setup/money' },
  { id: 'shareholders', manual: true, path: '/setup/money' },
  { id: 'dues', manual: true, path: '/setup/money' },
  { id: 'suppliers', manual: true, path: '/suppliers' },
  { id: 'advances', manual: true, path: '/payroll' },
  { id: 'leave', manual: true, path: '/leave' },
  { id: 'stock', manual: false, path: '/books/stocktake' },
  { id: 'cafe', manual: false, path: '/cafe/count' },
]);
