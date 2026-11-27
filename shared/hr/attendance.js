// Attendance rules shared by the server, the app and the tests: how far a
// punch is from the shop, the text a shop device signs, when a punch really
// happened, and what a day of punches adds up to.
// Times of day are Bangladesh time (UTC+6), written "HH:MM".

const DHAKA_OFFSET_MS = 6 * 3600000;
const EARTH_RADIUS_M = 6371000;

// A punch that reaches the server this long after it was made was kept on
// the phone (made offline).
export const OFFLINE_AFTER_MS = 2 * 60000;

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

function timeMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// A date and "HH:MM" in Bangladesh, as an ISO time.
export function dhakaIso(date, hhmm) {
  return new Date(Date.parse(`${date}T${hhmm}:00Z`) - DHAKA_OFFSET_MS).toISOString();
}

// Day of the week of a date: 0 Sunday … 6 Saturday.
function weekday(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
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
//   hours: {start, end, days_off} (start/end may be empty: no set hours)
//   punches: that day's counted punches, any order: {type, at (ms), status}
//   nowMs: now; rules: {late_grace, early_grace, incomplete_after} minutes
// state: off, not_in, absent, in, out, incomplete; minutes are whole numbers.
export function daySummary({ date, hours, punches, nowMs, rules }) {
  const sorted = punches.slice().sort((a, b) => a.at - b.at);
  const today = dhakaDate(nowMs);
  const past = date < today;
  const nowMin = date === today ? dhakaMinutes(nowMs) : 24 * 60;
  const dayOff = Boolean(hours && (hours.days_off || []).includes(weekday(date)));
  const start = hours && hours.start ? timeMinutes(hours.start) : null;
  const end = hours && hours.end ? timeMinutes(hours.end) : null;
  const ins = sorted.filter((p) => p.type === 'in');
  const outs = sorted.filter((p) => p.type === 'out');
  const out = {
    date, state: '', day_off: dayOff,
    first_in: ins.length ? ins[0].at : null,
    last_out: outs.length ? outs[outs.length - 1].at : null,
    worked_min: 0, late_min: 0, early_min: 0,
    waiting: sorted.some((p) => p.status === 'check'),
  };
  // Worked time: each "in" to the next "out".
  let openAt = null;
  for (const p of sorted) {
    if (p.type === 'in' && openAt === null) openAt = p.at;
    if (p.type === 'out' && openAt !== null) {
      out.worked_min += Math.round((p.at - openAt) / 60000);
      openAt = null;
    }
  }
  if (!sorted.length) {
    if (dayOff || start === null) out.state = dayOff ? 'off' : (past ? 'absent' : 'not_in');
    else out.state = past || (end !== null && nowMin > end) ? 'absent' : 'not_in';
    return out;
  }
  if (start !== null && !dayOff) {
    const late = dhakaMinutes(out.first_in) - start - rules.late_grace;
    if (late > 0) out.late_min = late + rules.late_grace;
  }
  if (openAt !== null) {
    const overdue = end === null ? past : (past || nowMin > end + rules.incomplete_after);
    out.state = overdue ? 'incomplete' : 'in';
    return out;
  }
  out.state = 'out';
  if (end !== null && !dayOff && out.last_out !== null) {
    const early = end - dhakaMinutes(out.last_out) - rules.early_grace;
    if (early > 0) out.early_min = early + rules.early_grace;
  }
  return out;
}

// What the person's next punch is: "out" after an "in" today, else "in".
export function nextType(todayPunches) {
  const sorted = todayPunches.slice().sort((a, b) => a.at - b.at);
  const last = sorted[sorted.length - 1];
  return last && last.type === 'in' ? 'out' : 'in';
}
