import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const dollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

function blankItem() {
  return { id: crypto.randomUUID(), name: '', quantity: '1', total: '' }
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

  return (
    <main style={{ maxWidth: '48rem', margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Grocery Tracker</h1>
      {!ready && <p>Loading…</p>}
      {ready && !session && <SignIn />}
      {session && <Tracker key={session.user.id} email={session.user.email} />}
    </main>
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

  return (
    <form onSubmit={signIn}>
      <p>
        <label>Email <input name="email" type="email" required /></label>
      </p>
      <p>
        <label>Password <input name="password" type="password" required /></label>
      </p>
      <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p role="status">{message}</p>
    </form>
  )
}

function Tracker({ email }) {
  const [receipts, setReceipts] = useState([])
  const [items, setItems] = useState(() => [blankItem()])
  const [store, setStore] = useState('')
  const [date, setDate] = useState('')
  const [receiptId, setReceiptId] = useState('')
  const [scanText, setScanText] = useState('')
  const [azureSubtotal, setAzureSubtotal] = useState(null)
  const [message, setMessage] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true

    async function loadReceipts() {
      const { data, error } = await supabase
        .from('receipts')
        .select('id, store, purchased_on, receipt_items(id, item_name, quantity, line_total_cents)')
        .order('purchased_on', { ascending: false })

      if (!active) return
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

  async function saveReceipt(event) {
    event.preventDefault()

    const rows = enteredItems.map((item) => ({
      item_name: item.name.trim(),
      quantity: Number(item.quantity),
      line_total_cents: item.total.trim()
        ? Math.round(Number(item.total) * 100)
        : NaN,
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
      setAzureSubtotal(null)
      setRefresh((current) => current + 1)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) setMessage(error.message)
  }

  const monthlyTotals = new Map()
  for (const receipt of receipts) {
    if (receipt.receipt_items.length === 0) continue
    const month = receipt.purchased_on.slice(0, 7)
    const total = receipt.receipt_items.reduce(
      (sum, item) => sum + item.line_total_cents,
      0,
    )
    monthlyTotals.set(month, (monthlyTotals.get(month) ?? 0) + total)
  }

  return (
    <>
      <p>
        Signed in as {email}{' '}
        <button type="button" disabled={busy} onClick={signOut}>Sign out</button>
      </p>

      <h2>Add groceries</h2>
      <form onSubmit={saveReceipt}>
        <fieldset disabled={busy}>
          <legend>Receipt details</legend>

          <p>
            <label>
              Receipt{' '}
              <select value={receiptId} onChange={(event) => setReceiptId(event.target.value)}>
                <option value="">New receipt</option>
                {receipts.map((receipt) => (
                  <option key={receipt.id} value={receipt.id}>
                    {receipt.store} · {receipt.purchased_on}
                  </option>
                ))}
              </select>
            </label>
          </p>

          {!receiptId && (
            <>
              <p>
                <label>
                  Store{' '}
                  <input value={store} onChange={(event) => setStore(event.target.value)} required />
                </label>
              </p>
              <p>
                <label>
                  Purchase date{' '}
                  <input type="date" value={date}
                    onChange={(event) => setDate(event.target.value)} required />
                </label>
              </p>
            </>
          )}

          <p>
            <label>
              Scan a receipt photo with Azure{' '}
              <input type="file" accept="image/jpeg,image/png"
                capture="environment" onChange={scanReceipt} />
            </label>
            <br />
            <small>Choosing a photo sends it to Azure for processing.</small>
          </p>

          {scanText && (
            <details>
              <summary>View scanned text</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{scanText}</pre>
            </details>
          )}

          {items.map((item, index) => (
            <fieldset key={item.id}>
              <legend>Item {index + 1}</legend>
              <label>
                Name{' '}
                <input value={item.name}
                  onChange={(event) => updateItem(item.id, 'name', event.target.value)} />
              </label>{' '}
              <label>
                Qty{' '}
                <input type="number" step="any" value={item.quantity}
                  onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} />
              </label>{' '}
              <label>
                Line total ($){' '}
                <input type="number" step="0.01" value={item.total}
                  onChange={(event) => updateItem(item.id, 'total', event.target.value)} />
              </label>{' '}
              <button type="button" onClick={() => setItems(
                (current) => current.filter((entry) => entry.id !== item.id),
              )}>
                Remove
              </button>
            </fieldset>
          ))}

          {!receiptId && subtotalCents !== null && (
            <p role="status">
              Scanned subtotal {azureSubtotal.toFixed(2)} · Entered line totals{' '}
              {(enteredCents / 100).toFixed(2)}
              <br />
              {missingPrices > 0
                ? `${missingPrices} item(s) still need a price.`
                : enteredCents === subtotalCents
                  ? 'Totals match. Review individual prices before saving.'
                  : 'Totals differ. Check for misread prices, missing items, or discounts.'}
            </p>
          )}

          <p>
            <button type="button" onClick={() => setItems(
              (current) => [...current, blankItem()],
            )}>
              Add another item
            </button>{' '}
            <button type="submit">{receiptId ? 'Save items' : 'Save receipt'}</button>
          </p>
        </fieldset>
      </form>

      <p role="status">{message}</p>

      <h2>Monthly spending</h2>
      <p>Totals use the line amounts you entered and are displayed in USD.</p>
      {monthlyTotals.size === 0 && <p>No item totals yet.</p>}
      <ul>
        {[...monthlyTotals].map(([month, cents]) => (
          <li key={month}>{month} · {dollars.format(cents / 100)}</li>
        ))}
      </ul>

      <h2>Receipt history</h2>
      {historyError && <p role="alert">{historyError}</p>}
      {receipts.length === 0 && !historyError && <p>No receipts yet.</p>}

      {receipts.map((receipt) => (
        <details key={receipt.id}>
          <summary>{receipt.store} · {receipt.purchased_on}</summary>
          {receipt.receipt_items.length === 0 && <p>No items recorded.</p>}
          <ul>
            {receipt.receipt_items.map((item) => (
              <li key={item.id}>
                {item.item_name} × {item.quantity} ·{' '}
                {dollars.format(item.line_total_cents / 100)}
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={() => setReceiptId(receipt.id)}>
            Add items to this receipt
          </button>
        </details>
      ))}
    </>
  )
}