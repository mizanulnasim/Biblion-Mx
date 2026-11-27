// Signing on a shop punch device (Web Crypto). The key for a person is made
// from their PIN exactly as the server keeps it (PBKDF2-HMAC-SHA256, one
// 32-byte block), then each punch is signed with HMAC-SHA256 using the
// device's secret and that key. The PIN itself is never stored or sent.

const encoder = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function pinKey(pin, saltHex, iterations) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, base, 256);
  return toHex(bits);
}

export async function signHex(text, keyText) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}
