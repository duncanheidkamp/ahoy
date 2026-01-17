// Firebase Cloud Messaging Service Worker
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY,
  authDomain: self.FIREBASE_AUTH_DOMAIN,
  projectId: self.FIREBASE_PROJECT_ID,
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID,
  appId: self.FIREBASE_APP_ID,
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'Ahoy!';
  const notificationOptions = {
    body: payload.notification?.body || 'Someone sent you an Ahoy!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'ahoy-notification',
    renotify: true,
    data: payload.data,
    actions: [
      {
        action: 'ahoy_back',
        title: 'Ahoy back!',
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
      },
    ],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event);

  event.notification.close();

  if (event.action === 'ahoy_back') {
    // Handle "Ahoy back" action
    const senderId = event.notification.data?.senderId;
    if (senderId) {
      // Open the app and trigger ahoy back
      event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
          // If app is open, focus it and send message
          for (const client of clientList) {
            if (client.url.includes('/dashboard') && 'focus' in client) {
              client.focus();
              client.postMessage({
                type: 'AHOY_BACK',
                senderId: senderId,
              });
              return;
            }
          }
          // If app is not open, open it
          if (clients.openWindow) {
            return clients.openWindow(`/dashboard?ahoyBack=${senderId}`);
          }
        })
      );
    }
  } else {
    // Default: open the dashboard
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
