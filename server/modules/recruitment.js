// Recruitment and onboarding. Applicants move through stages (new,
// interview, offered, then hired, rejected or withdrawn), each move kept
// with a note. Hiring makes their staff record from the offer (position,
// salary, start date) and starts their onboarding checklist, whose steps
// come from Settings. Applicants' names and phones are for
// recruitment.manage only.

import { AppError } from '../../shared/contract/errors.js';
import { saved } from '../../shared/contract/reply.js';
import { saveSetting, setting } from '../kernel/settings.js';
import { page } from '../kernel/paging.js';
import { checklist, defineChecklist } from '../kernel/steps.js';

const fieldError = (field, code, params = {}) => new AppError('VALIDATION', {}, { [field]: { code, params } });
// Where an applicant can go from each stage.
const NEXT = {
  new: ['interview', 'offered', 'rejected', 'withdrawn'],
  interview: ['offered', 'rejected', 'withdrawn'],
  offered: ['hired', 'rejected', 'withdrawn'],
  hired: [], rejected: [], withdrawn: [],
};
const OPEN = ['new', 'interview', 'offered'];

function applicantView(a) {
  return {
    id: a.id, version: a.version, name: a.name, phone: a.phone, position: a.position, source: a.source, notes: a.notes, stage: a.stage,
    history: a.history || [], interview_at: a.interview_at, offer_salary: a.offer_salary, start_date: a.start_date, staff_id: a.staff_id,
    next: NEXT[a.stage], created_at: a.created_at,
  };
}

function list(ctx, query) {
  let rows = ctx.db.all('Applicants');
  if (query.stage === 'open') rows = rows.filter((a) => OPEN.includes(a.stage));
  else if (query.stage) rows = rows.filter((a) => a.stage === query.stage);
  const result = page(rows, query, (a) => `${a.name} ${a.phone} ${a.position} ${a.source}`);
  return { ...result, items: result.items.map(applicantView) };
}

function save(ctx, input) {
  const { db } = ctx;
  const fields = { name: input.name, phone: (input.phone || '').replace(/[^\d+]/g, ''), position: input.position, source: input.source || '', notes: input.notes || '' };
  if (!input.id) {
    const row = db.insert('Applicants', {
      ...fields, stage: 'new', history: [{ stage: 'new', at: db.nowIso, by: ctx.user.display_name, note: '' }],
      interview_at: '', offer_salary: null, start_date: '', staff_id: '',
    });
    return saved(row.id);
  }
  const row = db.get('Applicants', input.id);
  if (!row) throw new AppError('NOT_FOUND');
  db.update('Applicants', row, fields, input.version);
  return saved(row.id);
}

// The checklist as it was set when the person was hired (steps: labels),
// ticked through the steps engine; done when every step is ticked.
function startOnboarding(db, staffId) {
  const steps = setting(db, 'onboarding.steps');
  return db.insert('Onboarding', { staff_id: staffId, steps, status: steps.length ? 'open' : 'done', done_at: steps.length ? '' : db.nowIso });
}

defineChecklist('onboarding', {
  perm: 'recruitment.manage',
  steps: (db, id) => (db.get('Onboarding', id) || { steps: [] }).steps.map((label, i) => ({ id: String(i), label, manual: true })),
  locked: (db, id) => (db.get('Onboarding', id) || {}).status !== 'open',
  after(ctx, id) {
    const { db } = ctx;
    const finished = checklist(db, 'onboarding', id).every((s) => s.state === 'done');
    if (finished) db.update('Onboarding', db.get('Onboarding', id), { status: 'done', done_at: db.nowIso });
    return { finished };
  },
});

// Moves an applicant on. An interview needs its time; an offer its salary
// and start date; hiring makes the staff record and starts onboarding.
function stage(ctx, input) {
  const { db } = ctx;
  const a = db.get('Applicants', input.id);
  if (!a) throw new AppError('NOT_FOUND');
  if (!NEXT[a.stage].includes(input.stage)) throw new AppError('CONFLICT', { by: '' });
  const patch = { stage: input.stage };
  if (input.stage === 'interview') {
    if (!input.interview_at) throw fieldError('interview_at', 'val.required');
    patch.interview_at = input.interview_at;
  }
  if (input.stage === 'offered') {
    if (!input.offer_salary) throw fieldError('offer_salary', 'val.required');
    if (!input.start_date) throw fieldError('start_date', 'val.required');
    Object.assign(patch, { offer_salary: input.offer_salary, start_date: input.start_date });
  }
  if ((input.stage === 'rejected' || input.stage === 'withdrawn') && !input.note) throw fieldError('note', 'val.required');
  if (input.stage === 'hired') {
    if (!ctx.can('staff.edit')) throw new AppError('FORBIDDEN');
    const staff = db.insert('Staff', {
      name: a.name, name_bn: '', phone: a.phone, position: a.position, user_id: '', joined_on: a.start_date, left_on: '', status: 'active',
      work_start: '', work_end: '', days_off: [], nid: '', birth_date: '', address: '', emergency: [], family: '', salary: a.offer_salary || 0,
      pin_hash: '', pin_salt: '', pin_iter: 0, pin_failed: 0, pin_locked_until: '',
    });
    patch.staff_id = staff.id;
    startOnboarding(db, staff.id);
  }
  if (input.note) db.setReason(input.note);
  patch.history = [...(a.history || []), { stage: input.stage, at: db.nowIso, by: ctx.user.display_name, note: input.note || '' }];
  db.update('Applicants', a, patch);
  return saved(a.id, { staff_id: patch.staff_id || '' });
}

// Open onboarding, with what the app already knows about each new person.
function onboarding(ctx) {
  const { db } = ctx;
  const rows = db.all('Onboarding').filter((o) => o.status === 'open');
  return {
    items: rows.map((o) => {
      const staff = db.get('Staff', o.staff_id);
      return {
        id: o.id, version: o.version, steps: checklist(db, 'onboarding', o.id),
        staff: { id: staff.id, name: staff.name, position: staff.position, joined_on: staff.joined_on },
        facts: { sign_in: Boolean(staff.user_id), pin: Boolean(staff.pin_hash) },
      };
    }),
  };
}

function readSettings(db) {
  return { steps: setting(db, 'onboarding.steps') };
}

function saveSettings(ctx, input) {
  saveSetting(ctx.db, 'onboarding.steps', input.steps.map((s) => s.label).filter(Boolean));
  return saved(null, readSettings(ctx.db));
}

export const RECRUITMENT_HANDLERS = {
  'applicants.list': list,
  'applicants.save': save,
  'applicants.stage': stage,
  'onboarding.list': onboarding,
  'settings.onboarding': (ctx) => readSettings(ctx.db),
  'settings.onboarding.save': saveSettings,
};
