// Escape-by-default HTML. Every value placed in an html`` template is escaped
// unless it is itself the result of html``. There is no way to insert a raw
// string, so text from the server can never become markup.

class SafeHtml {
  constructor(text) {
    this.text = text;
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

function piece(value) {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof SafeHtml) return value.text;
  if (Array.isArray(value)) return value.map(piece).join('');
  return String(value).replace(/[&<>"'`]/g, (c) => ESCAPES[c]);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += piece(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

export function render(element, content) {
  element.innerHTML = piece(content);
}

// Calls handlers[name] for clicks (or other events) on elements with data-act="name".
export function on(root, type, handlers) {
  const listener = (event) => {
    const target = event.target.closest('[data-act]');
    if (target && root.contains(target) && handlers[target.dataset.act]) handlers[target.dataset.act](event, target);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}
