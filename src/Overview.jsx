import { normalizeLabel, resolveCategory } from './categories'
import { dollars, formatDate, formatShortDate, localDayKey, plural, receiptLines, receiptTotal, shortDateLabel } from './format'
import { CategoryBars, GhostBars, GhostReceipt, GhostRows, Icon, ReceiptPaper } from './ui'

const DAYS = 30

function buildWindow(receipts, rules) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: DAYS }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (DAYS - 1 - index))
    return { date, key: localDayKey(date), cents: 0 }
  })
  const previousStart = new Date(today)
  previousStart.setDate(today.getDate() - (DAYS * 2 - 1))
  const first = days[0].key
  const previousFirst = localDayKey(previousStart)
  const byDay = new Map(days.map((day) => [day.key, day]))
  const categories = new Map()
  const stores = new Set()
  let cents = 0
  let previousCents = 0
  let trips = 0

  for (const receipt of receipts) {
    if (receipt.receipt_items.length === 0) continue
    const total = receiptTotal(receipt)
    if (receipt.purchased_on >= first) {
      const day = byDay.get(receipt.purchased_on)
      if (!day) continue // dated in the future
      day.cents += total
      cents += total
      trips += 1
      stores.add(normalizeLabel(receipt.store))
      for (const item of receipt.receipt_items) {
        const name = resolveCategory(rules, receipt.store, item.item_name, item.category)
        const key = normalizeLabel(name)
        const entry = categories.get(key) ?? { name, cents: 0 }
        entry.cents += item.line_total_cents
        categories.set(key, entry)
      }
    } else if (receipt.purchased_on >= previousFirst) {
      previousCents += total
    }
  }

  return {
    days, cents, previousCents, trips, stores: stores.size,
    categories: [...categories.values()].sort((a, b) => b.cents - a.cents).slice(0, 6),
  }
}

function comparison(cents, previousCents) {
  if (previousCents <= 0) return ''
  const diff = cents - previousCents
  if (diff === 0) return ' That’s the same as the 30 days before.'
  return ` That’s ${dollars.format(Math.abs(diff) / 100)} ${diff < 0 ? 'less' : 'more'} than the 30 days before.`
}

