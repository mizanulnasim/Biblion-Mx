// The one duplicate service. Typed entries use it now; uploads, imports and
// the nightly check use the same guards when they are built.
//
//   findDuplicates(entry, others) → warnings[]
//
// `others` are the entries that still count: cancelled and replaced ones
// are left out by the caller (v1 forgot "removed"), and so is the entry
// being corrected. A warning is
//   {code, params, existing: [ids], fix?: {kind, …figures}}
// Saving past a warning needs a reason, and the entry then waits for a
// shareholder. Guards that block outright (the same vendor bill number)
// come with the vendor kinds.

const DAY_MS = 86400000;
const TWIN_DAYS = 7;
// A word start is any non-letter, so Bangla words match too (\b does not see Bangla letters).
const TRANSFER_WORDS = /(?:^|[^\p{L}\p{M}])(bkash|bank|cash ?out|deposit|বিকাশ|ব্যাংক)/iu;

function daysApart(a, b) {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;
}

// What an entry is "about", for comparing like with like.
function partyKey(e) {
  if (e.kind === 'transfer') return `${e.account_id}>${e.to_account_id}`;
  return e.category_id || e.party_id || e.account_id || '';
}

// A. Same kind, same party or category, same amount, within 7 days.
function twins(entry, others) {
  const found = others.filter((o) => o.kind === entry.kind && o.amount === entry.amount
    && partyKey(o) === partyKey(entry) && daysApart(o.date, entry.date) <= TWIN_DAYS);
  return found.length ? [{ code: 'dup.twin', params: { days: TWIN_DAYS }, existing: found.map((o) => o.id) }] : [];
}

// I. An expense and an income of the same amount on the same day in two of
// the shop's accounts is probably one transfer entered twice.
function transferPair(entry, others) {
  const opposite = { expense: 'income', income: 'expense' }[entry.kind];
  if (!opposite) return [];
  const pair = others.find((o) => o.kind === opposite && o.amount === entry.amount && o.date === entry.date && o.account_id !== entry.account_id);
  if (!pair) return [];
  const [from, to] = entry.kind === 'expense' ? [entry.account_id, pair.account_id] : [pair.account_id, entry.account_id];
  return [{
    code: 'dup.transfer_pair',
    params: {},
    existing: [pair.id],
    fix: { kind: 'transfer', date: entry.date, amount: entry.amount, account_id: from, to_account_id: to, pair_id: pair.id },
  }];
}

// I. An expense or income whose note mentions bKash, a bank, cash out or a
// deposit may be money moving between the shop's own accounts.
function transferWords(entry) {
  if ((entry.kind !== 'expense' && entry.kind !== 'income') || !TRANSFER_WORDS.test(entry.note || '')) return [];
  const fix = { kind: 'transfer', date: entry.date, amount: entry.amount };
  if (entry.kind === 'expense') fix.account_id = entry.account_id;
  else fix.to_account_id = entry.account_id;
  return [{ code: 'dup.transfer_words', params: {}, existing: [], fix }];
}

// F. A due already in a daily shift, and a separate "Due taken" for the
// same person, amount and day: warned both ways.
function dueTwice(entry, others) {
  const sameDue = (shift, partyId, amount) => shift.kind === 'daily_shift' && shift.date === entry.date
    && shift.details.dues.some((d) => d.party_id === partyId && d.amount === amount);
  if (entry.kind === 'due_taken') {
    const found = others.filter((o) => sameDue(o, entry.party_id, entry.amount));
    return found.length ? [{ code: 'dup.due_in_shift', params: {}, existing: found.map((o) => o.id) }] : [];
  }
  if (entry.kind !== 'daily_shift') return [];
  const found = others.filter((o) => o.kind === 'due_taken' && o.date === entry.date
    && entry.details.dues.some((d) => d.party_id === o.party_id && d.amount === o.amount));
  return found.length ? [{ code: 'dup.due_entered', params: {}, existing: found.map((o) => o.id) }] : [];
}

export function findDuplicates(entry, others) {
  if (entry.kind === 'daily_shift') return dueTwice(entry, others);
  return [...twins(entry, others), ...transferPair(entry, others), ...transferWords(entry), ...dueTwice(entry, others)];
}
