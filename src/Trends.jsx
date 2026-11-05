import { useMemo, useState } from 'react'
import { normalizeLabel, resolveCategory } from './categories'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function addMonth(series, month, cents, units) {
  const value = series.get(month) ?? { cents: 0, lines: 0, units: 0 }
  value.cents += cents
  value.lines += 1
  value.units += units
  series.set(month, value)
}

function collectTrends(receipts, rules) {
  const products = new Map()
  const types = new Map()

  for (const receipt of receipts) {
    const month = receipt.purchased_on.slice(0, 7)
    for (const item of receipt.receipt_items) {
      const name = normalizeLabel(item.item_name)
      if (!name) continue

      const category = resolveCategory(rules, receipt.store, item.item_name, item.category)
      const categoryId = normalizeLabel(category)
      if (!types.has(categoryId)) types.set(categoryId, { name: category, months: new Map() })
      addMonth(types.get(categoryId).months, month, item.line_total_cents, 0)

      const units = Number(item.quantity)
      if (!(units > 0) || item.line_total_cents < 0) continue
      if (!products.has(name)) products.set(name, { name: item.item_name.trim(), months: new Map() })
      addMonth(products.get(name).months, month, item.line_total_cents, units)
    }
  }

  return { products, types }
}

function TrendRows({ series, product }) {
  const rows = [...series].sort(([a], [b]) => a.localeCompare(b))
  const amount = (entry) => product ? entry.cents / entry.units : entry.cents
  const max = Math.max(1, ...rows.map(([, entry]) => amount(entry)))

  return (
    <ul className="trend-rows">
      {rows.map(([month, entry]) => (
        <li key={month}>
          <span>{monthName.format(new Date(month + '-01'))}</span>
          <span className="bar" aria-hidden="true">
            <span style={{ width: Math.max(0, amount(entry)) / max * 100 + '%' }} />
          </span>
          <strong>{money.format(amount(entry) / 100)}</strong>
          <small>{entry.lines} {entry.lines === 1 ? 'line' : 'lines'}{product ? ' · ' + quantity.format(entry.units) + ' qty' : ''}</small>
        </li>
      ))}
    </ul>
  )
}

export default function Trends({ receipts, rules }) {
  const { products, types } = useMemo(() => collectTrends(receipts, rules), [receipts, rules])
  const [productKey, setProduct] = useState('')
  const [typeKey, setType] = useState('')
  const productChoices = [...products].sort(([, a], [, b]) => b.months.size - a.months.size || a.name.localeCompare(b.name))
  const typeChoices = [...types].sort(([a, first], [b, second]) =>
    a === 'uncategorized' ? 1 : b === 'uncategorized' ? -1 : first.name.localeCompare(second.name),
  )
  const activeProduct = products.has(productKey) ? productKey : productChoices[0]?.[0]
  const activeType = types.has(typeKey) ? typeKey : typeChoices[0]?.[0]
  const product = products.get(activeProduct)

  return (
    <div className="trend-grid">
      <section className="panel trend-panel" aria-labelledby="product-trend-title">
        <div className="panel-heading">
          <h2 id="product-trend-title">Product price history</h2>
          <p className="muted">Monthly average paid per unit, based on receipt quantities.</p>
        </div>
        {product ? (
          <>
            <label className="trend-select">Product
              <select value={activeProduct} onChange={(event) => setProduct(event.target.value)}>
                {productChoices.map(([key, item]) => <option value={key} key={key}>{item.name}</option>)}
              </select>
            </label>
            <TrendRows series={product.months} product />
            {product.months.size === 1 && <p className="trend-note">One month of data. Another month is needed to see a change.</p>}
            <p className="trend-note">Groups matching receipt names across stores. Check package sizes before comparing prices.</p>
          </>
        ) : <p className="empty">Save a receipt with priced items to see product history.</p>}
      </section>
      <section className="panel trend-panel" aria-labelledby="category-trend-title">
        <div className="panel-heading">
          <h2 id="category-trend-title">Spending by category</h2>
          <p className="muted">Monthly line totals for the selected category.</p>
        </div>
        {activeType ? (
          <>
            <label className="trend-select">Category
              <select value={activeType} onChange={(event) => setType(event.target.value)}>
                {typeChoices.map(([key, type]) => <option key={key} value={key}>{type.name}</option>)}
              </select>
            </label>
            <TrendRows series={types.get(activeType).months} />
            <p className="trend-note">Saved and remembered categories come first. Other items use name-based suggestions.</p>
          </>
        ) : <p className="empty">Save a receipt to see category spending.</p>}
      </section>
    </div>
  )
}
