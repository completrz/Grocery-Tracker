// CartTrail's service worker. It makes the app installable and shows push notifications.
// It deliberately caches nothing: every request goes to the network, so users never see a stale app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: typeof data.url === 'string' ? data.url : '/' },
  }
  if (typeof data.tag === 'string') options.tag = data.tag
  event.waitUntil(self.registration.showNotification(typeof data.title === 'string' && data.title ? data.title : 'CartTrail', options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Only ever open pages on this site, whatever the payload says.
  let target = new URL('/', self.location.origin)
  try {
    const requested = new URL(event.notification.data?.url || '/', self.location.origin)
    if (requested.origin === self.location.origin) target = requested
  } catch { /* keep the home page */ }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('navigate' in client && 'focus' in client) return client.navigate(target.href).then((moved) => (moved || client).focus())
      }
      return self.clients.openWindow(target.href)
    }),
  )
})
