// Ahoy's PWA is retired. Browsers that installed it keep checking this path
// for an updated service worker; this one takes over, deletes every cache the
// old one made, unregisters itself and reloads open Ahoy tabs so they show the
// "moved to the app" page instead of a stale cached app.
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      await self.registration.unregister();
      var clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(function (c) { c.navigate(c.url).catch(function () {}); });
    })()
  );
});

// No fetch handler: requests go straight to the network.
