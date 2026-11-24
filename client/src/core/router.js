// Hash routes: #/path?key=value. A page is {path, title, perm?, mount(el, ctx)}
// where mount returns an optional cleanup function.
// Leaving a page with unsaved changes asks first.

let routes = [];
let current = null;
let outlet = null;
let onChange = () => {};
const dirtyForms = new Set();
let confirmLeave = async () => true;

export function markDirty(form, dirty) {
  if (dirty) dirtyForms.add(form);
  else dirtyForms.delete(form);
}

export function isDirty(form) {
  return dirtyForms.has(form);
}

export function hasUnsavedChanges() {
  return [...dirtyForms].some((form) => form.isConnected);
}

function parse(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(query)) };
}

function show() {
  const { path, query } = parse(location.hash);
  const page = routes.find((r) => r.path === path) || routes.find((r) => r.path === '*');
  if (current && current.cleanup) current.cleanup();
  dirtyForms.clear();
  outlet.replaceChildren();
  outlet.scrollTo(0, 0);
  current = { page, cleanup: page.mount(outlet, { query }) || null };
  onChange(page, path);
}

let lastHash = location.hash;
async function onHashChange() {
  if (location.hash === lastHash) return;
  if (dirtyForms.size && !(await confirmLeave())) {
    history.replaceState(null, '', lastHash || '#/');
    return;
  }
  lastHash = location.hash;
  show();
}

export function startRouter(options) {
  routes = options.routes;
  outlet = options.outlet;
  onChange = options.onChange;
  confirmLeave = options.confirmLeave;
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('beforeunload', (event) => {
    if (dirtyForms.size) event.preventDefault();
  });
  lastHash = location.hash;
  show();
}

export function stopRouter() {
  window.removeEventListener('hashchange', onHashChange);
  if (current && current.cleanup) current.cleanup();
  current = null;
}

