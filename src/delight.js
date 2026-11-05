import { useEffect, useState } from 'react'

// Small touches that give CartTrail some character: preferences kept on this device (so they need no database),
// the optional printer sound and buzz, the time-of-day greeting, and the lines printed at the foot of a receipt.

const KEY = 'carttrail-delight'
const DEFAULTS = { sound: false, buzz: false, tone: 'plain' }

export function getPrefs() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(KEY) || '{}')
    return {
      sound: stored.sound === true,
      buzz: stored.buzz === true,
      tone: stored.tone === 'playful' ? 'playful' : 'plain',
    }
  } catch {
    return DEFAULTS
  }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch }
  try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* the choice just won't be remembered */ }
  window.dispatchEvent(new Event('carttrail-prefs'))
  return next
}

export function usePrefs() {
  const [prefs, setState] = useState(getPrefs)
  useEffect(() => {
    const update = () => setState(getPrefs())
    window.addEventListener('carttrail-prefs', update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener('carttrail-prefs', update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return prefs
}

// ---- Printer sound and buzz (both off until the user turns them on) ----

let audio = null

function context() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)()
    if (audio.state === 'suspended') audio.resume()
    return audio
  } catch {
    return null
  }
}

/** Call from a click handler so the browser allows sound later. Does nothing unless the sound is turned on. */
export function primeAudio() {
  if (getPrefs().sound) context()
}

function printerSound(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.03)
  const burst = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = burst.getChannelData(0)
  for (let index = 0; index < length; index++) data[index] = (Math.random() * 2 - 1) * (1 - index / length)
  const start = ctx.currentTime + 0.02
  // A row of quick ticks like a thermal printer feeding paper, then one lower tear.
  for (let tick = 0; tick < 16; tick++) {
    const source = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    source.buffer = burst
    filter.type = 'bandpass'
    filter.frequency.value = 1500 + (tick % 3) * 350
    gain.gain.value = 0.05
    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start(start + tick * 0.045)
  }
  const tear = ctx.createBufferSource()
  const tearFilter = ctx.createBiquadFilter()
  const tearGain = ctx.createGain()
  tear.buffer = burst
  tearFilter.type = 'lowpass'
  tearFilter.frequency.value = 900
  tearGain.gain.value = 0.09
  tear.connect(tearFilter).connect(tearGain).connect(ctx.destination)
  tear.start(start + 16 * 0.045 + 0.05)
}

/** What happens when a receipt is saved: the printer sound and/or a short buzz, if the user asked for them. */
export function printFeedback({ force = false } = {}) {
  const { sound, buzz } = getPrefs()
  if (sound || force) {
    const ctx = context()
    if (ctx) printerSound(ctx)
  }
  if (buzz || force) window.navigator.vibrate?.([30, 60, 30])
}

// ---- Words ----

export function greeting(name, now = new Date()) {
  const hour = now.getHours()
  const base = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const who = (name || '').trim()
  return who ? `${base}, ${who}.` : `${base}.`
}

const THANKS = [
  'THANK YOU FOR SHOPPING YOUR OWN SPENDING',
  'HAVE A BUDGET-FRIENDLY DAY',
  'PLEASE KEEP THIS RECEIPT (WE KEPT A COPY TOO)',
  'NO REFUNDS ON GROCERIES ALREADY EATEN',
  'YOUR CASHIER TODAY: YOU',
  'COME BACK SOON. THE MILK WON’T BUY ITSELF',
]

const MILESTONES = {
  1: 'FIRST RECEIPT. WELCOME TO THE TRAIL',
  5: '5 RECEIPTS IN. GETTING THE HANG OF IT',
  10: 'RECEIPT #10. A GOOD HABIT',
  25: 'RECEIPT #25. YOU’RE A REGULAR',
  50: 'RECEIPT #50. A TRUE PROFESSIONAL',
  100: 'RECEIPT #100. CENTURION OF THE CART',
  250: 'RECEIPT #250. THEY SHOULD NAME AN AISLE AFTER YOU',
  500: 'RECEIPT #500. LEGENDARY',
}

/** The line printed at the foot of a saved receipt: a milestone when the count is one, otherwise a thank-you. */
export function receiptFooter(count) {
  return MILESTONES[count] ?? THANKS[Math.max(0, count) % THANKS.length]
}
