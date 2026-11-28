// The starting lists the first setup makes (rulebook S3), besides the setup
// lists described in shared/lists/lists.js. They are Biblion's real ones,
// and every one can be changed afterwards.

const SHAREHOLDERS = [
  { name: 'Mizanul Islam Nasim', short: 'Nasim', percent: 46 },
  { name: 'Mushfiqul Karim', short: 'Mushfiq', percent: 44 },
  { name: 'Shourov Kabir', short: 'Shourov', percent: 10 },
];
const OWNER_SALARY = 10000;

const CATEGORIES = [
  ['Café supplies', 'cafe'], ['Utilities', 'shared'], ['Rent', 'shared'], ['Taxes & govt fees', 'shared'], ['Repair & maintenance', 'shared'],
  ['Marketing & events', 'shared'], ['Transport & delivery', 'shared'], ['Bank & bKash charges', 'shared'], ['Miscellaneous', 'shared'], ['Customer refunds', 'shared'],
];

const SHIFTS = [
  { name: 'Morning', name_bn: 'সকাল', start: '09:00', end: '17:00' },
  { name: 'Day', name_bn: 'দিন', start: '11:00', end: '19:00' },
  { name: 'Evening', name_bn: 'সন্ধ্যা', start: '15:00', end: '23:00' },
];

// Paid and Unpaid leave are built in (shared/hr/leave.js).
const LEAVE_TYPES = [
  ['Annual leave', 'বার্ষিক ছুটি'], ['Casual leave', 'নৈমিত্তিক ছুটি'], ['Sick leave', 'অসুস্থতার ছুটি'], ['Emergency leave', 'জরুরি ছুটি'], ['Half-day leave', 'অর্ধদিবস ছুটি'],
];

// Routine tasks: who does them, how often, and the screen each is done on.
const ROUTINES = [
  { title: 'Café closing count', role: 'staff', repeat: 'daily', link: 'page:cafe_count' },
  { title: 'Day closing', role: 'manager', repeat: 'daily', link: 'page:closing' },
  { title: 'Electricity bill', role: 'manager', repeat: 'monthly', day_of_month: 1, link: 'money:expense' },
  { title: 'Print the monthly accounts', role: 'owner', repeat: 'monthly', day_of_month: 12, link: 'report:monthly' },
  { title: 'Month closing', role: 'owner', repeat: 'monthly', day_of_month: 12, link: 'page:month_closing' },
];

export function seedStart(db, ownerId, today) {
  const holders = SHAREHOLDERS.map((s) => ({ ...s, id: db.insert('Shareholders', { name: s.name, phone: '', salary: OWNER_SALARY, status: 'active', opening_owed: 0, opening_owes: 0 }).id }));
  db.insert('Share_History', { from: '2000-01-01', shares: holders.map((h) => ({ shareholder_id: h.id, percent: h.percent })), note: '', entered_by: ownerId });
  const account = (name, kind, shareholderId = '') => db.insert('Money_Accounts', { name, kind, opening: 0, status: 'active', shareholder_id: shareholderId });
  account('Cash drawer', 'drawer');
  account('bKash', 'bkash');
  account('Bank', 'bank');
  for (const h of holders) account(`Cash with ${h.short}`, 'owner', h.id);
  for (const [name, area] of CATEGORIES) db.insert('Expense_Categories', { name, area, needs_shareholder: false, status: 'active' });
  for (const s of SHIFTS) db.insert('Shifts', { ...s, places: null, positions: [], status: 'active' });
  for (const [name, nameBn] of LEAVE_TYPES) db.insert('Leave_Types', { name, name_bn: nameBn, paid: true, from_balance: true, half_days: true, status: 'active' });
  for (const r of ROUTINES) {
    db.insert('Task_Templates', {
      title: r.title, details: '', staff_id: '', role: r.role, position: '', team_id: '', each: false, priority: 'normal', repeat: r.repeat, every: null, days: [],
      day_of_month: r.day_of_month || null, dates: [], due_time: '', link: r.link, checklist: [], evidence: {}, start_date: today, end_date: '', status: 'active',
    });
  }
}
