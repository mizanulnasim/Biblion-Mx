// The list search used by every paged list.
//   - words of 3 or more characters match anywhere
//   - shorter words match whole words only
//   - an ISO date (2026-11-21) counts as one word
//   - Bangla digits are read as Latin digits
//   - Bangla vowel signs are part of a word, never a separator

const BN_ZERO = 0x09e6;

export function latinDigits(text) {
  return String(text).replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - BN_ZERO));
}

function normalise(text) {
  return latinDigits(text).toLowerCase();
}

const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;
// Letters, digits and combining marks (Bangla vowel signs, hasanta) make words.
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

function words(text) {
  const dates = text.match(ISO_DATE) || [];
  const rest = text.replace(ISO_DATE, ' ').match(WORD) || [];
  return [...dates, ...rest];
}

// Returns a predicate over a row's searchable text, or null when the query is empty.
export function matcher(query) {
  const terms = words(normalise(query || ''));
  if (!terms.length) return null;
  return (haystack) => {
    const text = normalise(haystack);
    let wordSet = null;
    return terms.every((term) => {
      if (term.length >= 3) return text.includes(term);
      if (!wordSet) wordSet = new Set(words(text));
      return wordSet.has(term);
    });
  };
}
