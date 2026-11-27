// Messages by stable id, in the person's language (shared/lib/messages.js
// for the placeholders and digits).

import { digitsFor, formatMessage } from '../../../shared/lib/messages.js';

let lang = 'en';
let messages = {};

export function localDigits(text) {
  return digitsFor(lang, text);
}

export function getLang() {
  return lang;
}

export async function loadLang(next) {
  const files = (window.BIBLION_BUILD || {}).locales || {};
  const res = await fetch(files[next]);
  if (!res.ok) throw new Error(`locale ${next}`);
  messages = await res.json();
  lang = next;
  document.documentElement.lang = next;
  document.body.classList.toggle('bn', next === 'bn');
}

export function t(id, params = {}) {
  const template = messages[id];
  return template === undefined ? id : formatMessage(lang, template, params);
}
