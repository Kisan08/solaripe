// Remove private responses left by older next-pwa runtime caching rules.
self.addEventListener('activate', (event) => {
  const legacy = new Set(['start-url', 'next-data', 'static-data-assets', 'apis', 'others', 'cross-origin']);
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => legacy.has(name)).map((name) => caches.delete(name))
  )));
});
