// Café ordering arithmetic. Pure, so it is tested on its own.

const DAY_MS = 86400000;
const days = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

// What was used between two counts: the earlier count, plus what came in,
// less waste, expiry and the later count.
export function usedBetween(prevCounted, received, wasted, expired, counted) {
  return Math.max(0, prevCounted + received - wasted - expired - counted);
}

// Average use per day over the counts of the last `window` days, or null
// when the counts cover fewer than `minDays` days (not enough to suggest).
// counts: [{date, used, days}] (days: how many days that use covers).
export function dailyUse(counts, today, window, minDays) {
  const recent = counts.filter((c) => c.days > 0 && days(c.date, today) < window);
  const covered = recent.reduce((s, c) => s + c.days, 0);
  if (covered < minDays) return null;
  return recent.reduce((s, c) => s + c.used, 0) / covered;
}

// How many days an order buys for: a number of days, the item's own
// default ('item'), or 'auto' (its shelf life, up to a month). Never more
// than the item's shelf life.
export function coverDays(item, choice) {
  let cover;
  if (choice === 'item') cover = item.cover_days || 14;
  else if (choice === 'auto') cover = item.shelf_life_days ? Math.min(item.shelf_life_days, 30) : 30;
  else cover = Number(choice);
  return item.shelf_life_days ? Math.min(cover, item.shelf_life_days) : cover;
}

// The quantity to order: use over the days bought for plus the days until
// delivery, less what is on hand; rounded up to the order multiple and at
// least the minimum order. null when there is no use to go on.
export function suggestQty(item, daily, onHand, cover) {
  if (daily === null) return null;
  const need = daily * (cover + (item.lead_days || 0)) - onHand;
  if (need <= 0) return 0;
  const multiple = item.order_multiple || 1;
  let qty = Math.ceil(need / multiple - 1e-9) * multiple;
  if (item.min_order && qty < item.min_order) qty = Math.ceil(item.min_order / multiple) * multiple;
  return Math.round(qty * 100) / 100;
}
