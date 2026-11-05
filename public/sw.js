// Minimal service worker so CartTrail can be installed to the home screen.
// It deliberately caches nothing: every request goes to the network, so users never see a stale app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
