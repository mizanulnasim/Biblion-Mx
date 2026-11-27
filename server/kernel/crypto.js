// Password hashing (PBKDF2 with HMAC-SHA256) and session tokens.

import { hmacSha256, sha256Bytes, utf8Bytes, uuid } from '../platform.js';

export const KDF_ITERATIONS = 5000;

function toHex(bytes) {
  let out = '';
  for (const b of bytes) out += ((b & 255) + 256).toString(16).slice(1);
  return out;
}

function fromHex(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) {
    const v = parseInt(hex.slice(i, i + 2), 16);
    out.push(v > 127 ? v - 256 : v);
  }
  return out;
}

// One 32-byte block is all a SHA-256 key needs.
function pbkdf2(password, saltHex, iterations) {
  const key = utf8Bytes(password);
  let u = hmacSha256(fromHex(saltHex).concat([0, 0, 0, 1]), key);
  const t = u.slice();
  for (let i = 1; i < iterations; i++) {
    u = hmacSha256(u, key);
    for (let j = 0; j < t.length; j++) t[j] ^= u[j];
  }
  return toHex(t);
}

export function newSalt() {
  return uuid().replace(/-/g, '');
}

export function hashPassword(password, saltHex, iterations) {
  return pbkdf2(password, saltHex, iterations);
}

// Compares two hex strings without stopping at the first difference.
export function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function newToken() {
  return (uuid() + uuid()).replace(/-/g, '');
}

export function tokenHash(token) {
  return toHex(sha256Bytes(token));
}

// HMAC-SHA256 of a text, as hex: what a shop punch device signs with.
export function signHex(text, keyText) {
  return toHex(hmacSha256(utf8Bytes(text), utf8Bytes(keyText)));
}
