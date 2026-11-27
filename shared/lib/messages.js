// Message text by stable id, with ICU-style placeholders, the same on the
// phone and on the server (emails):
//   {name}                              a value
//   {count, plural, one {…} other {…}}  # inside is the number
// Numbers stored and typed are always Latin digits. Text shown in Bangla
// uses Bangla digits: in the message itself and in number values. String
// values (names, codes, ids) are never changed.

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

export function digitsFor(lang, text) {
  const s = String(text);
  return lang === 'bn' ? s.replace(/[0-9]/g, (d) => BN_DIGITS[d]) : s;
}

// Finds the end of a {...} block starting at `start` (the index of '{').
function closing(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return text.length - 1;
}

function plural(lang, body, n) {
  const forms = {};
  const re = /\s*(=\d+|zero|one|two|few|many|other)\s*\{/g;
  let m;
  while ((m = re.exec(body))) {
    const open = m.index + m[0].length - 1;
    const end = closing(body, open);
    forms[m[1]] = body.slice(open + 1, end);
    re.lastIndex = end + 1;
  }
  const pick = forms[`=${n}`] ?? (n === 1 ? forms.one : undefined) ?? forms.other ?? '';
  return pick.replace(/#/g, digitsFor(lang, n));
}

export function formatMessage(lang, template, params) {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const ch = template[i];
    if (ch !== '{') {
      out += /[0-9]/.test(ch) ? digitsFor(lang, ch) : ch;
      i++;
      continue;
    }
    const end = closing(template, i);
    const inner = template.slice(i + 1, end);
    const comma = inner.indexOf(',');
    if (comma < 0) {
      const value = params[inner.trim()];
      if (value === undefined || value === null) out += '';
      else out += typeof value === 'number' || /^\d{1,2}:\d{2}$/.test(value) ? digitsFor(lang, value) : String(value);
    } else {
      const name = inner.slice(0, comma).trim();
      const rest = inner.slice(comma + 1);
      const body = rest.slice(rest.indexOf(',') + 1);
      out += formatMessage(lang, plural(lang, body, Number(params[name])), params);
    }
    i = end + 1;
  }
  return out;
}
