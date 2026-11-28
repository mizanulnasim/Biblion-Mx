// The one checklist mechanism (day and month closing, Getting started,
// onboarding, clearance). A module describes its checklist once with
// defineChecklist; the engine adds the steps people tick (kept in
// Checklist_Ticks with who and when), which steps are required, and the
// rule for finishing: every required step done, or a reason to go ahead.
//
// describe:
//   perm             who may see and tick it
//   steps(db, ref)   [{id, state: 'done'|'todo'|'warn', params, manual}];
//                    a manual step's state comes from its tick
//   required(db)     the required step ids (null: every step)
//   locked(db, ref)  true when nothing may be ticked (a closed day)
//   after(ctx, ref)  runs after a tick (onboarding completes itself); what
//                    it returns goes back with the reply

import { AppError } from '../../shared/contract/errors.js';

const LISTS = {};

export function defineChecklist(name, describe) {
  LISTS[name] = describe;
}

function ticksOf(db, name, ref) {
  return db.all('Checklist_Ticks').filter((t) => t.list === name && t.ref === ref);
}

// The steps as people see them. A step that isn't required never blocks:
// left to do, it shows as a warning.
export function checklist(db, name, ref) {
  const list = LISTS[name];
  const ticks = new Map(ticksOf(db, name, ref).map((t) => [t.step, t]));
  const required = list.required ? list.required(db) : null;
  return list.steps(db, ref).map((s) => {
    const out = { params: {}, ...s, required: !required || required.has(s.id) };
    if (s.manual) {
      const tick = ticks.get(s.id);
      out.state = tick && tick.done ? 'done' : 'todo';
      const user = tick && tick.done ? db.get('Users', tick.updated_by) : null;
      out.by = user ? user.display_name : '';
      out.at = tick && tick.done ? tick.updated_at : '';
    }
    if (out.state === 'todo' && !out.required) out.state = 'warn';
    return out;
  });
}

// Required steps not done.
export const missing = (steps) => steps.filter((s) => s.required && s.state === 'todo').map((s) => s.id);

// Finishing: refused while a required step is missing, unless a reason to
// go ahead is given (kept on the record by the caller).
export function checkReady(steps, reason) {
  const left = missing(steps);
  if (left.length && !reason) throw new AppError('VALIDATION', {}, { skip_reason: { code: 'val.steps_reason', params: { count: left.length } } });
  return left;
}

export function tick(ctx, { list: name, ref, step, done }) {
  const { db } = ctx;
  const list = LISTS[name];
  if (!list || !ctx.can(list.perm)) throw new AppError('FORBIDDEN');
  const def = list.steps(db, ref).find((s) => s.id === step);
  if (!def || !def.manual) throw new AppError('NOT_FOUND');
  if (list.locked && list.locked(db, ref)) throw new AppError('CONFLICT', { by: '' });
  const row = ticksOf(db, name, ref).find((t) => t.step === step);
  if (row) db.update('Checklist_Ticks', row, { done });
  else db.insert('Checklist_Ticks', { list: name, ref, step, done });
  return { step, done, ...(list.after ? list.after(ctx, ref) : {}) };
}
