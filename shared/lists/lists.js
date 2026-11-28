// Setup lists, each described once. From a description come its table
// (server/store/tables.js), its actions (shared/contract/actions.js), its
// server handlers (server/modules/lists.js) and its Setup page section
// (client/src/pages/setup-lists.js).
//
//   table    sheet name; prefix: record id prefix
//   group    spreadsheet group; page: the Setup page it is shown on
//   perm     permission to see and change it
//   title, add, help   message ids for the section
//   fields   name → field. Every list also has name, name_bn and status.
//            kind: text | long | bool | int | number | choice | ref
//            label/help: message ids; choices: value → message id;
//            ref: another list's key (stored as that record's id)
//   columns  fields shown in the table, after the name
//   usedBy   [table, column] pairs: a record referenced there can't be deleted
//   start    the rows made at the first setup (rulebook S3); a reference
//            is given as the other record's name
//
// Nothing is deleted outright: a shareholder's delete marks an unused record
// "deleted", which hides it everywhere and keeps it in the activity log.

const TASK_KINDS = Object.freeze({ checklist: 'lists.kind.checklist', task: 'lists.kind.task' });

const designation = (name, name_bn, department, hours, flex, flexStart, late, days) => ({
  name, name_bn, department_id: department, hours_required: hours, flex_hours: flex, flex_start: flexStart, late_applies: late, break_min: 0, days_week: days,
});

const docCategory = (name, name_bn, sensitive, staffSee, expiry, onboarding) => ({
  name, name_bn, sensitive, staff_see: staffSee, has_expiry: expiry, onboarding,
});

export const LISTS = Object.freeze({
  departments: {
    table: 'Departments', prefix: 'DEP', group: 'hr', page: 'hr', perm: 'setup.hr',
    title: 'lists.departments', add: 'lists.add_department', help: 'lists.departments_help',
    fields: { about: { kind: 'text', max: 200, label: 'lists.about' } },
    columns: ['about'],
    usedBy: [['Designations', 'department_id']],
    start: [
      { name: 'Café', name_bn: 'ক্যাফে', about: 'Coffee bar, kitchen and service' },
      { name: 'Bookstore', name_bn: 'বইয়ের দোকান', about: 'Books, shelves and sales' },
      { name: 'Management', name_bn: 'ব্যবস্থাপনা', about: 'Operations and administration' },
    ],
  },
  designations: {
    table: 'Designations', prefix: 'DSG', group: 'hr', page: 'hr', perm: 'setup.hr',
    title: 'lists.designations', add: 'lists.add_designation', help: 'lists.designations_help',
    fields: {
      department_id: { kind: 'ref', ref: 'departments', required: true, label: 'lists.department' },
      hours_required: { kind: 'number', min: 0, max: 24, label: 'lists.hours_required', help: 'lists.hours_required_help' },
      flex_hours: { kind: 'number', min: 0, max: 12, label: 'lists.flex_hours', help: 'lists.flex_hours_help' },
      flex_start: { kind: 'bool', label: 'lists.flex_start', help: 'lists.flex_start_help' },
      late_applies: { kind: 'bool', label: 'lists.late_applies' },
      break_min: { kind: 'int', min: 0, max: 240, label: 'lists.break_min' },
      days_week: { kind: 'int', min: 1, max: 7, label: 'lists.days_week' },
      responsibilities: { kind: 'long', max: 4000, label: 'lists.responsibilities', help: 'lists.responsibilities_help' },
    },
    columns: ['department_id', 'hours_required', 'flex_hours'],
    usedBy: [],
    start: [
      {
        ...designation('Barista', 'বারিস্তা', 'Café', 8, 1, false, true, 6),
        responsibilities: 'Beverage preparation to Biblion recipes and standards\nCoffee machine cleaning and daily maintenance\nIngredient stock checks and reorder requests\nFood safety and hygiene\nOpening and closing duties for the coffee bar\nCustomer service\nReporting equipment problems promptly',
      },
      {
        ...designation('Manager', 'ম্যানেজার', 'Management', 8, 0, true, false, 6),
        responsibilities: 'Daily operations and staff supervision\nRoster, attendance and leave approvals\nCash, sales and stock oversight\nCustomer issues and escalations\nOpening and closing control',
      },
      {
        ...designation('Service person', 'সার্ভিস কর্মী', 'Café', 12, 0, false, true, 6),
        responsibilities: 'Table service and cleaning\nWashroom checks\nBookshelf tidying\nSupporting opening and closing\nCustomer service',
      },
    ],
  },
  employment_types: {
    table: 'Employment_Types', prefix: 'EMT', group: 'hr', page: 'hr', perm: 'setup.hr',
    title: 'lists.employment_types', add: 'lists.add_employment_type', help: 'lists.employment_types_help',
    fields: {},
    columns: [],
    usedBy: [],
    start: [
      { name: 'Full-time', name_bn: 'পূর্ণকালীন' },
      { name: 'Part-time', name_bn: 'খণ্ডকালীন' },
      { name: 'Contract', name_bn: 'চুক্তিভিত্তিক' },
      { name: 'Intern', name_bn: 'শিক্ষানবিশ' },
    ],
  },
  doc_categories: {
    table: 'Doc_Categories', prefix: 'DCT', group: 'hr', page: 'hr', perm: 'setup.hr',
    title: 'lists.doc_categories', add: 'lists.add_doc_category', help: 'lists.doc_categories_help',
    fields: {
      sensitive: { kind: 'bool', label: 'lists.sensitive', help: 'lists.sensitive_help' },
      staff_see: { kind: 'bool', label: 'lists.staff_see', help: 'lists.staff_see_help' },
      has_expiry: { kind: 'bool', label: 'lists.has_expiry' },
      onboarding: { kind: 'bool', label: 'lists.onboarding', help: 'lists.onboarding_help' },
    },
    columns: ['sensitive', 'staff_see', 'has_expiry', 'onboarding'],
    usedBy: [],
    start: [
      docCategory('CV', 'সিভি', false, true, false, true),
      docCategory('Photograph', 'ছবি', false, true, false, true),
      docCategory('NID (front)', 'জাতীয় পরিচয়পত্র (সামনে)', true, true, false, true),
      docCategory('NID (back)', 'জাতীয় পরিচয়পত্র (পেছনে)', true, true, false, true),
      docCategory('Passport', 'পাসপোর্ট', true, true, true, false),
      docCategory('Educational certificate', 'শিক্ষাগত সনদ', false, true, false, false),
      docCategory('Training certificate', 'প্রশিক্ষণ সনদ', false, true, true, false),
      docCategory('Offer letter', 'অফার লেটার', false, true, false, false),
      docCategory('Appointment letter', 'নিয়োগপত্র', false, true, false, false),
      docCategory('Signed offer / appointment', 'স্বাক্ষরিত অফার / নিয়োগপত্র', false, true, false, true),
      docCategory('Job description', 'কাজের বিবরণ', false, true, false, false),
      docCategory('Signed responsibilities', 'স্বাক্ষরিত দায়িত্ব', false, true, false, false),
      docCategory('Agreement', 'চুক্তিপত্র', false, true, true, false),
      docCategory('Confidentiality agreement', 'গোপনীয়তা চুক্তি', false, true, false, false),
      docCategory('Performance record', 'কাজের মূল্যায়ন', true, false, false, false),
      docCategory('Warning letter', 'সতর্কীকরণ পত্র', true, true, false, false),
      docCategory('Resignation', 'পদত্যাগপত্র', false, true, false, false),
      docCategory('Clearance', 'ছাড়পত্র', false, true, false, false),
      docCategory('Experience certificate', 'অভিজ্ঞতার সনদ', false, true, false, false),
      docCategory('Release letter', 'অব্যাহতিপত্র', false, true, false, false),
      docCategory('Final settlement', 'চূড়ান্ত নিষ্পত্তি', true, true, false, false),
      docCategory('Payslip', 'বেতন স্লিপ', true, true, false, false),
      docCategory('Other', 'অন্যান্য', false, true, true, false),
    ],
  },
  task_categories: {
    table: 'Task_Categories', prefix: 'TCT', group: 'core', page: 'tasks', perm: 'setup.tasks',
    title: 'lists.task_categories', add: 'lists.add_task_category', help: 'lists.task_categories_help',
    fields: { kind: { kind: 'choice', choices: TASK_KINDS, required: true, label: 'lists.kind' } },
    columns: ['kind'],
    usedBy: [],
    start: [
      ...[
        ['Opening', 'খোলা'], ['Closing', 'বন্ধ করা'], ['Table cleaning', 'টেবিল পরিষ্কার'], ['Washroom check', 'ওয়াশরুম দেখা'],
        ['Fridge temperature', 'ফ্রিজের তাপমাত্রা'], ['Sales & cash', 'বিক্রি ও নগদ'], ['Stock', 'স্টক'], ['Coffee machine', 'কফি মেশিন'],
        ['Bookshelves', 'বইয়ের তাক'], ['Equipment', 'যন্ত্রপাতি'], ['Food safety', 'খাদ্য নিরাপত্তা'],
      ].map(([name, name_bn]) => ({ name, name_bn, kind: 'checklist' })),
      ...[
        ['General', 'সাধারণ'], ['Events', 'অনুষ্ঠান'], ['Meeting', 'মিটিং'], ['Accounts', 'হিসাব'], ['Books', 'বই'], ['Follow-up', 'ফলো-আপ'],
      ].map(([name, name_bn]) => ({ name, name_bn, kind: 'task' })),
    ],
  },
});

