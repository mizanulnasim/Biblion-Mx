import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../shared/lib/validate.js';

const schema = {
  name: { type: 'text', required: true, max: 5 },
  user: { type: 'username', required: true, min: 3 },
  pw: { type: 'password' },
  n: { type: 'int', min: 1, max: 10 },
  kind: { type: 'enum', values: ['a', 'b'] },
  accent: { type: 'color' },
};

test('valid input is cleaned and unknown keys are dropped', () => {
  const r = validate(schema, { name: ' Ann ', user: ' Ann.B ', n: '7', kind: 'a', accent: '#AABBCC', allow_duplicate: true });
  assert.equal(r.fields, null);
  assert.deepEqual(r.value, { name: 'Ann', user: 'ann.b', pw: null, n: 7, kind: 'a', accent: '#aabbcc' });
});

test('each problem is reported on its own field with a message id', () => {
  const r = validate(schema, { name: 'Too long name', user: 'a b', pw: 'short', n: 0, kind: 'z', accent: 'red' });
  assert.deepEqual(r.fields, {
    name: { code: 'val.too_long', params: { max: 5 } },
    user: { code: 'val.username', params: {} },
    pw: { code: 'val.too_short', params: { min: 8 } },
    n: { code: 'val.min', params: { min: 1 } },
    kind: { code: 'val.choice', params: {} },
    accent: { code: 'val.format', params: {} },
  });
});

test('required fields', () => {
  const r = validate(schema, {});
  assert.deepEqual(Object.keys(r.fields), ['name', 'user']);
  assert.equal(r.fields.name.code, 'val.required');
});

test('numbers typed with Bangla digits are stored with Latin digits', () => {
  assert.equal(validate({ n: { type: 'int' } }, { n: '১২' }).value.n, 12);
});
