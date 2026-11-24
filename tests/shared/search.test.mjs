import test from 'node:test';
import assert from 'node:assert/strict';
import { matcher } from '../../shared/lib/search.js';

test('an empty search matches everything (no matcher)', () => {
  assert.equal(matcher(''), null);
  assert.equal(matcher('   '), null);
});

test('words of 3+ characters match anywhere, all words must match', () => {
  const m = matcher('pay rah');
  assert.equal(m('Salary payment to Rahim'), true);
  assert.equal(m('Salary payment to Karim'), false);
});

test('short words match whole words only', () => {
  const m = matcher('tk 50');
  assert.equal(m('Paid tk 50 cash'), true);
  assert.equal(m('Paid tka 500 cash'), false);
});

test('an ISO date is one word', () => {
  const m = matcher('2026-11-21');
  assert.equal(m('entry 2026-11-21 cash'), true);
  assert.equal(m('entry 2026-11-22 cash'), false);
});

test('Bangla digits are read as numbers, in the query and in the text', () => {
  assert.equal(matcher('৫০০')('Tk 500'), true);
  assert.equal(matcher('500')('টাকা ৫০০'), true);
});

test('Bangla vowel signs are part of words', () => {
  assert.equal(matcher('বই')('নতুন বই এসেছে'), true);
  assert.equal(matcher('বই')('বইয়ের দোকান'), false);
});
