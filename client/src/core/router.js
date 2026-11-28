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
  // Each page draws into a box of its own, so a page that finishes loading
  // after the person has moved on draws into a box no longer shown.
  const box = document.createElement('div');
  box.className = 'page';
  outlet.replaceChildren(box);
  outlet.scrollTo(0, 0);
  current = { page, cleanup: page.mount(box, { query }) || null };
  onChange(page, path);
}

let lastHash = location.hash;
// While the person is asked whether to leave, further address changes (the
// Back button) wait; the answer then applies to the latest address.
let asking = false;
async function onHashChange() {
  if (location.hash === lastHash || asking) return;
  // Only forms still on the page count: a form already gone can't lose anything.
  if (hasUnsavedChanges()) {
    asking = true;
    const leave = await confirmLeave();
    asking = false;
    if (!leave) {
      history.replaceState(null, '', lastHash || '#/');
      return;
    }
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
    if (hasUnsavedChanges()) event.preventDefault();
  });
  lastHash = location.hash;
  show();
}

export function stopRouter() {
  window.removeEventListener('hashchange', onHashChange);
  if (current && current.cleanup) current.cleanup();
  current = null;
}

