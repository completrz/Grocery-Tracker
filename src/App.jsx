import { useEffect, useState } from 'react'
import './App.css'
import Trends from './Trends'
import { categoryKey, defaultCategories, normalizeLabel, resolveCategory, tidyCategory } from './categories'
import { supabase } from './supabase'

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function blankItem() {
  return { id: crypto.randomUUID(), name: '', quantity: '1', total: '', category: '' }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setReady(true)
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  if (!ready) return <main className="loading" role="status">Opening Grocery Tracker…</main>
  return session
    ? <Tracker key={session.user.id} email={session.user.email} />
    : <SignIn />
}

function Icon({ name }) {
  const paths = {
    overview: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
    trends: 'M3 3v18h18M7 16l4-5 4 2 5-7',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3Zm3 5h6m-6 4h6',
    camera: 'M4 7h4l2-3h4l2 3h4a1 1 0 0 1 1 1v11H3V8a1 1 0 0 1 1-1Zm12 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    search: 'M15.5 15.5 21 21m-3.5-10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
    plus: 'M12 5v14M5 12h14',
    close: 'm6 6 12 12M18 6 6 18',
    chevron: 'm9 5 7 7-7 7',
  }
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}

function Brand() {
  return <span className="brand"><span className="brand-mark"><Icon name="receipt" /></span>Grocery Tracker</span>
}

const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const dateLabel = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })

function receiptTotal(receipt) {
  return receipt.receipt_items.reduce((sum, item) => sum + item.line_total_cents, 0)
}

function SpendingChart({ months }) {
  const recent = months.slice(0, 6).reverse()
  const low = Math.min(0, ...recent.map(([, cents]) => cents))
  const high = Math.max(1, ...recent.map(([, cents]) => cents))
  const y = (cents) => 14 + (high - cents) / (high - low) * 140
  const cell = 312 / recent.length
  const width = Math.min(cell * .52, 46)

  return (
    <figure className="spending-chart">
      <svg viewBox="0 0 390 185" aria-hidden="true">
        {[high, (high + low) / 2, low].map((cents) => (
          <g key={cents}>
            <line className="chart-grid" x1="68" x2="380" y1={y(cents)} y2={y(cents)} />
            <text x="61" y={y(cents) + 4} textAnchor="end">{dollars.format(cents / 100)}</text>
          </g>
        ))}
        {recent.map(([month, cents], index) => {
          const x = 68 + (index + .5) * cell
          return (
            <g key={month}>
              <rect x={x - width / 2} y={Math.min(y(0), y(cents))} width={width}
                height={Math.abs(y(0) - y(cents))} rx="3" className="chart-bar" />
              <text x={x} y="175" textAnchor="middle">{monthLabel.format(new Date(month + '-01'))}</text>
            </g>
          )
        })}
      </svg>
      <figcaption>Up to six most recent months with saved items</figcaption>
      <details className="chart-values">
        <summary>View monthly totals</summary>
        <ul className="months">
          {months.map(([month, cents]) => (
            <li key={month}>
              <div><span>{monthLabel.format(new Date(month + '-01'))}</span>
                <strong>{dollars.format(cents / 100)}</strong></div>
            </li>
          ))}
        </ul>
      </details>
    </figure>
  )
}

function SignIn() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function signIn(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    setBusy(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: form.get('email').trim(),
        password: form.get('password'),
      })
      if (error) throw error
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    setBusy(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL('/', window.location.origin).href },
      })
      if (error) throw error
    } catch (error) {
      setMessage(error.message)
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-intro">
        <Brand />
        <div>
          <h1>Grocery spending, by receipt.</h1>
          <p>Scan your receipts, check the items, and see your spending over time.</p>
        </div>
      </div>
      <section className="auth-card" aria-labelledby="sign-in-title">
        <h2 id="sign-in-title">Sign in</h2>
        <p className="muted">Open your private receipt history.</p>
        <button className="button secondary google" type="button" disabled={busy} onClick={signInWithGoogle}>
          <span aria-hidden="true">G</span> Sign in with Google
        </button>
        <div className="divider"><span>or use email</span></div>
        <form onSubmit={signIn}>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="form-status" role="status">{message}</p>
      </section>
    </main>
  )
}

