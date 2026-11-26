// Service worker. The build puts `self.BUILD = {id, shell}` above this file.
//   - Hashed files (scripts, styles, locales, icons): cache first.
//   - The page itself: network first; if the network takes longer than
//     2.5 s, the cached copy is used.
//   - API calls are never cached here (the app keeps its own copies).
// The cache name carries the build id, so every release starts clean; old
// caches are deleted on activate.

/* global BUILD */
const CACHE = `biblion-${BUILD.id}`;
const NETWORK_WAIT_MS = 2500;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(BUILD.shell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('biblion-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_WAIT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
    return (await cache.match(request, { ignoreSearch: true })) || (await network);
  } catch (err) {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('index.html')) || Response.error();
  }
}

// Android Share: files shared into the app wait in the "bm-shared" cache,
// then the upload page picks them up.
async function receiveShare(request) {
  const form = await request.formData();
  const cache = await caches.open('bm-shared');
  const stamp = Date.now();
  let i = 0;
  for (const file of form.getAll('file')) {
    if (!(file instanceof File) || i >= 10) continue;
    await cache.put(`shared/${stamp}-${i}`, new Response(file, { headers: { 'Content-Type': file.type, 'X-Name': encodeURIComponent(file.name) } }));
    i++;
  }
  return Response.redirect('./#/upload?shared=1', 303);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const path = url.pathname.slice(self.registration.scope.length - self.location.origin.length);
  if (BUILD.hashed.includes(path)) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
    return;
  }
  if (BUILD.shell.includes(path) || path === '' || event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
  }
});
