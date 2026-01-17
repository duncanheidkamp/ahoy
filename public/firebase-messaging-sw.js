// Firebase Cloud Messaging Service Worker
console.log('[Firebase SW] Loading service worker...');

// Handle push events directly - show notification immediately
self.addEventListener('push', (event) => {
  console.log('[Firebase SW] Push event received:', event);

  let data = {};
  let notification = {};

  try {
    const payload = event.data?.json();
    console.log('[Firebase SW] Push payload:', payload);
    data = payload.data || {};
    notification = payload.notification || {};
  } catch (e) {
    console.log('[Firebase SW] Could not parse push data:', e);
  }

  const title = notification.title || data.title || 'Ahoy!';
  const options = {
    body: notification.body || data.body || 'Someone sent you an Ahoy!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'ahoy-notification',
    renotify: true,
    requireInteraction: true,
    data: data,
    actions: [
      { action: 'ahoy_back', title: 'Ahoy back!' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  console.log('[Firebase SW] Showing notification:', title, options);

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[Firebase SW] Notification clicked:', event);

  event.notification.close();

  if (event.action === 'ahoy_back') {
    const senderId = event.notification.data?.senderId;
    if (senderId) {
      event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
          for (const client of clientList) {
            if (client.url.includes('/dashboard') && 'focus' in client) {
              client.focus();
              client.postMessage({ type: 'AHOY_BACK', senderId });
              return;
            }
          }
          if (clients.openWindow) {
            return clients.openWindow(`/dashboard?ahoyBack=${senderId}`);
          }
        })
      );
    }
  } else {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes('/dashboard') && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/dashboard');
        }
      })
    );
  }
});
