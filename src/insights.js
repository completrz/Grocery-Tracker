import { normalizeLabel, resolveCategory } from './categories'
import { dollars } from './format'

const DAY = 86400000
const WINDOW = 30
const WINDOWS = 4 // the last 30 days plus the three 30-day windows before it

const receiptCents = (receipt) => receipt.receipt_items.reduce((sum, item) => sum + item.line_total_cents, 0)

function daysAgo(purchasedOn, now) {
  const [year, month, day] = purchasedOn.split('-').map(Number)
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((today - Date.UTC(year, month - 1, day)) / DAY)
}

function bump(map, key, name, cents, trips = 0) {
  const row = map.get(key) ?? { name, cents: 0, trips: 0 }
  row.cents += cents
  row.trips += trips
  map.set(key, row)
}

// Sorts receipts into 30-day windows (0 = the last 30 days) and totals categories and stores in each.
function windows(receipts, rules, now) {
  const list = Array.from({ length: WINDOWS }, () => ({ cents: 0, trips: 0, cats: new Map(), stores: new Map() }))
  let oldest = 0
  for (const receipt of receipts) {
    if (receipt.receipt_items.length === 0) continue
    const age = daysAgo(receipt.purchased_on, now)
    if (age < 0) continue
    oldest = Math.max(oldest, age)
    const index = Math.floor(age / WINDOW)
    if (index >= WINDOWS) continue
    const win = list[index]
    const total = receiptCents(receipt)
    win.cents += total
    win.trips += 1
    bump(win.stores, normalizeLabel(receipt.store), receipt.store, total, 1)
    for (const item of receipt.receipt_items) {
      const name = resolveCategory(rules, receipt.store, item.item_name, item.category)
      bump(win.cats, normalizeLabel(name), name, item.line_total_cents)
    }
  }
  // A window only counts as history once the oldest receipt reaches back past its far end.
  const covered = list.map((_, index) => oldest >= (index + 1) * WINDOW - 1)
  return { list, covered }
}

// Not real spending categories, so they never make a useful insight.
const VAGUE = new Set(['uncategorized', 'non-grocery'])

const pct = (now, before) => Math.round(Math.abs(now - before) / before * 100)

/**
 * "What changed" rows for the overview: the last 30 days against the 30 days before and against
 * the user's usual 30 days (the average of up to three earlier windows that their history fully covers).
 * Returns [{ id, text, detail, chip: { label, tone } }], most important first, at most five.
 */
export function buildInsights(receipts, rules, now = new Date()) {
  const { list, covered } = windows(receipts, rules, now)
  const current = list[0]
  if (current.trips === 0 || current.cents <= 0) return []

  const earlier = [1, 2, 3].filter((index) => covered[index])
  const usualOf = (group, key) => earlier.length
    ? earlier.reduce((sum, index) => sum + (list[index][group].get(key)?.cents ?? 0), 0) / earlier.length
    : 0
  const rows = []
  const used = new Set()
  const money = (cents) => dollars.format(cents / 100)

  const flags = (group, limit, make) => {
    const found = [...current[group]]
      .map(([key, row]) => ({ key, row, usual: usualOf(group, key) }))
      .filter(({ key, row, usual }) => !(group === 'cats' && VAGUE.has(key)) && usual > 0 && row.cents >= usual * 1.25 && row.cents - usual >= 1000)
      .sort((a, b) => (b.row.cents - b.usual) - (a.row.cents - a.usual))
      .slice(0, limit)
    for (const { key, row, usual } of found) {
      used.add(group + key)
      rows.push(make(key, row, usual))
    }
  }
  flags('cats', 2, (key, row, usual) => ({
    id: 'usual-cat-' + key,
    text: `${row.name} is ${money(row.cents - usual)} above your usual month`,
    detail: `${money(row.cents)} in the last 30 days, against about ${money(usual)} in a typical 30 days.`,
    chip: { label: `Up ${pct(row.cents, usual)}%`, tone: 'up' },
  }))
  flags('stores', 1, (key, row, usual) => ({
    id: 'usual-store-' + key,
    text: `You spent ${money(row.cents - usual)} more than usual at ${row.name}`,
    detail: `${money(row.cents)} over ${row.trips === 1 ? '1 trip' : row.trips + ' trips'}, against about ${money(usual)} in a typical 30 days.`,
    chip: { label: `Up ${pct(row.cents, usual)}%`, tone: 'up' },
  }))

  if (covered[1]) {
    const previous = list[1]
    const moves = [...new Set([...current.cats.keys(), ...previous.cats.keys()])]
      .map((key) => ({ key, name: (current.cats.get(key) ?? previous.cats.get(key)).name, now: current.cats.get(key)?.cents ?? 0, before: previous.cats.get(key)?.cents ?? 0 }))
      .filter((move) => !VAGUE.has(move.key) && move.before > 0 && Math.abs(move.now - move.before) >= 500 && Math.abs(move.now - move.before) / move.before >= 0.15)
    const rise = moves.filter((move) => move.now > move.before && !used.has('cats' + move.key)).sort((a, b) => (b.now - b.before) - (a.now - a.before))[0]
    const fall = moves.filter((move) => move.now > 0 && move.now < move.before).sort((a, b) => (a.now - a.before) - (b.now - b.before))[0]
    if (rise) rows.push({
      id: 'rise-' + rise.key,
      text: `${rise.name} is up ${money(rise.now - rise.before)} from the 30 days before`,
      detail: `${money(rise.now)} now, ${money(rise.before)} before.`,
      chip: { label: `Up ${pct(rise.now, rise.before)}%`, tone: 'up' },
    })
    if (fall) rows.push({
      id: 'fall-' + fall.key,
      text: `${fall.name} is down ${money(fall.before - fall.now)} from the 30 days before`,
      detail: `${money(fall.now)} now, ${money(fall.before)} before.`,
      chip: { label: `Down ${pct(fall.now, fall.before)}%`, tone: 'down' },
    })
  }

  const top = (group) => [...current[group].values()].sort((a, b) => b.cents - a.cents)[0]
  const share = (cents) => Math.round(cents / current.cents * 100)
  const topCat = [...current.cats].filter(([key]) => !VAGUE.has(key)).map(([, row]) => row).sort((a, b) => b.cents - a.cents)[0]
  const topStore = top('stores')
  if (rows.length < 5 && topStore) rows.push({
    id: 'top-store',
    text: `${topStore.name} is where you spend the most`,
    detail: `${money(topStore.cents)} over ${topStore.trips === 1 ? '1 trip' : topStore.trips + ' trips'} in the last 30 days.`,
    chip: { label: `${share(topStore.cents)}% of spending`, tone: 'flat' },
  })
  if (rows.length < 5 && topCat && topCat.cents > 0) rows.push({
    id: 'top-cat',
    text: `${topCat.name} is your biggest category`,
    detail: `${money(topCat.cents)} in the last 30 days.`,
    chip: { label: `${share(topCat.cents)}% of spending`, tone: 'flat' },
  })
  return rows.slice(0, 5)
}

