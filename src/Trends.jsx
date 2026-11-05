import { lazy, Suspense, useMemo, useState } from 'react'
import { normalizeLabel, resolveCategory } from './categories'
import TrendChart from './TrendChart'
import { Icon } from './ui'

const SpendingMap = lazy(() => import('./SpendingMap'))
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const wholeMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const longMonthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
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

const PERIODS = [['3', '3 months'], ['6', '6 months'], ['12', '12 months'], ['', 'All time']]

function shiftMonth(key, delta) {
  const date = new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + delta, 1))
  return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0')
}

export default function Trends({ receipts, rules, locationsReady, onSaveLocation, onScan }) {
  const [period, setPeriod] = useState(() => ({ value: '6', ...periodRange('6') }))
  const [store, setStore] = useState('')
  const [productKey, setProduct] = useState('')
  const [typeKey, setType] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [nowKey] = useState(() => monthKey(new Date()))
  const stores = [...new Map(receipts.map((receipt) => [normalizeLabel(receipt.store), receipt.store]))]
    .sort(([, a], [, b]) => a.localeCompare(b))
  const storeName = stores.find(([key]) => key === store)?.[1]
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

  // Price watch compares against three months ago, so it ignores the period filter (the store filter still applies).
  const storeReceipts = useMemo(() => store ? receipts.filter((receipt) => normalizeLabel(receipt.store) === store) : receipts, [receipts, store])
  const watch = useMemo(() => {
    const thenMonth = shiftMonth(nowKey, -3)
    const rows = []
    for (const [, entry] of collect(storeReceipts, rules).products) {
      const before = entry.months.get(thenMonth)
      const latest = [...entry.months.keys()].sort().at(-1)
      if (!before || latest <= thenMonth) continue
      const nowRow = entry.months.get(latest)
      const then = before.cents / before.units
      const now = nowRow.cents / nowRow.units
      if (!(then > 0) || !(now > 0)) continue
      rows.push({ name: entry.name, now, then, change: (now - then) / then })
    }
    rows.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    return { thenMonth, rows: rows.slice(0, 8) }
  }, [storeReceipts, rules, nowKey])

  const monthRows = [...months].sort(([a], [b]) => a.localeCompare(b))
  const monthMax = Math.max(1, ...monthRows.map(([, row]) => Math.abs(row.cents)))
  const complete = monthRows.filter(([key]) => key !== nowKey)
  const averageRows = complete.length ? complete : monthRows
  // Every month in the period gets a slot, so a short history still reads as a timeline
  // with honest empty months instead of a lone bar.
  const earliest = monthRows[0]?.[0] ?? nowKey
  const allTimeSpan = Math.min(36, Math.max(6, (Number(nowKey.slice(0, 4)) - Number(earliest.slice(0, 4))) * 12 + Number(nowKey.slice(5, 7)) - Number(earliest.slice(5, 7)) + 1))
  const spanMonths = period.value ? Number(period.value) : allTimeSpan
  const slots = Array.from({ length: spanMonths }, (_, index) => shiftMonth(nowKey, index - spanMonths + 1))
  const average = averageRows.length ? averageRows.reduce((sum, [, row]) => sum + row.cents, 0) / averageRows.length : 0
  const periodName = period.value ? 'Last ' + period.value + ' months' : 'All time'

  return (
    <div className="stack-xl">
      <div className="page-title-row">
        <div>
          <h1 className="h-page">Trends</h1>
          <p className="lede">{filtered.length === 0 ? 'No receipts match these filters.' : money.format(net / 100) + ' across ' + filtered.length + (filtered.length === 1 ? ' receipt' : ' receipts') + '.'}</p>
        </div>
        <div className="toolbar">
          <div role="group" aria-label="Period" className="segmented">
            {PERIODS.map(([value, label]) => (
              <button key={label} type="button" aria-pressed={period.value === value}
                onClick={() => setPeriod({ value, ...periodRange(value) })}>{label}</button>
            ))}
          </div>
          <label className="field field-inline">Store
            <select value={store} onChange={(event) => setStore(event.target.value)}>
              <option value="">All stores</option>
              {stores.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <section className="panel panel-xl" aria-labelledby="spending-trend-title">
        <div className="row-between row-wrap panel-head">
          <h2 className="h-section" id="spending-trend-title">Monthly spending</h2>
          {monthRows.length > 0 && <p className="muted">Average month: {wholeMoney.format(average / 100)} at {storeName ?? 'all stores'}</p>}
        </div>
        <div className="scroll-x">
          <ul className="month-bars" aria-label="Monthly spending">
            {slots.map((key, index) => {
              const row = months.get(key)
              const current = key === nowKey
              const label = monthName.format(new Date(key + '-01T00:00:00Z'))
              const full = longMonthName.format(new Date(key + '-01T00:00:00Z')) + ' ' + key.slice(0, 4)
              return (
                <li key={key} className="month-col" title={row ? full : full + ': no receipts'}>
                  <span className="month-value">{row ? wholeMoney.format(row.cents / 100) : <span className="visually-hidden">No receipts</span>}</span>
                  <div className={'month-bar' + (current ? ' is-current' : '') + (row ? '' : ' is-empty')}
                    style={row ? { height: Math.max(4, Math.round(Math.abs(row.cents) / monthMax * 190)), '--i': index } : undefined} />
                  <span className={row ? 'month-label' : 'month-label is-quiet'}>{current ? label + ' so far' : label}</span>
                </li>
              )
            })}
          </ul>
        </div>
        {monthRows.length === 0 && <p className="muted spaced">No spending for these filters. Try a longer period or a different store.</p>}
        {monthRows.length > 0 && monthRows.length < 3 && (
          <div className="chart-hint">
            <p className="muted">Months fill in as you save receipts. Scan an older receipt to add its month.</p>
            {onScan && <button className="link-button" type="button" onClick={onScan}>Scan a receipt</button>}
          </div>
        )}
      </section>

      <div className="split">
        <section className="split-main" aria-labelledby="price-watch-title">
          <h2 className="h-section" id="price-watch-title">Price watch</h2>
          <p className="muted spaced-bottom">What you paid per unit, compared with three months ago.</p>
          {watch.rows.length === 0 ? (
            <p className="muted">Nothing to compare yet. A product needs a purchase in {longMonthName.format(new Date(watch.thenMonth + '-01T00:00:00Z'))} and a later one.</p>
          ) : (
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Product</th><th scope="col" className="num">Now</th>
                    <th scope="col" className="num">{longMonthName.format(new Date(watch.thenMonth + '-01T00:00:00Z'))}</th>
                    <th scope="col" className="num">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {watch.rows.map((row) => {
                    const pct = Math.round(Math.abs(row.change) * 100)
                    const flat = pct === 0
                    return (
                      <tr key={row.name}>
                        <td className="strong">{row.name}</td>
                        <td className="num">{money.format(row.now / 100)}</td>
                        <td className="num muted">{money.format(row.then / 100)}</td>
                        <td className="num"><span className={'chip ' + (flat ? 'chip-flat' : row.change > 0 ? 'chip-up' : 'chip-down')}>
                          {flat ? 'No change' : (row.change > 0 ? 'Up ' : 'Down ') + pct + '%'}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="split-side stack" aria-labelledby="category-title">
          <div>
            <h2 className="h-section" id="category-title">By category</h2>
            <p className="muted spaced-bottom">{periodName} at {storeName ?? 'all stores'}</p>
          </div>
          {typeChoices.length === 0 && <p className="muted">No categories for these filters.</p>}
          <ul className="bar-list">
            {typeChoices.map(([key, item]) => (
              <li key={key}>
                <button className="bar-button" type="button" aria-pressed={activeType === key} onClick={() => setType(key)}>
                  <span className="bar-label"><span>{item.name}</span><strong>{money.format(item.cents / 100)}</strong></span>
                  <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: Math.max(2, Math.abs(item.cents) / maxCategory * 100) + '%' }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="split split-even">
        <section className="panel panel-xl" aria-labelledby="product-trend-title">
          <h2 className="h-small" id="product-trend-title">Price history</h2>
          <p className="muted small spaced-bottom">Monthly average per recorded unit. Dotted segments span months without a purchase. Names must match, so compare like package sizes.</p>
          {product && <label className="field">Product
            <select value={activeProduct} onChange={(event) => setProduct(event.target.value)}>
              {productChoices.map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}
            </select>
          </label>}
          <TrendChart key={activeProduct} points={product ? chartPoints(product.months, true) : []} label="Product price chart" line />
          {product?.months.size === 1 && <p className="muted small">One month so far. Save another purchase to see how the price changes.</p>}
        </section>

        <section className="panel panel-xl" aria-labelledby="category-trend-title">
          <h2 className="h-small" id="category-trend-title">Category history</h2>
          <p className="muted small spaced-bottom">Pick a category here or in the list above to see its monthly spending.</p>
          {type && <label className="field">Category
            <select value={activeType} onChange={(event) => setType(event.target.value)}>
              {typeChoices.map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}
            </select>
          </label>}
          <TrendChart key={activeType} points={type ? chartPoints(type.months) : []} label="Category spending chart" />
        </section>
      </div>

      <section className="panel panel-xl panel-flush" aria-labelledby="spending-map-title">
        {locationsReady ? (
          mapOpen ? (
            <Suspense fallback={<p className="panel-pad muted" role="status">Loading map…</p>}>
              <SpendingMap receipts={filtered} onSave={onSaveLocation} onHide={() => setMapOpen(false)} />
            </Suspense>
          ) : (
            <div className="panel-pad stack-sm">
              <h2 className="h-section" id="spending-map-title">Where you shop</h2>
              <p className="muted">See spending at the store branches you’ve pinned. Showing the map loads tiles from OpenStreetMap.</p>
              <div>
                <button className="btn btn-secondary" type="button" aria-expanded="false" onClick={() => setMapOpen(true)}><Icon name="pin" /> Show the map</button>
              </div>
            </div>
          )
        ) : (
          <div className="panel-pad stack-sm">
            <h2 className="h-section" id="spending-map-title">Where you shop</h2>
            <p className="muted">Store locations aren’t available until the location migration is applied.</p>
          </div>
        )}
      </section>
      {rankedStores.length > 1 && (
        <section className="stack" aria-labelledby="stores-title">
          <h2 className="h-section" id="stores-title">By store</h2>
          <ul className="bar-list bar-list-wide">
            {rankedStores.map(([key, item]) => (
              <li key={key}>
                <button className="bar-button" type="button" aria-pressed={store === key} onClick={() => setStore(store === key ? '' : key)}>
                  <span className="bar-label"><span>{stores.find(([id]) => id === key)?.[1] ?? key}</span><strong>{money.format(item.cents / 100)}</strong></span>
                  <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: Math.max(2, Math.abs(item.cents) / maxStore * 100) + '%' }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function periodRange(value) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - Number(value || 0) + 1, 1)
  return { from: monthKey(first), through: monthKey(now) }
}
