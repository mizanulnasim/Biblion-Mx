// The app's pages, from the route list the build makes (each page's path,
// title, permission and the file its code is in). A page's code loads the
// first time it is opened; the service worker keeps every page file, so
// after that it opens at once, also offline.

const registry = () => window.__bm;
const loading = new Map();

function loadChunk(file) {
  if (!loading.has(file)) {
    loading.set(file, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = file;
      script.onload = resolve;
      script.onerror = () => {
        // A later try may work (the connection came back).
        loading.delete(file);
        script.remove();
        reject(new Error(`page ${file}`));
      };
      document.head.append(script);
    }));
  }
  return loading.get(file);
}

async function pageOf(route) {
  if (route.chunk) await loadChunk(route.chunk);
  const bm = registry();
  const mod = route.chunk ? bm.pages[route.module] : bm.m[route.module];
  return mod[route.name];
}

// Routes for the signed-in person: pages they have no permission for are
// not routes for them at all. onError(err, el) draws a failed load.
export function pageRoutes(can, onError) {
  return ((window.BIBLION_BUILD || {}).routes || []).filter((r) => !r.perm || can(r.perm)).map((r) => ({
    path: r.path,
    title: r.title,
    perm: r.perm,
    mount(el, ctx) {
      let cleanup = null;
      let gone = false;
      pageOf(r).then((page) => {
        if (!gone) cleanup = page.mount(el, ctx) || null;
      }).catch((err) => {
        if (!gone) onError(err, el);
      });
      return () => {
        gone = true;
        if (cleanup) cleanup();
      };
    },
  }));
}
