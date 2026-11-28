import test from 'node:test';
import assert from 'node:assert/strict';
import { coverDays, dailyUse, suggestQty, usedBetween } from '../../shared/cafe/forecast.js';

test('used between counts', () => {
  assert.equal(usedBetween(10, 6, 1, 0, 9), 6);
  assert.equal(usedBetween(2, 0, 0, 0, 5), 0);
});

test('daily use needs enough counted days', () => {
  const counts = [{ date: '2026-11-20', used: 6, days: 1 }, { date: '2026-11-22', used: 10, days: 2 }];
  assert.equal(dailyUse(counts, '2026-11-23', 28, 3), 16 / 3);
  assert.equal(dailyUse(counts, '2026-11-23', 28, 14), null);
  assert.equal(dailyUse(counts, '2026-12-30', 28, 1), null);
});

test('buy-for days: a number, the item\'s own, or automatic; never past shelf life', () => {
  const milk = { shelf_life_days: 3, cover_days: 2 };
  const sugar = { shelf_life_days: 0, cover_days: 30 };
  assert.equal(coverDays(milk, '7'), 3);
  assert.equal(coverDays(milk, 'item'), 2);
  assert.equal(coverDays(milk, 'auto'), 3);
  assert.equal(coverDays(sugar, 'auto'), 30);
  assert.equal(coverDays(sugar, '90'), 90);
});

test('suggested quantity: use over cover and lead time, less on hand, in order multiples', () => {
  const item = { lead_days: 1, order_multiple: 6, min_order: 12 };
  assert.equal(suggestQty(item, 4, 5, 2), 12);
  assert.equal(suggestQty(item, 10, 5, 2), 30);
  assert.equal(suggestQty(item, 1, 50, 2), 0);
  assert.equal(suggestQty(item, null, 0, 2), null);
  assert.equal(suggestQty({}, 2.5, 1, 3), 7);
});
