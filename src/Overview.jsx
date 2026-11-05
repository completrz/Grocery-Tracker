import { normalizeLabel, resolveCategory } from './categories'
import { useState } from 'react'
import { buildInsights, savingsEstimate, unlockStatus } from './insights'
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

function thisMonthCents(receipts) {
  const month = localDayKey(new Date()).slice(0, 7)
  return receipts.filter((receipt) => receipt.purchased_on.slice(0, 7) === month).reduce((sum, receipt) => sum + receiptTotal(receipt), 0)
}

function BudgetPanel({ budget, spentCents }) {
  const [editing, setEditing] = useState(budget.cents == null)
  const [value, setValue] = useState(budget.cents == null ? '' : String(budget.cents / 100))
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)
  const [now] = useState(() => new Date())
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - dayOfMonth
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(now)

  async function submit(event) {
    event.preventDefault()
    const dollarsValue = Number(value)
    if (value.trim() === '' || !Number.isFinite(dollarsValue) || dollarsValue < 0 || dollarsValue > 1_000_000) {
      setProblem('Enter an amount between $0 and $1,000,000.')
      return
    }
    setSaving(true)
    setProblem('')
    try {
      await budget.save(Math.round(dollarsValue * 100))
      setEditing(false)
    } catch {
      setProblem('Couldn’t save your budget. Try again in a moment.')
    } finally {
      setSaving(false)
    }
  }

  const hasBudget = budget.cents != null
  const over = hasBudget && spentCents > budget.cents
  const projected = dayOfMonth >= 7 && spentCents > 0 ? spentCents / dayOfMonth * daysInMonth : null
  const headingOver = hasBudget && !over && projected !== null && projected > budget.cents

  return (
    <section className="panel budget-panel" aria-labelledby="budget-title">
      <div className="row-between">
        <h2 className="h-small" id="budget-title">{monthLabel} budget</h2>
        {hasBudget && !editing && <button className="link-button" type="button" onClick={() => { setValue(String(budget.cents / 100)); setEditing(true) }}>Change</button>}
      </div>
      {hasBudget && !editing && (
        <>
          <p className="budget-figure"><strong>{dollars.format(spentCents / 100)}</strong> <span className="muted">of {dollars.format(budget.cents / 100)}</span></p>
          <div className="bar-track" role="img" aria-label={`${Math.min(100, Math.round(spentCents / Math.max(1, budget.cents) * 100))}% of the budget spent`}>
            <div className={over ? 'bar-fill is-over' : 'bar-fill'} style={{ width: Math.min(100, spentCents / Math.max(1, budget.cents) * 100) + '%' }} />
          </div>
          <p className="small">
            {over
              ? <><span className="chip chip-up">Over budget</span> {dollars.format((spentCents - budget.cents) / 100)} over with {daysLeft === 1 ? '1 day' : daysLeft + ' days'} to go.</>
              : <>{dollars.format((budget.cents - spentCents) / 100)} left, {daysLeft === 1 ? '1 day' : daysLeft + ' days'} to go.</>}
          </p>
          {projected !== null && !over && (
            <p className="small muted">
              At this pace you’ll spend about {dollars.format(projected / 100)} this month.{' '}
              {headingOver && <span className="chip chip-up">Heading over</span>}
            </p>
          )}
        </>
      )}
      {editing && (
        <form className="stack-sm" onSubmit={submit}>
          {!hasBudget && <p className="muted small">Set a monthly grocery budget and see how you’re tracking, with a warning if you’re heading over.</p>}
          <label className="field">Monthly budget ($)
            <input type="number" inputMode="decimal" min="0" step="1" value={value} onChange={(event) => setValue(event.target.value)} placeholder="500" />
          </label>
          {problem && <p className="note note-warn" role="alert">{problem}</p>}
          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving}>{hasBudget ? 'Update budget' : 'Set budget'}</button>
            {hasBudget && <button className="btn btn-tertiary" type="button" onClick={() => { setEditing(false); setProblem('') }}>Cancel</button>}
          </div>
        </form>
      )}
    </section>
  )
}

export default function Overview({ receipts, rules, loaded, error, budget, onScan, onOpenReceipt, onOpenView }) {
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
  const insights = buildInsights(withItems, rules)
  const unlock = unlockStatus(withItems)
  const savings = savingsEstimate(withItems)
  const monthSpent = thisMonthCents(withItems)
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
        <div className="split-main stack-xl">
          {(insights.length > 0 || !unlock.ready) && (
            <section aria-labelledby="changed-title">
              <h2 className="h-section" id="changed-title">What changed</h2>
              <p className="muted spaced-bottom">The last 30 days, compared with the 30 days before and with your usual month.</p>
              {insights.length > 0 && (
                <ul className="insight-list">
                  {insights.map((row) => (
                    <li key={row.id}>
                      <div>
                        <div className="strong">{row.text}</div>
                        <div className="muted small">{row.detail}</div>
                      </div>
                      <span className={'chip chip-' + row.chip.tone}>{row.chip.label}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!unlock.ready && (
                <div className="unlock">
                  <div className="row-between">
                    <strong>Unlock your usual-month comparisons</strong>
                    <span className="muted small">{unlock.days} of {unlock.needed} days</span>
                  </div>
                  <div className="bar-track" role="img" aria-label={`${unlock.days} of ${unlock.needed} days of history`}>
                    <div className="bar-fill" style={{ width: Math.max(3, unlock.days / unlock.needed * 100) + '%' }} />
                  </div>
                  <p className="muted small">CartTrail needs about two months of receipts to know what’s normal for you. Scan older receipts to get there sooner.</p>
                </div>
              )}
            </section>
          )}
          {savings && (
            <section aria-labelledby="savings-title">
              <h2 className="h-section" id="savings-title">Savings finder</h2>
              <p className="muted spaced-bottom">Buying these at the cheaper store could have saved about {dollars.format(savings.perMonthCents / 100)} a month over the last 3 months.</p>
              <ul className="insight-list">
                {savings.rows.map((row) => (
                  <li key={row.key}>
                    <div>
                      <div className="strong">{row.name}</div>
                      <div className="muted small">{row.cheapest.name} {dollars.format(row.cheapest.price / 100)} a unit, against {row.priciest.name} {dollars.format(row.priciest.price / 100)}.</div>
                    </div>
                    <span className="chip chip-down">Save {dollars.format(row.saving / 100)}</span>
                  </li>
                ))}
              </ul>
              <p className="muted small spaced">Per-unit prices from your own receipts. Check package sizes before you switch.</p>
            </section>
          )}
          <section>
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
          </section>
        </div>

        <div className="split-side stack-lg">
          {budget && <BudgetPanel key={budget.cents ?? 'none'} budget={budget} spentCents={monthSpent} />}
          <div>
          <h2 className="h-section">Where it went</h2>
          {categories.length === 0
            ? <p className="muted">Nothing in the last 30 days.</p>
            : <CategoryBars categories={categories} />}
          <button className="link-button spaced" type="button" onClick={() => onOpenView('trends')}>Open trends</button>
          </div>
        </div>
      </section>
    </div>
  )
}
