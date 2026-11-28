// Every setting, described once. From these come the Setup page
// (client/src/pages/setup.js), its save actions and their checks
// (shared/contract/actions.js, server/modules/settings.js), and the
// starting values the server falls back to (server/kernel/settings.js).
//
//   area     the Setup section it is shown in (SETTING_AREAS); a setting
//            without one is changed on its own page (letters, reviews,
//            onboarding, Getting started)
//   kind     text | long | bool | int | number | money | choice | time |
//            date | email | color | rates (dated amounts a day) |
//            secret (kept in Script Properties, never sent back)
//   start    the starting value
//   min, max, choices (value → message id), label, help: message ids
//   personal one person can have their own value (kept on their sign-in);
//            Setup lists those and can set or reset them
//   required the value can't be left empty

export const SETTING_AREAS = Object.freeze({
  shop: { title: 'set.area.shop', perm: 'settings.manage' },
  approvals: { title: 'nav.approvals', perm: 'settings.manage', intro: 'approvals.intro' },
  payroll: { title: 'set.area.payroll', perm: 'settings.manage' },
  attendance: { title: 'set.area.attendance', perm: 'settings.manage' },
  leave: { title: 'set.area.leave', perm: 'settings.manage' },
  leaving: { title: 'set.area.leaving', perm: 'settings.manage' },
  cafe: { title: 'set.area.cafe', perm: 'settings.manage' },
  books: { title: 'set.area.books', perm: 'settings.books' },
  tasks: { title: 'set.area.tasks', perm: 'setup.tasks' },
  reading: { title: 'set.area.reading', perm: 'settings.manage', intro: 'settings.intake_intro' },
  security: { title: 'set.area.security', perm: 'settings.manage' },
  display: { title: 'me.display', perm: 'settings.manage' },
});

const APPROVE = Object.freeze({ final: 'approvals.final', shareholder: 'approvals.shareholder' });
const rule = (label) => ({ area: 'approvals', kind: 'choice', choices: APPROVE, start: 'final', label });
const minutes = (start, max, label, help) => ({ area: 'attendance', kind: 'int', min: 0, max, start, label, help });
const BRAND_ACCENT = '#4f46e5';

