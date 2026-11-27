// What a day was meant to be for one person, from (most important first):
//   1. approved leave                        → leave
//   2. a public holiday, when the shop closes → holiday
//   3. the rota for that date: a shift or a day off
//   4. their usual hours and weekly days off
// A holiday when the shop stays open keeps the rota; it is only named.


// Day of the week of a date: 0 Sunday … 6 Saturday.
function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date, n) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

// Every date from `from` to `to`, both included.
export function datesBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// The rota alone (no leave or holidays).
//   staff: {work_start, work_end, days_off}
//   row: the rota row for the date, if any: {mode: usual, off or hours,
//        start, end, shift_id}; 'usual' is the same as no row
//   shifts: Map of id → {name}, to name the shift the hours came from
export function rotaPlan(staff, date, row, shifts) {
  if (row && row.mode === 'off') return { kind: 'off', start: '', end: '', shift: '', set: true };
  if (row && row.mode === 'hours') {
    const shift = shifts.get(row.shift_id);
    return { kind: 'work', start: row.start, end: row.end, shift: shift ? shift.name : '', shift_id: row.shift_id, set: true };
  }
  if ((staff.days_off || []).includes(weekday(date))) return { kind: 'off', start: '', end: '', shift: '', set: false };
  return { kind: 'work', start: staff.work_start || '', end: staff.work_end || '', shift: '', set: false };
}

// The middle of a day's hours, "HH:MM".
function midpoint(start, end) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const m = Math.round((toMin(start) + toMin(end)) / 2);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// The whole plan. leave: the approved leave covering the date, if any
// ({paid, half: '' | first | second}); holiday: the public holiday on the
// date, if any; closed: whether the shop closes on public holidays. A half
// day's leave leaves the other half to work: the hours expected are halved.
export function dayPlan(rota, { leave = null, holiday = null, closed = false } = {}) {
  const named = holiday ? { holiday: holiday.name } : {};
  const leaveKind = leave ? (leave.paid ? 'paid' : 'unpaid') : '';
  if (leave && leave.half && rota.kind === 'work') {
    const hours = rota.start && rota.end ? (leave.half === 'first' ? { start: midpoint(rota.start, rota.end) } : { end: midpoint(rota.start, rota.end) }) : {};
    return { ...rota, ...hours, ...named, half_leave: leave.half, leave_kind: leaveKind };
  }
  if (leave) return { ...rota, ...named, kind: 'leave', leave_kind: leaveKind };
  if (holiday && closed) return { ...rota, ...named, kind: 'holiday' };
  return { ...rota, ...named };
}
