import { useEffect, useState } from 'react'

// Chrome and Edge announce that the app can be installed once, early, so it is captured at module load
// and handed to whichever component asks for it later.
let deferred = null
const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIOS() {
  const agent = window.navigator.userAgent
  return /iPad|iPhone|iPod/.test(agent) || (agent.includes('Mac') && window.navigator.maxTouchPoints > 1)
}

export function useInstallPrompt() {
  const [, rerender] = useState(0)
  useEffect(() => {
    const listener = () => rerender((count) => count + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])
  return {
    canPrompt: Boolean(deferred),
    async prompt() {
      if (!deferred) return
      const event = deferred
      deferred = null
      notify()
      await event.prompt()
    },
  }
}