export const SETTINGS = Object.freeze({
  // ---- The shop ----
  'shop.name': { area: 'shop', kind: 'text', max: 80, required: true, start: 'Biblion', label: 'shop.name' },
  'shop.tagline': { area: 'shop', kind: 'text', max: 120, start: 'Bookstore café and cultural space', label: 'shop.tagline', help: 'shop.tagline_help' },
  'shop.address': { area: 'shop', kind: 'long', max: 300, start: '', label: 'shop.address' },
  'shop.phone': { area: 'shop', kind: 'text', max: 40, start: '', label: 'shop.phone' },
  'shop.email': { area: 'shop', kind: 'email', start: '', label: 'shop.email' },
  'staff.number_prefix': { area: 'shop', kind: 'text', max: 6, required: true, start: 'BIB', label: 'shop.number_prefix', help: 'shop.number_help' },
  'staff.number_digits': { area: 'shop', kind: 'int', min: 1, max: 8, required: true, start: 4, label: 'shop.number_digits' },
  'staff.self_edit': { area: 'shop', kind: 'bool', personal: true, start: true, label: 'shop.self_edit', help: 'shop.self_edit_help' },

  // ---- Money approvals: a manager's entry above the limit waits for a
  // shareholder; each kind is final for a manager or a shareholder confirms.
  'approve.money_limit': { area: 'approvals', kind: 'money', required: true, start: 2000, label: 'approvals.limit', help: 'approvals.limit_help' },
  'approve.rule.expense': rule('approvals.expense'),
  'approve.rule.income': rule('approvals.income'),
  'approve.rule.transfer': rule('approvals.transfer'),
  'approve.rule.daily': rule('approvals.daily'),
  'approve.rule.vendor': rule('approvals.vendor'),
  'approve.rule.publisher': rule('approvals.publisher'),
  'approve.rule.other': rule('approvals.other'),

  // ---- Payroll. The accounting month starts on the 11th (owner decision);
  // payroll, payslips and month reports follow it. A day's pay is the
  // salary ÷ the days in that accounting month or ÷ 30. The food allowance
  // is a rate a day from each date on, earned on every day employed, every
  // day but unpaid leave, or only the days the person punched in.
  'accounting.month_start_day': { area: 'payroll', kind: 'int', min: 1, max: 28, required: true, start: 11, label: 'pay.set.month_start', help: 'pay.set.month_start_help' },
  'payroll.overdue_days': { area: 'payroll', kind: 'int', min: 0, max: 60, required: true, start: 7, label: 'pay.set.overdue_days' },
  'payroll.unpaid_divisor': {
    area: 'payroll', kind: 'choice', start: 'period_days', label: 'pay.set.divisor', help: 'pay.set.divisor_help',
    choices: { period_days: 'pay.set.divisor_month', fixed_30: 'pay.set.divisor_30' },
  },
  'food.unpaid_rule': {
    area: 'payroll', kind: 'choice', start: 'every_day', label: 'pay.set.food_rule',
    choices: { every_day: 'pay.set.food_every', skip_unpaid: 'pay.set.food_skip_unpaid', worked_days: 'pay.set.food_worked' },
  },
  'food.rates': { area: 'payroll', kind: 'rates', max: 20, start: [{ from: '2000-01-01', amount: 100 }], label: 'pay.set.rates', help: 'pay.set.rates_help' },
  // The day the app's records start (opening figures are as of then);
  // empty: the day the app was set up. Changed in Getting started.
  'accounting.start_date': { kind: 'date', start: '' },

  // ---- Attendance. The shop's position (empty: no location check), how
  // far from it a phone may punch, and the least precise position accepted.
  // A punch from further away is checked by a manager (with the person's
  // reason) or not allowed.
  'gps.lat': { area: 'attendance', kind: 'number', min: -90, max: 90, start: null, label: 'hr.shop_lat', help: 'hr.shop_place_help' },
  'gps.lng': { area: 'attendance', kind: 'number', min: -180, max: 180, start: null, label: 'hr.shop_lng' },
  'gps.radius_m': { area: 'attendance', kind: 'int', min: 10, max: 5000, required: true, start: 50, label: 'hr.radius', help: 'hr.radius_help' },
  'gps.max_accuracy_m': { area: 'attendance', kind: 'int', min: 10, max: 5000, required: true, start: 100, label: 'hr.max_accuracy', help: 'hr.max_accuracy_help' },
  'gps.exception': { area: 'attendance', kind: 'choice', start: 'check', label: 'hr.exception', choices: { check: 'hr.exception.check', block: 'hr.exception.block' } },
  // The shop's hours: a punch outside them waits for a manager's check.
  'attendance.shop_open': { area: 'attendance', kind: 'time', required: true, start: '11:00', label: 'hr.shop_open', help: 'hr.shop_hours_help' },
  'attendance.shop_close': { area: 'attendance', kind: 'time', required: true, start: '23:00', label: 'hr.shop_close' },
  // Minutes of grace before a punch counts as late or early, and after the
  // end of work before a missing "out" counts as incomplete. Hours short or
  // overtime within `flex_min` of a day's expected hours are not counted.
  'attendance.late_grace_min': minutes(0, 240, 'hr.late_grace'),
  'attendance.early_grace_min': minutes(0, 240, 'hr.early_grace'),
  'attendance.incomplete_after_min': minutes(120, 1440, 'hr.incomplete_after', 'hr.incomplete_after_help'),
  'attendance.flex_min': minutes(0, 240, 'hr.flex', 'hr.flex_help'),
  // The same punch twice within this many seconds is one punch; a phone
  // clock this many minutes wrong is marked on the punch.
  'attendance.duplicate_window_sec': { area: 'attendance', kind: 'int', min: 0, max: 3600, required: true, start: 120, label: 'hr.duplicate_window', help: 'hr.duplicate_window_help' },
  'attendance.clock_skew_flag_min': { area: 'attendance', kind: 'int', min: 1, max: 1440, required: true, start: 5, label: 'hr.clock_skew', help: 'hr.clock_skew_help' },
  // Punches kept on a phone: refused when older than this many days, and
  // checked by a manager unless accepted automatically.
  'attendance.offline_max_age_days': { area: 'attendance', kind: 'int', min: 1, max: 60, required: true, start: 7, label: 'hr.offline_max_age', help: 'hr.offline_max_age_help' },
  'attendance.offline_auto_validate': { area: 'attendance', kind: 'bool', start: false, label: 'hr.offline_auto', help: 'hr.offline_auto_help' },
  // The shop's punch device (a shared tablet with PINs): off until a
  // shareholder turns it on (owner decision).
  'attendance.device_enabled': { area: 'attendance', kind: 'bool', start: false, label: 'hr.device_enabled', help: 'hr.device_enabled_help' },
  // The shareholders' daily warnings email goes this many minutes after the
  // shop closes.
  'notify.after_close_min': minutes(60, 360, 'hr.email_after', 'hr.email_after_help'),

  // ---- Leave is earned after probation: `rate` days a month, by calendar
  // month with the first part month counted by its days (owner decision),
  // or by full month of service; counted in working days or calendar days.
  'leave.probation_months': { area: 'leave', kind: 'int', min: 0, max: 24, required: true, start: 3, label: 'leave.set.probation', help: 'leave.set.probation_help' },
  'leave.rate': { area: 'leave', kind: 'number', min: 0, max: 10, required: true, start: 1.5, label: 'leave.set.rate', help: 'leave.set.rate_help' },
  'leave.timing': {
    area: 'leave', kind: 'choice', start: 'calendar_month', label: 'leave.set.timing',
    choices: { service_month: 'leave.set.timing_service', calendar_month: 'leave.set.timing_calendar' },
  },
  'leave.partial': {
    area: 'leave', kind: 'choice', start: 'prorate_days', label: 'leave.set.partial', help: 'leave.set.partial_help',
    choices: { prorate_days: 'leave.set.partial_prorate', none: 'leave.set.partial_none' },
  },
  'leave.day_counting': {
    area: 'leave', kind: 'choice', start: 'working', label: 'leave.set.counting',
    choices: { working: 'leave.set.counting_working', calendar: 'leave.set.counting_calendar' },
  },
  'leave.allow_negative': { area: 'leave', kind: 'bool', start: false, label: 'leave.set.negative', help: 'leave.set.negative_help' },
  // Public holidays: the shop closed (nobody is expected) or open, with the
  // people on the rota working.
  'holidays.treatment': {
    area: 'leave', kind: 'choice', start: 'open_scheduled', label: 'leave.set.holidays',
    choices: { open_scheduled: 'leave.set.holidays_open', closed: 'leave.set.holidays_closed' },
  },
  // Rota requests: choosing a shift up to this many days ahead (if people
  // may choose at all), with at least this many hours' rest between days;
  // a day-off move asked at least this many days before.
  'rota.self_select': { area: 'leave', kind: 'bool', start: true, label: 'leave.set.self_select', help: 'leave.set.self_select_help' },
  'selection.advance_days': { area: 'leave', kind: 'int', min: 1, max: 60, required: true, start: 7, label: 'leave.set.advance' },
  'selection.min_rest_hours': { area: 'leave', kind: 'int', min: 0, max: 24, required: true, start: 8, label: 'leave.set.rest' },
  'exchange.min_notice_days': { area: 'leave', kind: 'int', min: 0, max: 30, required: true, start: 1, label: 'leave.set.notice', help: 'leave.set.notice_help' },
  // Staff may mark the days they can't work.
  'rota.self_unavailable': { area: 'leave', kind: 'bool', personal: true, start: true, label: 'set.rota.self_unavailable' },

  // ---- Leaving: the notice expected (days), whether notice short of it is
  // taken from the final pay, and whether unused leave is paid out (a
  // shareholder decides each time, or always, or never).
  'separation.notice_days': { area: 'leaving', kind: 'int', min: 0, max: 180, required: true, start: 30, label: 'set.separation.notice_days' },
  'separation.notice_deduct': { area: 'leaving', kind: 'bool', start: true, label: 'set.separation.notice_deduct', help: 'set.separation.notice_deduct.help' },
  'separation.leave_encash': {
    area: 'leaving', kind: 'choice', start: 'ask', label: 'set.separation.leave_encash',
    choices: { ask: 'set.separation.leave_encash.ask', never: 'set.separation.leave_encash.never', always: 'set.separation.leave_encash.always' },
  },

  // ---- Café: an order by a manager is final, or a shareholder confirms
  // it; expiry is warned this many days ahead; suggestions need this many
  // days of counts, from the last 28.
  'approve.cafe_order': { area: 'cafe', kind: 'choice', choices: APPROVE, start: 'final', label: 'settings.cafe_approve' },
  'cafe.expiry_warn_days': { area: 'cafe', kind: 'int', min: 0, max: 30, required: true, start: 2, label: 'settings.cafe_warn', help: 'settings.cafe_warn_help' },
  'cafe.min_history_days': { area: 'cafe', kind: 'int', min: 3, max: 28, required: true, start: 14, label: 'settings.cafe_history', help: 'settings.cafe_history_help' },

  // ---- Books: requisitions drafted automatically each week, each month,
  // or not at all; a first requisition looks back this many days of sales.
  'books.req_auto': {
    area: 'books', kind: 'choice', start: 'off', label: 'settings.req_auto', help: 'settings.req_auto_help',
    choices: { off: 'settings.req_off', weekly: 'settings.req_weekly', monthly: 'settings.req_monthly' },
  },
  'books.req_days': { area: 'books', kind: 'int', min: 7, max: 365, required: true, start: 30, label: 'settings.req_days', help: 'settings.req_days_help' },

  // ---- Repeating tasks are made this many days ahead (besides today).
  'tasks.days_ahead': { area: 'tasks', kind: 'int', min: 0, max: 14, required: true, start: 1, label: 'set.tasks.days_ahead' },

  // ---- Reading documents: the optional Gemini key is used for receipts
  // and bills, or not at all.
  'intake.ai': { area: 'reading', kind: 'choice', start: 'off', label: 'settings.ai', choices: { off: 'settings.ai_off', bills: 'settings.ai_bills' } },
  'intake.gemini_key': { area: 'reading', kind: 'secret', max: 200, prop: 'GEMINI_KEY', start: '', label: 'settings.ai_key', help: 'settings.ai_key_help' },

  // ---- Signing in: how long a sign-in lasts, and how many wrong passwords
  // (or punch PINs) in a row lock it, for how long.
  'auth.session_days': { area: 'security', kind: 'int', min: 1, max: 365, required: true, start: 30, label: 'set.auth.session_days' },
  'auth.max_failed': { area: 'security', kind: 'int', min: 3, max: 20, required: true, start: 5, label: 'set.auth.max_failed' },
  'auth.lock_minutes': { area: 'security', kind: 'int', min: 1, max: 1440, required: true, start: 15, label: 'set.auth.lock_minutes' },

  // ---- Display: everyone's starting choice; each person changes their own
  // in My settings.
  lang: { area: 'display', kind: 'choice', personal: true, start: 'en', label: 'me.language', choices: { en: 'set.lang.en', bn: 'set.lang.bn' } },
  theme: { area: 'display', kind: 'choice', personal: true, start: 'system', label: 'me.theme', choices: { system: 'me.theme_system', light: 'me.theme_light', dark: 'me.theme_dark' } },
  accent: { area: 'display', kind: 'color', personal: true, start: BRAND_ACCENT, label: 'me.accent', help: 'me.accent_help' },
  // A shareholder's daily warnings email: where to, and whether to send it.
  notify_email: { kind: 'email', personal: true, start: '' },
  notify_daily: { kind: 'bool', personal: true, start: true },

  // ---- Changed on their own pages ----
  // Getting started: the steps a shareholder has marked done.
  'start.done': { kind: 'list', start: [] },
  // Performance reviews: what each person is scored on (1–5), and whether
  // they give their own view first.
  'performance.criteria': { kind: 'list', start: ['Punctuality', 'Task completion', 'Work quality', 'Teamwork', 'Customer care'] },
  'performance.self_assessment': { kind: 'bool', start: true },
  // A new person's onboarding checklist.
  'onboarding.steps': {
    kind: 'list',
    start: [
      'Copy of NID received',
      'Appointment letter signed',
      'Sign-in made and linked to the staff record',
      'Punch PIN set',
      'Job description and procedures read',
      'Shown around the shop and the café',
      'First week working beside a colleague',
    ],
  },
  // Letters (shared/hr/letters.js): the four templates and the conduct
  // sentence, edited in Settings → Letters.
  'letters.offer': { kind: 'long', start: 'Offer of employment\n\nDate: {{today}}\n\nDear {{name}},\n\nWe are pleased to offer you the position of {{position}} at Biblion, starting on {{joined_on}}, at a monthly salary of {{salary}}. Your working hours will be {{hours}}.\n\nThe first three months are a probation period.\n\nPlease sign and return a copy of this letter to accept the offer.\n\nFor Biblion' },
  'letters.appointment': { kind: 'long', start: 'Appointment letter\n\nDate: {{today}}\n\nTo {{name}}\n{{address}}\n\nYou are appointed as {{position}} at Biblion from {{joined_on}}. Your monthly salary is {{salary}}, and your working hours are {{hours}}, with the weekly day off set in the rota.\n\nLeave is earned and taken as set out in the shop\'s rules. Either side may end this appointment with written notice.\n\nFor Biblion' },
  'letters.experience': { kind: 'long', start: 'Experience certificate\n\nDate: {{today}}\n\nThis is to certify that {{name}} worked at Biblion as {{position}} from {{joined_on}} to {{left_on}}.\n\n{{conduct}}\n\nWe wish them every success.\n\nFor Biblion' },
  'letters.experience_conduct': { kind: 'long', start: 'During this time, their conduct was satisfactory.' },
  'letters.release': { kind: 'long', start: 'Release letter\n\nDate: {{today}}\n\nTo {{name}}\n\nThis is to confirm that you are released from your work as {{position}} at Biblion with effect from {{left_on}}. Your dues have been settled.\n\nThank you for your work with us.\n\nFor Biblion' },
});

