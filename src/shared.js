// File rules and the hand-off for files shared to the installed app from another app (Android's Share menu).

export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
export const ACCEPT = RECEIPT_TYPES.join(',')
export const MAX_BYTES = 4_000_000

/** Rejects with a TimeoutError if the promise hasn't settled in `ms`, so the screen never waits forever. */
export function withTimeout(promise, ms) {
  let timer
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Timed out'), { name: 'TimeoutError' })), ms)
  })
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer))
}

export const isReceiptFile = (file) => RECEIPT_TYPES.includes(file.type) && file.size > 0 && file.size <= MAX_BYTES

const SHARED_CACHE = 'shared-receipts'
const MAX_AGE = 24 * 60 * 60 * 1000

/**
 * Takes the files the service worker saved from the Share menu. Each is removed as it is read, and anything
 * older than a day is dropped, so files are only ever handed over once.
 */
export async function takeSharedFiles() {
  if (typeof caches === 'undefined') return []
  const cache = await caches.open(SHARED_CACHE)
  const files = []
  for (const request of await cache.keys()) {
    const response = await cache.match(request)
    await cache.delete(request)
    if (!response || Date.now() - Number(response.headers.get('x-saved-at') || 0) > MAX_AGE) continue
    const blob = await response.blob()
    let name = 'receipt'
    try { name = decodeURIComponent(response.headers.get('x-file-name') || name) } catch { /* keep the default */ }
    files.push(new File([blob], name, { type: blob.type }))
  }
  return files
}

/** The public address shown on shared pictures and in share messages. Change it here if the domain changes. */
export const SITE_HOST = 'carttrail.nicholashinkel.com'

/** Set VITE_SIGNUPS_OPEN=true once new people may create accounts (Supabase must also allow new users to sign up). */
export const SIGNUPS_OPEN = import.meta.env.VITE_SIGNUPS_OPEN === 'true'

/** Show the page to signed-out visitors, except when they are in the middle of signing in or have used the app before. */
export function shouldShowLanding() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('about')) return true
    const hash = window.location.hash
    if (/access_token|refresh_token|error_description|type=recovery/.test(hash)) return false
    if (params.has('code') || params.has('scan') || params.has('shared') || params.has('error')) return false
    if (window.sessionStorage.getItem('carttrail-deleted')) return false
    if (window.localStorage.getItem('carttrail-returning')) return false
  } catch { /* storage unavailable: show the page */ }
  return true
}

/** Remember that this browser has been signed in, so the landing page is skipped next time. */
export function markReturning() {
  try { window.localStorage.setItem('carttrail-returning', '1') } catch { /* optional */ }
}
