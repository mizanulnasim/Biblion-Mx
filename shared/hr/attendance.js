// Attendance rules shared by the server, the app and the tests: how far a
// punch is from the shop, the text a shop device signs, when a punch really
// happened, and what a day of punches adds up to.
// Times of day are Bangladesh time (UTC+6), written "HH:MM".

const DHAKA_OFFSET_MS = 6 * 3600000;
const EARTH_RADIUS_M = 6371000;

// A punch that reaches the server this long after it was made was kept on
// the phone (made offline).
export const OFFLINE_AFTER_MS = 2 * 60000;

// The kinds of punch: in, a break and back from it (recorded and paid), out.
export const PUNCH_TYPES = Object.freeze(['in', 'break', 'back', 'out']);

// Statuses a punch can have: ok, check (waits for a manager), rejected, and
// replaced (by an approved correction). Only ok and check count.
export const COUNTED = Object.freeze(['ok', 'check']);

export function dhakaDate(ms) {
  return new Date(ms + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

// Minutes since midnight, Bangladesh time.
export function dhakaMinutes(ms) {
  const d = new Date(ms + DHAKA_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function timeMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// A date and "HH:MM" in Bangladesh, as an ISO time.
export function dhakaIso(date, hhmm) {
  return new Date(Date.parse(`${date}T${hhmm}:00Z`) - DHAKA_OFFSET_MS).toISOString();
}

// Metres between two points (haversine).
export function distanceM(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

// What a shop device signs for one punch, so a punch can't be made up or
// changed on the way.
export function punchText(p) {
  const opt = (v) => (v === null || v === undefined ? '' : String(v));
  return [p.punch_id, p.staff_id, p.type, p.device_ts, opt(p.lat), opt(p.lng), opt(p.accuracy), p.device_id].join('|');
}

// When the punch happened, by the server's clock. The phone says when it was
// pressed (deviceMs) and what its clock showed when it sent it (clientMs),
// so a phone clock that is wrong is corrected. Never later than now.
export function punchMoment(deviceMs, clientMs, serverMs) {
  const skew = clientMs === null ? 0 : clientMs - serverMs;
  return { at: Math.min(deviceMs - skew, serverMs), skewMs: skew };
}

// A day for one person.
//   plan: what the day was meant to be (shared/hr/plan.js): {kind: work,
//         off, leave or holiday, start, end} (start/end empty: no set hours)
//   punches: that day's counted punches, any order: {type, at (ms), status}
//   nowMs: now; rules: {late_grace, early_grace, incomplete_after} minutes
// state: off, leave, holiday, not_in, absent, in, out, incomplete. Someone
// who punches on a day they were not meant to work is never late or early.
export function daySummary({ date, plan, punches, nowMs, rules }) {
  const sorted = punches.slice().sort((a, b) => a.at - b.at);
  const today = dhakaDate(nowMs);
  const past = date < today;
  const nowMin = date === today ? dhakaMinutes(nowMs) : 24 * 60;
  const working = plan.kind === 'work';
  const start = working && plan.start ? timeMinutes(plan.start) : null;
  const end = working && plan.end ? timeMinutes(plan.end) : null;
  const ins = sorted.filter((p) => p.type === 'in');
  const outs = sorted.filter((p) => p.type === 'out');
  const out = {
    date, state: '', plan,
    first_in: ins.length ? ins[0].at : null,
    last_out: outs.length ? outs[outs.length - 1].at : null,
    worked_min: 0, break_min: 0, late_min: 0, early_min: 0,
    waiting: sorted.some((p) => p.status === 'check'),
  };
  // Worked time: each "in" to the next "out", breaks included (they are
  // paid); break time: each "break" to the next "back" (or "out").
  let openAt = null;
  let breakAt = null;
  for (const p of sorted) {
    if (p.type === 'in' && openAt === null) openAt = p.at;
    if (p.type === 'break' && openAt !== null && breakAt === null) breakAt = p.at;
    if ((p.type === 'back' || p.type === 'out') && breakAt !== null) {
      out.break_min += Math.round((p.at - breakAt) / 60000);
      breakAt = null;
    }
    if (p.type === 'out' && openAt !== null) {
      out.worked_min += Math.round((p.at - openAt) / 60000);
      openAt = null;
    }
  }
  if (!sorted.length) {
    if (!working) out.state = plan.kind;
    else if (start === null) out.state = past ? 'absent' : 'not_in';
    else out.state = past || (end !== null && nowMin > end) ? 'absent' : 'not_in';
    return out;
  }
  if (start !== null) {
    const late = dhakaMinutes(out.first_in) - start - rules.late_grace;
    if (late > 0) out.late_min = late + rules.late_grace;
  }
  if (openAt !== null) {
    const overdue = end === null ? past : (past || nowMin > end + rules.incomplete_after);
    out.state = overdue ? 'incomplete' : breakAt !== null ? 'break' : 'in';
    return out;
  }
  out.state = 'out';
  if (end !== null && out.last_out !== null) {
    const early = end - dhakaMinutes(out.last_out) - rules.early_grace;
    if (early > 0) out.early_min = early + rules.early_grace;
  }
  return out;
}

// The punches that may come after one of `type` (none yet: ''), the usual
// one first: in; then out or a break; after a break, back.
export function typesAfter(type) {
  if (type === 'in' || type === 'back') return ['out', 'break'];
  if (type === 'break') return ['back'];
  return ['in'];
}

// The punches the person may make next, from today's.
export function nextTypes(todayPunches) {
  const sorted = todayPunches.slice().sort((a, b) => a.at - b.at);
  return typesAfter(sorted.length ? sorted[sorted.length - 1].type : '');
}

// Whether a moment falls outside the shop's hours ("HH:MM" to "HH:MM",
// Bangladesh time).
export function outsideHours(ms, open, close) {
  const m = dhakaMinutes(ms);
  return m < timeMinutes(open) || m > timeMinutes(close);
}