function Tracker({ email }) {
  const [receipts, setReceipts] = useState([])
  const [locationsReady, setLocationsReady] = useState(false)
  const [items, setItems] = useState(() => [blankItem()])
  const [store, setStore] = useState('')
  const [date, setDate] = useState('')
  const [receiptId, setReceiptId] = useState('')
  const [scanText, setScanText] = useState('')
  const [azureSubtotal, setAzureSubtotal] = useState(null)
  const [message, setMessage] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const [categoryStatus, setCategoryStatus] = useState('')
  const [categoryReady, setCategoryReady] = useState(false)
  const [categoryRules, setCategoryRules] = useState(() => new Map())
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [view, setView] = useState('overview')
  const [previewUrl, setPreviewUrl] = useState('')
  const [currentMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    if (previewUrl) return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => {
    let active = true

    async function loadReceipts() {
      const rules = await supabase.from('receipt_category_rules').select('store_key, item_key, category')
      const hasCategories = !rules.error
      const columns = 'id, item_name, quantity, line_total_cents' + (hasCategories ? ', category' : '')
      const fields = 'id, store, purchased_on, receipt_items(' + columns + ')'
      const load = (select) => supabase.from('receipts').select(select)
        .order('purchased_on', { ascending: false })
      const withLocations = await load(fields + ', latitude, longitude')
      const missingLocationColumns = ['42703', 'PGRST204'].includes(withLocations.error?.code) &&
        /latitude|longitude/i.test(withLocations.error.message)
      const { data, error } = missingLocationColumns ? await load(fields) : withLocations

      if (!active) return
      setLocationsReady(!missingLocationColumns && !error)
      setCategoryReady(hasCategories)
      setCategoryError(rules.error && !['PGRST205', '42P01'].includes(rules.error.code)
        ? 'Saved categories could not be loaded.' : '')
      setCategoryRules(new Map((rules.data ?? []).map((rule) => [
        categoryKey(rule.store_key, rule.item_key), rule.category,
      ])))
      setHistoryError(error?.message ?? '')
      if (!error) setReceipts(data)
    }

    loadReceipts()
    return () => { active = false }
  }, [refresh])

  function updateItem(id, field, value) {
    setItems((current) => current.map((item) =>
      item.id === id ? { ...item, [field]: value } : item,
    ))
  }

  async function scanReceipt(event) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setMessage('Choose a JPEG or PNG receipt photo.')
      return
    }

    if (file.size === 0 || file.size > 4_000_000) {
      setMessage('Choose a receipt photo under 4 MB.')
      return
    }

    const hasDraftItems = items.some((item) => item.name.trim() || item.total.trim())
    if (hasDraftItems && !window.confirm('Replace your draft items if this scan finds new items?')) {
      return
    }

    setBusy(true)
    setMessage('Scanning with Azure…')

    try {
      const body = new FormData()
      body.append('photo', file)

      const { data, error } = await supabase.functions.invoke('hyper-handler', { body })
      if (error) {
        console.error('Receipt scan failed:', error, error.context)
        const details = error.context instanceof Response
          ? await error.context.json().catch(() => null)
          : null
        throw new Error(details?.error ?? error.message)
      }

      setPreviewUrl(URL.createObjectURL(file))
      setScanText(data.text ?? '')

      if (data.items.length === 0) {
        setMessage('No items found. Check the scanned text or enter the items manually.')
        return
      }

      setAzureSubtotal(data.subtotal ?? null)
      if (!receiptId) {
        setStore(data.store ?? '')
        setDate(data.date ?? '')
      }

      setItems(data.items.map((item) => ({
        ...blankItem(),
        name: item.name ?? '',
        quantity: String(item.quantity ?? 1),
        total: typeof item.total === 'number' ? item.total.toFixed(2) : '',
      })))

      setMessage(`Found ${data.items.length} items. Review them before saving.`)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  const enteredItems = items.filter((item) => item.name.trim() || item.total.trim())
  const missingPrices = enteredItems.filter((item) => !item.total.trim()).length
  const enteredCents = enteredItems.reduce(
    (sum, item) => sum + Math.round(Number(item.total) * 100),
    0,
  )
  const subtotalCents = azureSubtotal === null
    ? null
    : Math.round(azureSubtotal * 100)

  const choices = [...new Map([...defaultCategories, ...categoryRules.values()]
    .map((category) => [normalizeLabel(category), category])).values()]
  const activeStore = receiptId ? receipts.find((receipt) => receipt.id === receiptId)?.store ?? '' : store

  async function saveItemCategory(event, itemId) {
    event.preventDefault()
    const category = tidyCategory(new FormData(event.currentTarget).get('category'), choices)
    if (!category) {
      setCategoryStatus('Enter a category to remember.')
      return
    }
    setBusy(true)
    setCategoryStatus('')
    try {
      const { data, error } = await supabase.from('receipt_items')
        .update({ category }).eq('id', itemId).select('id').single()
      if (error) throw error
      if (!data) throw new Error('The receipt item could not be updated.')
      setCategoryStatus('Category saved. Matching items will reuse it.')
      setRefresh((current) => current + 1)
    } catch (error) {
      setCategoryStatus(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveReceipt(event) {
    event.preventDefault()

    const rows = enteredItems.map((item) => ({
      item_name: item.name.trim(),
      quantity: Number(item.quantity),
      line_total_cents: item.total.trim()
        ? Math.round(Number(item.total) * 100)
        : NaN,
      ...(categoryReady && item.category.trim()
        ? { category: tidyCategory(item.category, choices) }
        : {}),
    }))

    const invalidItem = rows.some((row) =>
      !row.item_name ||
      !Number.isFinite(row.quantity) ||
      row.quantity <= 0 ||
      !Number.isInteger(row.line_total_cents) ||
      row.line_total_cents < -2147483648 ||
      row.line_total_cents > 2147483647,
    )

    if (rows.length === 0 || invalidItem) {
      setMessage('Enter a name, positive quantity, and valid line total for each item.')
      return
    }

    if (!receiptId && (!store.trim() || !date)) {
      setMessage('Enter a store and purchase date.')
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const { error } = receiptId
        ? await supabase.from('receipt_items').insert(
            rows.map((row) => ({ ...row, receipt_id: receiptId })),
          )
        : await supabase.rpc('save_grocery_receipt', {
            p_store: store.trim(),
            p_purchased_on: date,
            p_items: rows,
          })

      if (error) throw error

      setMessage(receiptId ? 'Items saved!' : 'Receipt saved!')
      setItems([blankItem()])
      setStore('')
      setDate('')
      setReceiptId('')
      setScanText('')
      setPreviewUrl('')
      setAzureSubtotal(null)
      setRefresh((current) => current + 1)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveReceiptLocation(id, point) {
    const [latitude, longitude] = point ?? [null, null]
    const { data, error } = await supabase.from('receipts')
      .update({ latitude, longitude }).eq('id', id).select('id, latitude, longitude').single()
    if (error) throw error
    setReceipts((current) => current.map((receipt) => receipt.id === id ? { ...receipt, ...data } : receipt))
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
  }

  const monthlyTotals = new Map()
  let recordedReceipts = 0
  let lifetimeCents = 0
  for (const receipt of receipts) {
    if (receipt.receipt_items.length === 0) continue
    const month = receipt.purchased_on.slice(0, 7)
    const cents = receiptTotal(receipt)
    recordedReceipts += 1
    lifetimeCents += cents
    monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + cents)
  }

  const months = [...monthlyTotals]
  const query = search.trim().toLowerCase().replace(/\s+/g, ' ')
  const visibleReceipts = receipts.filter((receipt) =>
    receipt.store.toLowerCase().replace(/\s+/g, ' ').includes(query) ||
    receipt.purchased_on.includes(query) ||
    receipt.receipt_items.some((item) => item.item_name.toLowerCase().replace(/\s+/g, ' ').includes(query)),
  )
  const subtotalMatches = missingPrices === 0 && enteredCents === subtotalCents

  function openView(nextView) {
    setView(nextView)
    window.scrollTo(0, 0)
  }

  return (
    <div className="app-shell">
      <header className="app-rail">
        <button type="button" className="brand-link" onClick={() => openView('overview')}><Brand /></button>
        <nav aria-label="Dashboard">
          <span className="nav-label">Workspace</span>
          {[
            ['overview', 'Overview', 'overview'],
            ['trends', 'Trends', 'trends'],
            ['receipts', 'Receipts', 'receipt'],
            ['capture', 'Scan receipt', 'camera'],
          ].map(([key, label, icon]) => (
            <button key={key} type="button" aria-current={view === key ? 'page' : undefined}
              onClick={() => openView(key)}><Icon name={icon} />{label}</button>
          ))}
        </nav>
        <div className="account">
          <span className="avatar" aria-hidden="true">{email?.[0]?.toUpperCase() ?? 'U'}</span>
          <div className="account-info">
            <span title={email}>{email}</span>
            <button className="button quiet" type="button" disabled={busy} onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="dashboard" id="overview">
        <div className="page-heading">
          <div>
            <h1>{{ overview: 'Spending overview', trends: 'Trends', receipts: 'Receipt history', capture: 'Add a receipt' }[view]}</h1>
            <p className="muted">{{
              overview: 'Spending from your saved receipts.',
              trends: 'Track what you paid for repeat purchases and where your spending goes.',
              receipts: 'Find past purchases by store, item, or date.',
              capture: 'Upload a receipt photo or enter your purchases by hand.',
            }[view]}</p>
          </div>
          {view !== 'capture' && (
            <button className="button primary" type="button" onClick={() => openView('capture')}>
              <Icon name="plus" /> Add receipt
            </button>
          )}
        </div>

        <section className="metrics" aria-label="Spending summary" hidden={view !== 'overview'}>
          <div className="metric featured">
            <span>This month</span>
            <strong>{dollars.format((monthlyTotals.get(currentMonth) ?? 0) / 100)}</strong>
            <small>Saved item totals</small>
          </div>
          <div className="metric">
            <span>Receipts saved</span>
            <strong>{receipts.length}</strong>
            <small>All time</small>
          </div>
          <div className="metric">
            <span>Average receipt</span>
            <strong>{recordedReceipts ? dollars.format(lifetimeCents / recordedReceipts / 100) : '—'}</strong>
            <small>Receipts with items</small>
          </div>
          <div className="metric">
            <span>Latest receipt</span>
            <strong>{receipts[0]?.store ?? '—'}</strong>
            <small>{receipts[0] ? dateLabel.format(new Date(receipts[0].purchased_on)) : 'No receipts yet'}</small>
          </div>
        </section>

        {categoryReady && (
          <datalist id="receipt-category-options">
            {choices.map((category) => <option key={category} value={category} />)}
          </datalist>
        )}
        {categoryError && <p className="form-status" role="status">{categoryError}</p>}
        {view === 'trends' && <Trends receipts={receipts} rules={categoryRules} locationsReady={locationsReady} onSaveLocation={saveReceiptLocation} />}

        <div className="workspace-content" data-view={view} hidden={view === 'trends'}>
          <section className="panel capture-panel" id="capture" aria-label="Receipt entry" hidden={view !== 'capture'}>
            <form onSubmit={saveReceipt}>
              <fieldset className="form-body" disabled={busy}>
                <label className="upload">
                  <input className="visually-hidden" type="file" accept="image/jpeg,image/png"
                    capture="environment" onChange={scanReceipt} />
                  <span className="upload-icon"><Icon name="camera" /></span>
                  <span><strong>{previewUrl ? 'Scan another photo' : 'Scan a receipt photo'}</strong>
                    <small>JPEG or PNG · Up to 4 MB</small></span>
                </label>
                <p className="privacy-note">Photos are sent to Azure for processing.</p>
                <p className="form-status" role="status">{message}</p>

                {previewUrl && (
                  <details className="scan-details">
                    <summary>View receipt photo</summary>
                    <img src={previewUrl} alt="Receipt selected for scanning" />
                  </details>
                )}
                {scanText && (
                  <details className="scan-details">
                    <summary>View scanned text</summary>
                    <pre>{scanText}</pre>
                  </details>
                )}

                <label className="receipt-select">Save to
                  <select value={receiptId} onChange={(event) => setReceiptId(event.target.value)}>
                    <option value="">New receipt</option>
                    {receipts.map((receipt) => (
                      <option key={receipt.id} value={receipt.id}>
                        {receipt.store} · {receipt.purchased_on}
                      </option>
                    ))}
                  </select>
                </label>

                {!receiptId && (
                  <div className="receipt-fields">
                    <label>Store
                      <input value={store} placeholder="e.g. H-E-B"
                        onChange={(event) => setStore(event.target.value)} required />
                    </label>
                    <label>Purchase date
                      <input type="date" value={date}
                        onChange={(event) => setDate(event.target.value)} required />
                    </label>
                  </div>
                )}

                <div className="items-heading">
                  <h3>Line items</h3>
                  <button className="button quiet" type="button" onClick={() => setItems(
                    (current) => [...current, blankItem()],
                  )}><Icon name="plus" /> Add item</button>
                </div>
                {categoryReady && (
                  <p className="trend-note category-help">
                    Leave the category blank to use the suggestion. Enter a category to remember it for this store and item name.
                  </p>
                )}
                {items.map((item, index) => (
                  <fieldset className="item-row" key={item.id}>
                    <legend className="visually-hidden">Item {index + 1}</legend>
                    <label>Item name
                      <input value={item.name} placeholder="e.g. Whole milk"
                        onChange={(event) => updateItem(item.id, 'name', event.target.value)} />
                    </label>
                    <label>Qty
                      <input type="number" step="any" value={item.quantity}
                        onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} />
                    </label>
                    <label>Line total ($)
                      <input type="number" step="0.01" value={item.total} placeholder="0.00"
                        onChange={(event) => updateItem(item.id, 'total', event.target.value)} />
                    </label>
                    <button className="button icon-button" type="button" aria-label={`Remove item ${index + 1}`}
                      onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}>
                      <Icon name="close" />
                    </button>
                    {categoryReady && (
                      <label className="draft-category">Category
                        <input list="receipt-category-options" value={item.category} maxLength={64}
                          placeholder={resolveCategory(categoryRules, activeStore, item.name)}
                          onChange={(event) => updateItem(item.id, 'category', event.target.value)} />
                      </label>
                    )}
                  </fieldset>
                ))}

                <div className="review-footer">
                  <div>
                    <span className="muted">Entered line totals</span>
                    <strong>{dollars.format(enteredCents / 100)}</strong>
                  </div>
                  {!receiptId && subtotalCents !== null && (
                    <p className={subtotalMatches ? 'review-status match' : 'review-status warning'} role="status">
                      Scanned subtotal {azureSubtotal.toFixed(2)}.{' '}
                      {missingPrices > 0
                        ? `${missingPrices} item(s) still need a price.`
                        : subtotalMatches
                          ? 'Totals match. Review each line before saving.'
                          : 'Totals differ. Check items, prices, or discounts.'}
                    </p>
                  )}
                  <button className="button primary" type="submit">
                    {receiptId ? 'Save items' : 'Save receipt'}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>

            <section className="panel" aria-labelledby="spending-title" hidden={view !== 'overview'}>
              <div className="panel-heading">
                <h2 id="spending-title">Monthly spending</h2>
                <p className="muted">Saved line totals in USD.</p>
              </div>
              {months.length === 0
                ? <p className="empty">Save a receipt to see monthly totals.</p>
                : <SpendingChart months={months} />}
            </section>

            <section className="panel" id="history" aria-labelledby="history-title" hidden={view === 'capture'}>
              <div className="panel-heading">
                <h2 id="history-title">{view === 'overview' ? 'Recent receipts' : 'Saved receipts'}</h2>
                <label className="search"><Icon name="search" />
                  <input type="search" aria-label="Search receipts" placeholder="Search stores, items, or dates"
                    value={search} onChange={(event) => setSearch(event.target.value)} />
                </label>
              </div>
              {historyError && <p className="empty" role="alert">{historyError}</p>}
              {categoryReady && <p className="form-status" role="status">{categoryStatus}</p>}
              {!historyError && visibleReceipts.length === 0 && (
                <p className="empty">{query ? 'No receipts match your search.' : 'No receipts yet.'}</p>
              )}
              <div className="history-list">
                {visibleReceipts.length > 0 && (
                  <div className="receipt-columns" aria-hidden="true">
                    <span>Store</span><span>Purchase date</span><span>Line total</span>
                  </div>
                )}
                {(view === 'overview' && !query ? visibleReceipts.slice(0, 5) : visibleReceipts).map((receipt) => (
                  <details key={receipt.id} className="history-receipt">
                    <summary>
                      <span className="receipt-meta">
                        <span className="history-icon"><Icon name="receipt" /></span>
                        <strong>{receipt.store}</strong>
                      </span>
                      <time dateTime={receipt.purchased_on}>{dateLabel.format(new Date(receipt.purchased_on))}</time>
                      <strong className="receipt-amount">{dollars.format(receiptTotal(receipt) / 100)}</strong>
                      <Icon name="chevron" />
                    </summary>
                    <div className="history-details">
                      {receipt.receipt_items.length === 0 && <p className="muted">No items recorded.</p>}
                      <ul>
                        {receipt.receipt_items.map((item) => {
                          const category = resolveCategory(categoryRules, receipt.store, item.item_name, item.category)
                          return (
                            <li key={item.id} className="history-item">
                              <div className="history-item-line">
                                <span>{item.item_name} × {item.quantity}</span>
                                <strong>{dollars.format(item.line_total_cents / 100)}</strong>
                              </div>
                              {categoryReady && (
                                <form key={category} className="history-category"
                                  onSubmit={(event) => saveItemCategory(event, item.id)}>
                                  <label>Category
                                    <input name="category" list="receipt-category-options" defaultValue={category}
                                      maxLength={64} required disabled={busy} />
                                  </label>
                                  <button className="button quiet" type="submit" disabled={busy}>Save category</button>
                                </form>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                      <button className="button quiet" type="button" disabled={busy} onClick={() => {
                        setReceiptId(receipt.id)
                        openView('capture')
                      }}>Add items to this receipt</button>
                    </div>
                  </details>
                ))}
              </div>
              {view === 'overview' && receipts.length > 5 && !query && (
                <button className="button quiet" type="button" onClick={() => openView('receipts')}>View all receipts</button>
              )}
            </section>
        </div>
      </main>
    </div>
  )
}
