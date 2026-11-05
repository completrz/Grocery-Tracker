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

const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })

function unitPrice(item) {
  const units = Number(item.quantity)
  return units > 0 && item.line_total_cents > 0 ? item.line_total_cents / units : 0
}

/**
 * What a just-saved receipt changed: how the trip compares with the user's usual trip at that store, the
 * biggest price move against the last time they bought an item, and an item they paid more for than at
 * another store. `receipts` is the history from before this receipt. Returns the same row shape as
 * buildInsights, at most three rows.
 */
export function receiptImpact(draft, receipts) {
  const history = receipts.filter((receipt) => receipt.receipt_items.length > 0)
  const storeKey = normalizeLabel(draft.store)
  const total = draft.items.reduce((sum, item) => sum + item.line_total_cents, 0)
  const money = (cents) => dollars.format(cents / 100)
  const rows = []

  if (history.length === 0) {
    return [{
      id: 'first',
      text: 'Your first receipt is in',
      detail: 'Save a few more and CartTrail starts spotting price changes and where you spend more than usual.',
      chip: { label: 'Good start', tone: 'flat' },
    }]
  }

  const sameStore = history.filter((receipt) => normalizeLabel(receipt.store) === storeKey)
  if (sameStore.length >= 2) {
    const average = sameStore.reduce((sum, receipt) => sum + receiptCents(receipt), 0) / sameStore.length
    const diff = total - average
    const trips = sameStore.length + ' trips'
    if (average > 0 && Math.abs(diff) >= Math.max(200, average * 0.1)) {
      rows.push({
        id: 'trip',
        text: `This trip was ${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than your usual at ${draft.store}`,
        detail: `${money(total)}, against an average of ${money(average)} over ${trips}.`,
        chip: { label: `${diff > 0 ? 'Up' : 'Down'} ${pct(total, average)}%`, tone: diff > 0 ? 'up' : 'down' },
      })
    } else if (average > 0) {
      rows.push({
        id: 'trip',
        text: `A typical trip for ${draft.store}`,
        detail: `${money(total)}, against an average of ${money(average)} over ${trips}.`,
        chip: { label: 'In line', tone: 'flat' },
      })
    }
  }

  // Latest earlier purchase of each item, at the same store when there is one.
  const ordered = [...history].sort((a, b) => b.purchased_on.localeCompare(a.purchased_on))
  const earlier = (key, sameStoreOnly) => {
    for (const receipt of ordered) {
      if (sameStoreOnly && normalizeLabel(receipt.store) !== storeKey) continue
      const hit = receipt.receipt_items.find((item) => normalizeLabel(item.item_name) === key && unitPrice(item) > 0)
      if (hit) return { price: unitPrice(hit), store: receipt.store }
    }
    return null
  }
  const moves = []
  for (const item of draft.items) {
    const key = normalizeLabel(item.item_name)
    const now = unitPrice(item)
    if (!key || !now) continue
    const before = earlier(key, true) ?? earlier(key, false)
    if (!before) continue
    const change = (now - before.price) / before.price
    if (Math.abs(change) >= 0.1 && Math.abs(now - before.price) >= 20) moves.push({ item, now, before, change })
  }
  moves.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
  if (moves[0]) {
    const { item, now, before, change } = moves[0]
    const where = normalizeLabel(before.store) === storeKey ? '' : ` at ${before.store}`
    rows.push({
      id: 'price',
      text: `${item.item_name} is ${money(now)} a unit, ${change > 0 ? 'up' : 'down'} from ${money(before.price)} last time${where}`,
      detail: change > 0 ? 'Worth keeping an eye on if it keeps climbing.' : 'Nice, that one got cheaper.',
      chip: { label: `${change > 0 ? 'Up' : 'Down'} ${Math.round(Math.abs(change) * 100)}%`, tone: change > 0 ? 'up' : 'down' },
    })
  }

  // An item that costs noticeably less at another store.
  const elsewhere = []
  for (const item of draft.items) {
    const key = normalizeLabel(item.item_name)
    const now = unitPrice(item)
    if (!key || !now) continue
    const others = new Map()
    for (const receipt of history) {
      if (normalizeLabel(receipt.store) === storeKey) continue
      for (const other of receipt.receipt_items) {
        if (normalizeLabel(other.item_name) !== key || !unitPrice(other)) continue
        const row = others.get(receipt.store) ?? { cents: 0, units: 0 }
        row.cents += other.line_total_cents
        row.units += Number(other.quantity)
        others.set(receipt.store, row)
      }
    }
    const best = [...others].map(([store, row]) => ({ store, price: row.cents / row.units })).sort((a, b) => a.price - b.price)[0]
    if (best && (now - best.price) / best.price >= 0.1 && (now - best.price) / best.price <= 1.5 && now - best.price >= 20) {
      elsewhere.push({ item, now, best, gap: (now - best.price) / best.price })
    }
  }
  elsewhere.sort((a, b) => (b.now - b.best.price) - (a.now - a.best.price))
  if (elsewhere[0] && elsewhere[0].item.item_name !== moves[0]?.item.item_name) {
    const { item, now, best, gap } = elsewhere[0]
    rows.push({
      id: 'elsewhere',
      text: `${item.item_name} cost ${money(now)} a unit here, and ${money(best.price)} at ${best.store}`,
      detail: 'Per-unit prices from your own receipts. Check package sizes before you switch.',
      chip: { label: `Paid ${Math.round(gap * 100)}% more`, tone: 'up' },
    })
  }

  if (rows.length < 3) {
    const month = draft.date.slice(0, 7)
    const monthTrips = history.filter((receipt) => receipt.purchased_on.slice(0, 7) === month)
    const spent = monthTrips.reduce((sum, receipt) => sum + receiptCents(receipt), 0) + total
    const label = monthName.format(new Date(month + '-01T00:00:00Z'))
    rows.push({
      id: 'month',
      text: `${label} so far: ${money(spent)}`,
      detail: `Across ${monthTrips.length + 1 === 1 ? '1 trip' : monthTrips.length + 1 + ' trips'}, including this one.`,
      chip: { label: `${monthTrips.length + 1 === 1 ? '1 trip' : monthTrips.length + 1 + ' trips'}`, tone: 'flat' },
    })
  }
  return rows.slice(0, 3)
}

