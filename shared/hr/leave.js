// Leave earned and leave used, worked out the same way everywhere.
//
// Earning starts when probation ends (joined date + probation months).
//   timing 'service_month':  `rate` days for every full month of service
//                            after that (a month ends on the same day of
//                            the next month).
//   timing 'calendar_month': `rate` days for every full calendar month
//                            after that; the first, part month counts in
//                            proportion to its days ('prorate_days') or
//                            not at all ('none').
// The month running now never counts. Amounts are kept to two decimals.

const round2 = (n) => Math.round(n * 100) / 100;

function addMonths(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const daysInMonth = (date) => {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// The first date leave is earned from.
export function earningFrom(joinedOn, probationMonths) {
  return addMonths(joinedOn, probationMonths);
}

export function earnedLeave({ joined_on, as_of, rate, probation_months, timing, partial }) {
  const start = earningFrom(joined_on, probation_months);
  if (as_of < start) return 0;
  if (timing === 'service_month') {
    let months = 0;
    while (addMonths(start, months + 1) <= as_of) months++;
    return round2(months * rate);
  }
  // Calendar months: the part month the earning starts in, then whole months.
  let earned = 0;
  const firstOfNext = addMonths(`${start.slice(0, 8)}01`, 1);
  if (firstOfNext <= as_of && partial === 'prorate_days') {
    const days = daysInMonth(start) - Number(start.slice(8)) + 1;
    earned += (rate * days) / daysInMonth(start);
  }
  if (start.slice(8) === '01' && firstOfNext <= as_of && partial !== 'prorate_days') earned += rate;
  for (let m = firstOfNext; addMonths(m, 1) <= as_of; m = addMonths(m, 1)) earned += rate;
  return round2(earned);
}

// How many days a leave takes: every date ('calendar'), or only the dates
// the person was meant to work ('working'). plans: the rota plan of each
// date in the leave (without the leave itself).
export function leaveDays(plans, counting) {
  if (counting === 'calendar') return plans.length;
  return plans.filter((p) => p.kind === 'work').length;
}