const COMMON = {
  name: { kind: 'text', required: true, max: 80, label: 'users.name' },
  name_bn: { kind: 'text', max: 80, label: 'cafe.name_bn' },
};

// Every field of a list, the common ones first.
export function listFields(key) {
  return { ...COMMON, ...LISTS[key].fields };
}

const COLUMN_TYPE = { text: 's', long: 's', bool: 'b', int: 'n', number: 'n', choice: 's', ref: 's' };

// The table each list is stored in, for server/store/tables.js.
export function listTables() {
  const out = {};
  for (const key of Object.keys(LISTS)) {
    const list = LISTS[key];
    const columns = Object.entries(listFields(key)).map(([name, f]) => (COLUMN_TYPE[f.kind] === 's' ? name : `${name}:${COLUMN_TYPE[f.kind]}`));
    out[list.table] = { group: list.group, prefix: list.prefix, columns: [...columns, 'status'] };
  }
  return out;
}

const VALIDATOR = {
  text: (f) => ({ type: 'text', max: f.max }),
  long: (f) => ({ type: 'text', max: f.max }),
  bool: () => ({ type: 'bool' }),
  int: (f) => ({ type: 'int', min: f.min, max: f.max }),
  number: (f) => ({ type: 'number', min: f.min, max: f.max }),
  choice: (f) => ({ type: 'enum', values: Object.keys(f.choices) }),
  ref: () => ({ type: 'id' }),
};

// The save action's payload rules (shared/lib/validate.js).
export function listSchema(key) {
  const schema = { id: { type: 'id' }, version: { type: 'int', min: 1 }, status: { type: 'enum', required: true, values: ['active', 'inactive'] }, confirm_similar: { type: 'bool' } };
  for (const [name, f] of Object.entries(listFields(key))) schema[name] = { ...VALIDATOR[f.kind](f), required: Boolean(f.required) };
  return schema;
}
