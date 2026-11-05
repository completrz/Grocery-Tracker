import { lazy, Suspense, useMemo, useState } from 'react'
import { normalizeLabel, resolveCategory } from './categories'
import TrendChart from './TrendChart'

const SpendingMap = lazy(() => import('./SpendingMap'))
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

function add(series, key, cents, units = 0) {
  const row = series.get(key) ?? { cents: 0, count: 0, units: 0 }
  row.cents += cents
  row.count += 1
  row.units += units
  series.set(key, row)
}

function group(groups, key, name) {
  if (!groups.has(key)) groups.set(key, { name, months: new Map(), cents: 0 })
  return groups.get(key)
}

function collect(receipts, rules) {
  const products = new Map()
  const types = new Map()
  const months = new Map()
  let net = 0

  for (const receipt of receipts) {
    const month = receipt.purchased_on.slice(0, 7)
    const receiptCents = receipt.receipt_items.reduce((sum, item) => sum + item.line_total_cents, 0)
    net += receiptCents
    add(months, month, receiptCents)

    for (const item of receipt.receipt_items) {
      const category = resolveCategory(rules, receipt.store, item.item_name, item.category)
      const type = group(types, normalizeLabel(category), category)
      type.cents += item.line_total_cents
      add(type.months, month, item.line_total_cents)

      const name = normalizeLabel(item.item_name)
      const units = Number(item.quantity)
      if (!name || !(units > 0) || item.line_total_cents < 0) continue
      const product = group(products, name, item.item_name.trim())
      add(product.months, month, item.line_total_cents, units)
    }
  }

  return { products, types, months, net }
}

function chartPoints(series, unitPrice = false, noun = 'item line') {
  return [...series].sort(([a], [b]) => a.localeCompare(b)).map(([month, row]) => ({
    month,
    cents: unitPrice ? row.cents / row.units : row.cents,
    detail: row.count + ' ' + noun + (row.count === 1 ? '' : 's') +
      (unitPrice ? ' · ' + quantity.format(row.units) + (row.units === 1 ? ' unit' : ' units') : ''),
  }))
}

function monthKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
}

