// Browser side of push notifications. The server side is the `notify` Edge Function.

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * The Edge Function that sends notifications. The Supabase dashboard editor gives new functions random names,
 * so a different name can be set with VITE_NOTIFY_FUNCTION.
 */
export const notifyFunction = import.meta.env.VITE_NOTIFY_FUNCTION || 'notify'

/** True once the site has been given a VAPID public key at build time. */
export const pushConfigured = Boolean(PUBLIC_KEY)

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function keyToBytes(base64) {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

async function registration() {
  // The service worker is only registered in production builds.
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) throw new Error('Notifications are only available in the published app.')
  return navigator.serviceWorker.ready
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const existing = await navigator.serviceWorker.getRegistration()
  return existing ? existing.pushManager.getSubscription() : null
}

/** Asks for permission and returns a fresh subscription (an old one is dropped so endpoints are never shared between accounts). */
export async function subscribePush() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings, then try again.')
  const ready = await registration()
  const old = await ready.pushManager.getSubscription()
  if (old) await old.unsubscribe()
  return ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(PUBLIC_KEY) })
}

export async function unsubscribePush() {
  const subscription = await currentSubscription()
  if (!subscription) return null
  const { endpoint } = subscription
  await subscription.unsubscribe()
  return endpoint
}
