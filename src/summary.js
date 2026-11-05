import { normalizeLabel, resolveCategory } from './categories'
import { dollars, localDayKey } from './format'

// The numbers behind "your week, as a receipt": totals and category names only, so the picture is safe to share.

const DAY = 86400000
const dayNumber = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))
const addDays = (key, days) => new Date(dayNumber(key) + days * DAY).toISOString().slice(0, 10)
const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const lastDayOfMonth = (key) => new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0)).getUTCDate()

function rangeFor(period, today) {
  if (period === 'week') {
    return {
      from: addDays(today, -6), to: today,
      previousFrom: addDays(today, -13), previousTo: addDays(today, -7),
      title: 'YOUR WEEK',
      label: `${dayLabel.format(new Date(addDays(today, -6) + 'T00:00:00Z'))} to ${dayLabel.format(new Date(today + 'T00:00:00Z'))}`.toUpperCase(),
      previousName: 'THE WEEK BEFORE',
    }
  }
  const monthStart = today.slice(0, 8) + '01'
  const previousMonth = addDays(monthStart, -1).slice(0, 8)
  const sameDay = Math.min(Number(today.slice(8, 10)), lastDayOfMonth(previousMonth + '01'))
  return {
    from: monthStart, to: today,
    previousFrom: previousMonth + '01', previousTo: previousMonth + String(sameDay).padStart(2, '0'),
    title: 'YOUR MONTH',
    label: monthLabel.format(new Date(monthStart + 'T00:00:00Z')).toUpperCase(),
    previousName: 'THIS POINT LAST MONTH',
  }
}

const within = (receipt, from, to) => receipt.purchased_on >= from && receipt.purchased_on <= to && receipt.receipt_items.length > 0
const totalOf = (receipt) => receipt.receipt_items.reduce((sum, item) => sum + item.line_total_cents, 0)

/**
 * Totals for the last 7 days ('week') or the month so far ('month'), with up to six categories and the rest as OTHER.
 * Returns null when nothing was spent in the period.
 */
export function summarize(receipts, rules, period, now = new Date()) {
  const range = rangeFor(period, localDayKey(now))
  const current = receipts.filter((receipt) => within(receipt, range.from, range.to))
  if (current.length === 0) return null

  const categories = new Map()
  const stores = new Set()
  let cents = 0
  let items = 0
  for (const receipt of current) {
    stores.add(normalizeLabel(receipt.store))
    cents += totalOf(receipt)
    for (const item of receipt.receipt_items) {
      items += 1
      const name = resolveCategory(rules, receipt.store, item.item_name, item.category)
      const key = normalizeLabel(name)
      const entry = categories.get(key) ?? { name, cents: 0 }
      entry.cents += item.line_total_cents
      categories.set(key, entry)
    }
  }
  const ranked = [...categories.values()].sort((a, b) => b.cents - a.cents)
  const shown = ranked.slice(0, 6)
  const rest = ranked.slice(6).reduce((sum, entry) => sum + entry.cents, 0)
  if (rest !== 0) shown.push({ name: 'Other', cents: rest })

  const previousCents = receipts.filter((receipt) => within(receipt, range.previousFrom, range.previousTo)).reduce((sum, receipt) => sum + totalOf(receipt), 0)
  return {
    period, title: range.title, label: range.label, previousName: range.previousName,
    cents, previousCents, trips: current.length, stores: stores.size, items, categories: shown,
  }
}

/** The line under the total: how this period compares with the one before it. */
export function summaryNote(summary, tone) {
  if (summary.previousCents <= 0) return 'NOTHING TO COMPARE WITH YET'
  const diff = summary.cents - summary.previousCents
  const amount = dollars.format(Math.abs(diff) / 100)
  if (diff === 0) return `THE SAME AS ${summary.previousName}`
  if (diff < 0) return `${amount} LESS THAN ${summary.previousName}${tone === 'playful' ? '. NICE' : ''}`
  return `${amount} MORE THAN ${summary.previousName}${tone === 'playful' ? '. IT HAPPENS' : ''}`
}

/** A plain-text version of the receipt, used as the picture's description for screen readers. */
export function summaryText(summary, note) {
  const money = (cents) => dollars.format(cents / 100)
  return [
    `${summary.title}, ${summary.label}.`,
    ...summary.categories.map((entry) => `${entry.name}: ${money(entry.cents)}.`),
    `Total ${money(summary.cents)} across ${summary.trips} ${summary.trips === 1 ? 'trip' : 'trips'}, ${summary.stores} ${summary.stores === 1 ? 'store' : 'stores'} and ${summary.items} items.`,
    note.charAt(0) + note.slice(1).toLowerCase() + '.',
  ].join(' ')
}