export default function Trends({ receipts, rules, locationsReady, onSaveLocation }) {
  const [period, setPeriod] = useState({ value: '', from: '', through: '' })
  const [store, setStore] = useState('')
  const [productKey, setProduct] = useState('')
  const [typeKey, setType] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const stores = [...new Map(receipts.map((receipt) => [normalizeLabel(receipt.store), receipt.store]))]
    .sort(([, a], [, b]) => a.localeCompare(b))
  const filtered = useMemo(() => receipts.filter((receipt) =>
    (!period.value || (
      receipt.purchased_on.slice(0, 7) >= period.from && receipt.purchased_on.slice(0, 7) <= period.through
    )) && (!store || normalizeLabel(receipt.store) === store),
  ), [receipts, period, store])
  const { products, types, months, net } = useMemo(() => collect(filtered, rules), [filtered, rules])
  const productChoices = [...products].sort(([, a], [, b]) => b.months.size - a.months.size || a.name.localeCompare(b.name))
  const typeChoices = [...types].sort(([, a], [, b]) => b.cents - a.cents || a.name.localeCompare(b.name))
  const activeProduct = products.has(productKey) ? productKey : productChoices[0]?.[0]
  const activeType = types.has(typeKey) ? typeKey : typeChoices[0]?.[0]
  const product = products.get(activeProduct)
  const type = types.get(activeType)
  const maxCategory = Math.max(1, ...typeChoices.map(([, item]) => Math.abs(item.cents)))
  const storeSpend = new Map()
  for (const receipt of filtered) {
    add(storeSpend, normalizeLabel(receipt.store), receipt.receipt_items.reduce((sum, item) => sum + item.line_total_cents, 0))
  }
  const rankedStores = [...storeSpend].sort(([, a], [, b]) => b.cents - a.cents)
  const maxStore = Math.max(1, ...rankedStores.map(([, row]) => Math.abs(row.cents)))

  return (
    <div className="analytics">
      <div className="analytics-toolbar">
        <label>Period
          <select aria-label="Period" value={period.value} onChange={(event) => {
            const value = event.target.value
            const now = new Date()
            const first = new Date(now.getFullYear(), now.getMonth() - Number(value) + 1, 1)
            setPeriod({ value, from: monthKey(first), through: monthKey(now) })
          }}>
            <option value="">All time</option><option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option><option value="12">Last 12 months</option>
          </select>
        </label>
        <label>Store
          <select aria-label="Store" value={store} onChange={(event) => setStore(event.target.value)}>
            <option value="">All stores</option>
            {stores.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>
        <p className="muted">Based on saved receipt line totals in USD.</p>
      </div>
      <div className="metrics analytics-metrics">
        <div className="metric featured"><span>Net spending</span><strong>{money.format(net / 100)}</strong></div>
        <div className="metric"><span>Receipts</span><strong>{filtered.length}</strong></div>
        <div className="metric"><span>Average per receipt</span><strong>{filtered.length ? money.format(net / filtered.length / 100) : '—'}</strong></div>
      </div>
      <div className="trend-grid">
        <section className="panel trend-panel" aria-labelledby="spending-trend-title">
          <h2 id="spending-trend-title">Monthly spending</h2>
          <p className="trend-note">Hover, tap, or focus a month for the exact amount.</p>
          <TrendChart points={chartPoints(months, false, 'receipt')} label="Monthly spending chart" />
        </section>

        <section className="panel trend-panel" aria-labelledby="product-trend-title">
          <h2 id="product-trend-title">Product price history</h2>
          <p className="trend-note">Monthly average per recorded unit. Dotted segments span months without a purchase.</p>
          {product && <label className="trend-select">Product
            <select aria-label="Product" value={activeProduct} onChange={(event) => setProduct(event.target.value)}>
              {productChoices.map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}
            </select>
          </label>}
          <TrendChart key={activeProduct} points={product ? chartPoints(product.months, true) : []} label="Product price chart" line />
          {product?.months.size === 1 && <p className="trend-note">One observed month. Save another purchase to see how its price changes.</p>}
          <p className="trend-note">Matches receipt names. Compare like package sizes for meaningful prices.</p>
        </section>

        <section className="panel trend-panel" aria-labelledby="category-trend-title">
          <h2 id="category-trend-title">Spending by category</h2>
          <p className="trend-note">Choose a category to inspect its monthly spending.</p>
          {type && <label className="trend-select">Category
            <select aria-label="Category" value={activeType} onChange={(event) => setType(event.target.value)}>
              {typeChoices.map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}
            </select>
          </label>}
          <TrendChart key={activeType} points={type ? chartPoints(type.months) : []} label="Category spending chart" />
        </section>

        <section className="panel trend-panel rankings" aria-labelledby="rankings-title">
          <h2 id="rankings-title">Where spending goes</h2>
          <h3>Categories</h3>
          {typeChoices.length === 0 && <p className="empty">No categories for these filters.</p>}
          {typeChoices.map(([key, item]) => (
            <button className="ranking-row" key={key} type="button" aria-pressed={activeType === key} onClick={() => setType(key)}>
              <span>{item.name}</span><strong>{money.format(item.cents / 100)}</strong>
              <span className="bar" aria-hidden="true"><span style={{ width: Math.abs(item.cents) / maxCategory * 100 + '%' }} /></span>
            </button>
          ))}
          <h3>Stores</h3>
          {rankedStores.length === 0 && <p className="empty">No stores for these filters.</p>}
          {rankedStores.map(([key, item]) => (
            <button className="ranking-row" key={key} type="button" aria-pressed={store === key} onClick={() => setStore(store === key ? '' : key)}>
              <span>{stores.find(([id]) => id === key)?.[1] ?? key}</span><strong>{money.format(item.cents / 100)}</strong>
              <span className="bar" aria-hidden="true"><span style={{ width: Math.abs(item.cents) / maxStore * 100 + '%' }} /></span>
            </button>
          ))}
        </section>
      </div>
      <section className="panel analytics-map-panel" aria-labelledby="spending-map-title">
        <h2 id="spending-map-title">Spending map</h2>
        <p className="trend-note">Explore spending at the store branches you’ve pinned.</p>
        {locationsReady ? (
          <>
            <button className="button secondary map-toggle" type="button" aria-expanded={mapOpen} onClick={() => setMapOpen(!mapOpen)}>
              {mapOpen ? 'Hide map' : 'Open map'}
            </button>
            {mapOpen && <Suspense fallback={<p role="status">Loading map…</p>}>
              <SpendingMap receipts={filtered} onSave={onSaveLocation} />
            </Suspense>}
          </>
        ) : <p className="empty">Store locations are unavailable until the location migration is applied.</p>}
      </section>
    </div>
  )
}
