// Settings and their defaults. Business settings become editable in Settings
// when that page is built; personal settings follow the person to any device.

export const BUSINESS_DEFAULTS = Object.freeze({
  'auth.session_days': 30,
  'auth.max_failed': 5,
  'auth.lock_minutes': 15,
  // Money approvals: a manager's entry above the limit waits for a
  // shareholder; each switch is 'final' (final for a manager) or
  // 'shareholder' (a shareholder confirms).
  'approve.money_limit': 2000,
  'approve.rule.expense': 'final',
  'approve.rule.income': 'final',
  'approve.rule.transfer': 'final',
  'approve.rule.daily': 'final',
  'approve.rule.vendor': 'final',
  'approve.rule.publisher': 'final',
  // Requisitions: drafted automatically each week, each month, or not at all;
  // a first requisition looks back this many days of sales.
  'books.req_auto': 'off',
  'books.req_days': 30,
  // Reading documents: the optional Gemini key is used for receipts and bills
  // ('bills') or not at all ('off').
  'intake.ai': 'off',
  // Café: an order by a manager is final, or a shareholder confirms it;
  // expiry is warned this many days ahead; suggestions need this many
  // days of counts, from the last 28.
  'approve.cafe_order': 'final',
  'cafe.expiry_warn_days': 2,
  'cafe.min_history_days': 14,
  'approve.rule.other': 'final',
  // Attendance. The shop's position (empty: no location check), how far
  // from it a phone may punch, and the least precise position accepted.
  // gps.exception: a punch from further away is 'check'ed by a manager
  // (with the person's reason) or 'block'ed.
  'gps.lat': null,
  'gps.lng': null,
  'gps.radius_m': 50,
  'gps.max_accuracy_m': 100,
  'gps.exception': 'check',
  // Minutes of grace before a punch counts as late or early, and after the
  // end of work before a missing "out" counts as incomplete.
  'attendance.late_grace_min': 0,
  'attendance.early_grace_min': 0,
  'attendance.incomplete_after_min': 120,
  // The same punch twice within this many seconds is one punch.
  'attendance.duplicate_window_sec': 120,
  // A phone clock this many minutes wrong is marked on the punch.
  'attendance.clock_skew_flag_min': 5,
  // Punches kept on a phone: refused when older than this many days, and
  // checked by a manager unless this is true.
  'attendance.offline_max_age_days': 7,
  'attendance.offline_auto_validate': false,
  // The shop's punch device (a shared tablet with PINs): off until a
  // shareholder turns it on (owner decision).
  'attendance.device_enabled': false,
  // The shop's hours: a punch outside them waits for a manager's check.
  'attendance.shop_open': '11:00',
  'attendance.shop_close': '23:00',
  // Public holidays: the shop 'closed' (nobody is expected) or open, with
  // the people on the rota working ('open_scheduled').
  'holidays.treatment': 'open_scheduled',
  // Rota requests: choosing a shift up to this many days ahead (if people
  // may choose at all), with at least this many hours' rest between days;
  // a day-off move asked at least this many days before.
  'rota.self_select': true,
  'selection.advance_days': 7,
  'selection.min_rest_hours': 8,
  'exchange.min_notice_days': 1,
  // Leave is earned after probation: `rate` days a month, by calendar
  // month with the first part month counted by its days (owner decision),
  // or by full month of service; counted in working days or calendar days.
  'leave.probation_months': 3,
  'leave.rate': 1.5,
  'leave.timing': 'calendar_month',
  'leave.partial': 'prorate_days',
  'leave.day_counting': 'working',
  'leave.allow_negative': false,
  // The accounting month starts on this day (owner decision: the 11th).
  // Payroll, payslips and month reports follow it.
  'accounting.month_start_day': 11,
  // Payroll: a day's pay is the salary ÷ the days in that accounting month
  // ('period_days') or ÷ 30 ('fixed_30'). A month's salary not paid this
  // many days after the month ends is overdue, issued or not.
  'payroll.unpaid_divisor': 'period_days',
  'payroll.overdue_days': 7,
  // Food allowance a day, from each date on; earned on every day employed
  // ('every_day'), every day but unpaid leave ('skip_unpaid'), or only the
  // days the person punched in ('worked_days').
  'food.rates': [{ from: '2000-01-01', amount: 100 }],
  'food.unpaid_rule': 'every_day',
  // Repeating tasks are made this many days ahead (besides today).
  'tasks.days_ahead': 1,
  // Leaving: the notice expected (days), whether notice short of it is
  // taken from the final pay, and whether unused leave is paid out
  // ('always', 'never', or 'ask': a shareholder decides each time).
  // Performance reviews: what each person is scored on (1–5), and whether
  // they give their own view first.
  'performance.criteria': ['Punctuality', 'Task completion', 'Work quality', 'Teamwork', 'Customer care'],
  'performance.self_assessment': true,
  // A new person's onboarding checklist.
  'onboarding.steps': [
    'Copy of NID received',
    'Appointment letter signed',
    'Sign-in made and linked to the staff record',
    'Punch PIN set',
    'Job description and procedures read',
    'Shown around the shop and the café',
    'First week working beside a colleague',
  ],
  'separation.notice_days': 30,
  'separation.notice_deduct': true,
  'separation.leave_encash': 'ask',
  // Letters (shared/hr/letters.js): the shop's address on the letterhead,
  // and the four templates. The owner edits them in Settings → Letters.
  // The shop's details on the letterhead of letters, payslips and reports.
  'shop.name': 'Biblion',
  'shop.tagline': 'Bookstore café and cultural space',
  'shop.address': '',
  'shop.phone': '',
  'shop.email': '',
  'letters.offer': 'Offer of employment\n\nDate: {{today}}\n\nDear {{name}},\n\nWe are pleased to offer you the position of {{position}} at Biblion, starting on {{joined_on}}, at a monthly salary of {{salary}}. Your working hours will be {{hours}}.\n\nThe first three months are a probation period.\n\nPlease sign and return a copy of this letter to accept the offer.\n\nFor Biblion',
  'letters.appointment': 'Appointment letter\n\nDate: {{today}}\n\nTo {{name}}\n{{address}}\n\nYou are appointed as {{position}} at Biblion from {{joined_on}}. Your monthly salary is {{salary}}, and your working hours are {{hours}}, with the weekly day off set in the rota.\n\nLeave is earned and taken as set out in the shop\'s rules. Either side may end this appointment with written notice.\n\nFor Biblion',
  'letters.experience': 'Experience certificate\n\nDate: {{today}}\n\nThis is to certify that {{name}} worked at Biblion as {{position}} from {{joined_on}} to {{left_on}}.\n\n{{conduct}}\n\nWe wish them every success.\n\nFor Biblion',
  'letters.experience_conduct': 'During this time, their conduct was satisfactory.',
  'letters.release': 'Release letter\n\nDate: {{today}}\n\nTo {{name}}\n\nThis is to confirm that you are released from your work as {{position}} at Biblion with effect from {{left_on}}. Your dues have been settled.\n\nThank you for your work with us.\n\nFor Biblion',
});

const BRAND_ACCENT = '#4f46e5';

export const PERSONAL_DEFAULTS = Object.freeze({
  lang: 'en',
  theme: 'system',
  accent: BRAND_ACCENT,
});
