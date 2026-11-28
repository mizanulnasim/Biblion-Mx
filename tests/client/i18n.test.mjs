// Message formatting: placeholders, plurals and digits.

import test from 'node:test';
import assert from 'node:assert/strict';

const files = {
  en: { 'a.count': '{count, plural, one {# entry} other {# entries}} for {name}', 'a.page': 'Page {page} of 12' },
  bn: { 'a.count': '{count}টি এন্ট্রি, {name}', 'a.page': 'পাতা {page} / 12' },
};
globalThis.window = { BIBLION_BUILD: { locales: { en: 'en', bn: 'bn' } } };
globalThis.document = { documentElement: {}, body: { classList: { toggle() {} } } };
globalThis.fetch = async (name) => ({ ok: true, json: async () => files[name] });

const { loadLang, t } = await import('../../client/src/core/i18n.js');

test('English plurals and placeholders', async () => {
  await loadLang('en');
  assert.equal(t('a.count', { count: 1, name: 'Rahim' }), '1 entry for Rahim');
  assert.equal(t('a.count', { count: 3, name: 'Rahim' }), '3 entries for Rahim');
});

test('Bangla shows Bangla digits in the text and in numbers, never in names or codes', async () => {
  await loadLang('bn');
  assert.equal(t('a.count', { count: 25, name: 'USR-12' }), '২৫টি এন্ট্রি, USR-12');
  assert.equal(t('a.page', { page: 3 }), 'পাতা ৩ / ১২');
});

test('an unknown id shows the id itself', async () => {
  assert.equal(t('nope.missing'), 'nope.missing');
});