// The starting value of every setting.
export const BUSINESS_DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(SETTINGS).map(([key, s]) => [key, s.start])));

export const PERSONAL_KEYS = Object.freeze(Object.keys(SETTINGS).filter((key) => SETTINGS[key].personal));

// The settings shown in one Setup section, in order.
export function areaKeys(area) {
  return Object.keys(SETTINGS).filter((key) => SETTINGS[key].area === area);
}

const VALIDATOR = {
  text: (s) => ({ type: 'text', max: s.max }),
  long: (s) => ({ type: 'text', max: s.max }),
  secret: (s) => ({ type: 'text', max: s.max }),
  bool: () => ({ type: 'bool' }),
  int: (s) => ({ type: 'int', min: s.min, max: s.max }),
  number: (s) => ({ type: 'number', min: s.min, max: s.max }),
  money: () => ({ type: 'money', zero: true }),
  choice: (s) => ({ type: 'enum', values: Object.keys(s.choices) }),
  time: () => ({ type: 'time' }),
  date: () => ({ type: 'date' }),
  email: () => ({ type: 'email' }),
  color: () => ({ type: 'color' }),
  rates: (s) => ({ type: 'list', max: s.max, of: { from: { type: 'date', required: true }, amount: { type: 'money', zero: true, required: true } } }),
};

// The payload rules for one setting (shared/lib/validate.js). A choice
// always has a value.
export function settingRule(key) {
  const s = SETTINGS[key];
  return { ...VALIDATOR[s.kind](s), required: Boolean(s.required || s.kind === 'choice') };
}

// The save action's payload rules for a Setup section.
export function areaSchema(area) {
  const schema = {};
  for (const key of areaKeys(area)) schema[key] = settingRule(key);
  if (areaKeys(area).some((key) => SETTINGS[key].kind === 'secret')) schema.forget = { type: 'bool' };
  return schema;
}
