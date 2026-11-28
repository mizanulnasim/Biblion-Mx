// Letters from templates. A template is plain text: its first line is the
// title, then paragraphs separated by a blank line. {{name}}-style
// placeholders are filled from the person's record. Plain text (not HTML)
// keeps a template from carrying markup into a printed letter.

export const LETTER_KINDS = Object.freeze(['offer', 'appointment', 'experience', 'release']);

export const PLACEHOLDERS = Object.freeze([
  'today', 'staff_no', 'name', 'name_bn', 'position', 'phone', 'address', 'joined_on', 'left_on', 'salary', 'hours', 'conduct', 'shop_address',
]);

// The placeholders a template uses that aren't known (to refuse a typo).
export function unknownPlaceholders(text) {
  const out = new Set();
  for (const m of text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) if (!PLACEHOLDERS.includes(m[1])) out.add(m[1]);
  return [...out];
}

// {title, paragraphs[]} with every placeholder filled (missing values are
// left empty).
export function fillLetter(template, values) {
  const filled = template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (all, key) => (key in values ? String(values[key] ?? '') : all));
  const [title, ...rest] = filled.trim().split('\n');
  const paragraphs = rest.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { title: title.trim(), paragraphs };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "27 November 2026" (letters are written in English).
export function letterDate(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

// "Tk 1,20,000", grouped the Bangladesh way.
export function taka(amount) {
  const s = String(Math.round(amount));
  const head = s.length > 3 ? `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},` : '';
  return `Tk ${head}${s.slice(-3)}`;
}
