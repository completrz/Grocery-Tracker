// CartTrail's service worker. It makes the app installable and shows push notifications.
// It deliberately caches nothing: every request goes to the network, so users never see a stale app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Android's Share menu posts shared files to /share-target (see manifest.json). They are kept in the cache
// until the app opens and reads them (src/shared.js), and the user is sent to the app.
const SHARE_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
async function receiveShare(request) {
  try {
    const form = await request.formData()
    const cache = await caches.open('shared-receipts')
    let saved = 0
    for (const file of form.getAll('receipts').slice(0, 10)) {
      if (!(file instanceof File) || !SHARE_TYPES.includes(file.type) || file.size === 0 || file.size > 4000000) continue
      await cache.put(new URL('/shared/' + Date.now() + '-' + saved, self.location.origin).href, new Response(file, {
        headers: { 'content-type': file.type, 'x-file-name': encodeURIComponent(file.name || 'receipt'), 'x-saved-at': String(Date.now()) },
      }))
      saved++
    }
    return Response.redirect(new URL('/?shared=' + saved, self.location.origin).href, 303)
  } catch {
    return Response.redirect(new URL('/', self.location.origin).href, 303)
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method === 'POST' && new URL(request.url).pathname === '/share-target') event.respondWith(receiveShare(request))
})

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
    // The status-bar icon must be a flat white shape on a transparent background; Android paints any opaque
    // pixel white, so the colour app icon would show as a white square.
    badge: '/badge.png',
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
