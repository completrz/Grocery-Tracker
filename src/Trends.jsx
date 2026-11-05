import { useMemo, useState } from 'react'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

const categories = [
  ['Produce', /\b(?:banana|apple|avocado|carrot|onion|onions|tomato|tomatoes|lettuce|spinach|broccoli|potato|berries|berry|mix veg|green onions)s?\b/],
  ['Pantry', /\b(?:oats|rice|pasta|fusill\w*|flour|sugar|sug|cereal|nutella|beans|peanut butter)\b/],
  ['Dairy & eggs', /\b(?:milk|yogurt|cheese|cheddar|eggs?|butter|cream cheese|sour cream)\b/],
  ['Meat & seafood', /\b(?:chicken|chk|beef|pork|turkey|salmon|shrimp|steak|bacon|sausage)\b/],
  ['Bakery', /\b(?:bread|bagel|tortilla|muffin|buns?|rolls?)s?\b/],
  ['Drinks', /\b(?:coffee|tea|juice|soda|sparkling water|lemonade)\b/],
  ['Household', /\b(?:detergent|tide\w*|soap|paper towel|toilet paper|scott single|shopping bag)\b/],
]

const normalize = (name) => name.toLowerCase().trim().replace(/\s+/g, ' ')
const categoryFor = (name) => categories.find(([, pattern]) => pattern.test(name))?.[0] ?? 'Uncategorized'

function addMonth(series, month, cents, units) {
  const value = series.get(month) ?? { cents: 0, lines: 0, units: 0 }
  value.cents += cents
  value.lines += 1
  value.units += units
  series.set(month, value)
}

function collectTrends(receipts) {
  const products = new Map()
  const types = new Map()

  for (const receipt of receipts) {
    const month = receipt.purchased_on.slice(0, 7)
    for (const item of receipt.receipt_items) {
      const name = normalize(item.item_name)
      if (!name) continue

      const category = categoryFor(name)
      if (!types.has(category)) types.set(category, new Map())
      addMonth(types.get(category), month, item.line_total_cents, 0)

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

export default function Trends({ receipts }) {
  const { products, types } = useMemo(() => collectTrends(receipts), [receipts])
  const [productKey, setProduct] = useState('')
  const [typeKey, setType] = useState('')
  const productChoices = [...products].sort(([, a], [, b]) => b.months.size - a.months.size || a.name.localeCompare(b.name))
  const typeChoices = [...types.keys()].sort((a, b) => a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b))
  const activeProduct = products.has(productKey) ? productKey : productChoices[0]?.[0]
  const activeType = types.has(typeKey) ? typeKey : typeChoices[0]
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
                {typeChoices.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <TrendRows series={types.get(activeType)} />
            <p className="trend-note">Categories are estimated from receipt item names. Unmatched items appear under Uncategorized.</p>
          </>
        ) : <p className="empty">Save a receipt to see category spending.</p>}
      </section>
    </div>
  )
}