export default function Overview({ receipts, rules, loaded, error, onScan, onOpenReceipt, onOpenView }) {
  if (error) return <p className="note note-warn" role="alert">{error}</p>

  if (!loaded) {
    return (
      <div className="stack-xl" role="status" aria-label="Loading your receipts">
        <div className="skeleton" style={{ height: 120, maxWidth: 640 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </div>
    )
  }

  const withItems = receipts.filter((receipt) => receipt.receipt_items.length > 0)
  if (withItems.length === 0) {
    return (
      <div className="stack-xxl">
        <section className="split">
          <div className="split-main stack-lg">
            <h1 className="headline">No receipts yet. Scan your first one to start tracking.</h1>
            <p className="lede">Your spending for the last 30 days, your latest receipt and where the money went will fill in here.</p>
            <div><button className="btn btn-primary btn-large" type="button" onClick={onScan}><Icon name="scan" /> Scan a receipt</button></div>
            <figure className="panel day-panel">
              <figcaption>Spending by day</figcaption>
              <div className="day-bars" aria-hidden="true">
                {Array.from({ length: DAYS }, (_, index) => <div key={index} className="day-bar" />)}
              </div>
              <div className="day-axis" aria-hidden="true"><span>30 days ago</span><span /><span>Today</span></div>
            </figure>
          </div>
          <aside className="split-side stack-sm" aria-label="Latest receipt">
            <h2 className="h-small">Latest receipt</h2>
            <GhostReceipt />
            <p className="muted small">Your most recent receipt shows up here.</p>
          </aside>
        </section>

        <section className="split">
          <div className="split-main">
            <h2 className="h-section">Recent receipts</h2>
            <div className="table-panel">
              <table>
                <thead>
                  <tr><th scope="col">Store</th><th scope="col">Date</th><th scope="col" className="num">Items</th><th scope="col" className="num">Total</th></tr>
                </thead>
                <tbody><GhostRows columns={4} rows={4} /></tbody>
              </table>
            </div>
          </div>
          <div className="split-side">
            <h2 className="h-section">Where it went</h2>
            <GhostBars count={5} />
          </div>
        </section>
      </div>
    )
  }

  const { days, cents, previousCents, trips, stores, categories } = buildWindow(withItems, rules)
  const max = Math.max(1, ...days.map((day) => day.cents))
  const latest = withItems[0]
  const middle = days[Math.floor(DAYS / 2)].date

  return (
    <div className="stack-xxl">
      <section className="split">
        <div className="split-main stack-lg">
          {trips === 0 ? (
            <>
              <h1 className="headline">You haven’t saved a receipt in the last 30 days.</h1>
              <p className="lede">Your most recent one is from {formatDate(latest.purchased_on)}.</p>
            </>
          ) : (
            <>
              <h1 className="headline">You’ve spent {dollars.format(cents / 100)} on groceries in the last 30 days.</h1>
              <p className="lede">{plural(trips, 'trip')}, {plural(stores, 'store')}.{comparison(cents, previousCents)}</p>
            </>
          )}
          <figure className="panel day-panel">
            <figcaption>Spending by day</figcaption>
            <div className="day-bars" role="img"
              aria-label={`Spending by day for the last 30 days: ${dollars.format(cents / 100)} across ${plural(trips, 'trip')}.`}>
              {days.map((day, index) => (
                <div key={day.key}
                  title={shortDateLabel.format(day.date) + ': ' + (day.cents ? dollars.format(day.cents / 100) : 'no receipts')}
                  className={day.cents > 0 ? 'day-bar has-spend' : 'day-bar'}
                  style={day.cents > 0 ? { height: Math.max(6, Math.round(day.cents / max * 128)), '--i': index } : undefined} />
              ))}
            </div>
            <div className="day-axis"><span>{shortDateLabel.format(days[0].date)}</span><span>{shortDateLabel.format(middle)}</span><span>Today</span></div>
          </figure>
        </div>

        <aside className="split-side stack-sm" aria-label="Latest receipt">
          <div className="row-between">
            <h2 className="h-small">Latest receipt</h2>
            <button className="link-button" type="button" onClick={() => onOpenReceipt(latest.id)}>Open</button>
          </div>
          <ReceiptPaper store={latest.store} date={formatDate(latest.purchased_on)}
            lines={receiptLines(latest.receipt_items)} subtotal={dollars.format(receiptTotal(latest) / 100)} />
        </aside>
      </section>

      <section className="split">
        <div className="split-main">
          <h2 className="h-section">Recent receipts</h2>
          <div className="table-panel">
            <table>
              <thead>
                <tr><th scope="col">Store</th><th scope="col">Date</th><th scope="col" className="num">Items</th><th scope="col" className="num">Total</th></tr>
              </thead>
              <tbody>
                {withItems.slice(0, 5).map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="strong"><button className="link-button link-ink" type="button" onClick={() => onOpenReceipt(receipt.id)}>{receipt.store}</button></td>
                    <td className="muted">{formatShortDate(receipt.purchased_on)}</td>
                    <td className="num muted">{receipt.receipt_items.length}</td>
                    <td className="num strong">{dollars.format(receiptTotal(receipt) / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="link-button spaced" type="button" onClick={() => onOpenView('receipts')}>See all receipts</button>
        </div>

        <div className="split-side">
          <h2 className="h-section">Where it went</h2>
          {categories.length === 0
            ? <p className="muted">Nothing in the last 30 days.</p>
            : <CategoryBars categories={categories} />}
          <button className="link-button spaced" type="button" onClick={() => onOpenView('trends')}>Open trends</button>
        </div>
      </section>
    </div>
  )
}