/**
 * How far the user's history is from unlocking the "above your usual" notes, which need the 30 days before
 * the last 30 to be covered. Scanning older receipts counts, so it can be sped up.
 */
export function unlockStatus(receipts, now = new Date()) {
  let oldest = -1
  let trips = 0
  for (const receipt of receipts) {
    if (receipt.receipt_items.length === 0) continue
    const age = daysAgo(receipt.purchased_on, now)
    if (age < 0) continue
    trips += 1
    oldest = Math.max(oldest, age)
  }
  const days = oldest + 1
  const needed = WINDOW * 2
  return { trips, days, needed, remaining: Math.max(0, needed - days), ready: days >= needed }
}

/**
 * What switching items to the cheaper store would have saved over the last 90 days, from the user's own
 * receipts. Returns null when the amount is too small to be worth showing.
 */
export function savingsEstimate(receipts, now = new Date()) {
  const recent = receipts.filter((receipt) => {
    const age = daysAgo(receipt.purchased_on, now)
    return age >= 0 && age < 90
  })
  const rows = crossStorePrices(recent, 50)
  const totalCents = rows.reduce((sum, row) => sum + row.saving, 0)
  const oldest = recent.reduce((max, receipt) => Math.max(max, daysAgo(receipt.purchased_on, now)), 0)
  const months = Math.max(1, Math.min(3, (oldest + 1) / WINDOW))
  const perMonthCents = totalCents / months
  if (perMonthCents < 300) return null
  return { rows: rows.slice(0, 3), totalCents, perMonthCents, count: rows.length }
}