/** Per-store totals for a set of receipts: trips, spend, average per trip and share of the total. */
export function storeStats(receipts) {
  const stores = new Map()
  let total = 0
  for (const receipt of receipts) {
    if (receipt.receipt_items.length === 0) continue
    const cents = receiptCents(receipt)
    total += cents
    bump(stores, normalizeLabel(receipt.store), receipt.store, cents, 1)
  }
  return [...stores].map(([key, row]) => ({
    key, name: row.name, trips: row.trips, cents: row.cents,
    average: row.cents / row.trips, share: total > 0 ? row.cents / total : 0,
  })).sort((a, b) => b.cents - a.cents)
}

/**
 * Items bought at two or more stores, with the per-unit price at each. Names must match exactly (ignoring
 * case and spacing), so package sizes that appear in the name are compared like with like.
 * Returns the biggest gaps first: [{ key, name, cheapest, priciest, gap, saving }].
 */
export function crossStorePrices(receipts, limit = 6) {
  const items = new Map()
  for (const receipt of receipts) {
    const storeKey = normalizeLabel(receipt.store)
    for (const item of receipt.receipt_items) {
      const units = Number(item.quantity)
      const key = normalizeLabel(item.item_name)
      if (!key || !(units > 0) || item.line_total_cents <= 0) continue
      const entry = items.get(key) ?? { name: item.item_name.trim(), stores: new Map() }
      const store = entry.stores.get(storeKey) ?? { name: receipt.store, cents: 0, units: 0, buys: 0 }
      store.cents += item.line_total_cents
      store.units += units
      store.buys += 1
      entry.stores.set(storeKey, store)
      items.set(key, entry)
    }
  }
  const rows = []
  for (const [key, entry] of items) {
    const priced = [...entry.stores.values()].map((store) => ({ ...store, price: store.cents / store.units }))
    if (priced.length < 2) continue
    priced.sort((a, b) => a.price - b.price)
    const cheapest = priced[0]
    const priciest = priced.at(-1)
    const gap = (priciest.price - cheapest.price) / cheapest.price
    // What the units bought above the cheapest price would have cost at the cheapest store's price.
    const saving = priced.slice(1).reduce((sum, store) => sum + (store.price - cheapest.price) * store.units, 0)
    // Gaps beyond 150% are almost always different pack sizes under the same name, so they are left out.
    if (gap >= 0.1 && gap <= 1.5 && saving >= 20) rows.push({ key, name: entry.name, cheapest, priciest, gap, saving })
  }
  return rows.sort((a, b) => b.saving - a.saving).slice(0, limit)
}
