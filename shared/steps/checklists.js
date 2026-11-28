// The checklists whose required steps are a setting (rulebook 7.2, 7.3):
// step id → the message id naming it in Setup. A step not required is
// shown as a warning; a required one not done needs a reason to go ahead.
// The steps themselves are worked out in server/modules/closing.js and
// server/modules/month.js, through the steps engine (server/kernel/steps.js).

export const DAY_STEPS = Object.freeze({
  shift: 'steps.day.shift',
  cash: 'steps.day.cash',
  cafe: 'steps.day.cafe',
  deliveries: 'steps.day.deliveries',
  tasks: 'steps.day.tasks',
});

export const MONTH_STEPS = Object.freeze({
  days: 'steps.month.days',
  salaries: 'steps.month.salaries',
  vendors: 'steps.month.vendors',
  publishers: 'steps.month.publishers',
  cafe_stock: 'steps.month.cafe_stock',
  utilities: 'steps.month.utilities',
  reports: 'steps.month.reports',
  data_check: 'steps.month.data_check',
});
