import { useState } from 'react'
import { resolveCategory, tidyCategory } from './categories'
import { Icon } from './ui'

export function blankItem() {
  return { id: crypto.randomUUID(), name: '', quantity: '1', total: '', category: '' }
}

export function receiptItemRows(items, categoryReady, choices) {
  return items.map((item) => ({
    item_name: item.name.trim(),
    quantity: Number(item.quantity),
    line_total_cents: item.total.trim() ? Math.round(Number(item.total) * 100) : NaN,
    ...(categoryReady && item.category.trim() ? { category: tidyCategory(item.category, choices) } : {}),
  }))
}

export function hasInvalidReceiptItem(rows) {
  return rows.some((row) =>
    !row.item_name ||
    !Number.isFinite(row.quantity) ||
    row.quantity <= 0 ||
    !Number.isInteger(row.line_total_cents) ||
    row.line_total_cents < -2147483648 ||
    row.line_total_cents > 2147483647,
  )
}

export function ReceiptItemsEditor({ items, categoryReady, categoryRules, activeStore, updateItem, removeItem, addItem }) {
  return (
    <>
      <div className="table-panel table-panel-flush">
        <table className="items-table">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className="col-qty">Qty</th>
              <th scope="col" className="col-total">Line total</th>
              {categoryReady && <th scope="col" className="col-category">Category</th>}
              <th scope="col" className="col-remove"><span className="visually-hidden">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td><input className="cell-input" aria-label={`Item ${index + 1} name`} value={item.name} placeholder="Whole milk"
                  onChange={(event) => updateItem(item.id, 'name', event.target.value)} /></td>
                <td><input className="cell-input" aria-label={`Item ${index + 1} quantity`} type="number" step="any" value={item.quantity}
                  onChange={(event) => updateItem(item.id, 'quantity', event.target.value)} /></td>
                <td><input className="cell-input cell-money" aria-label={`Item ${index + 1} line total in dollars`} type="number" step="0.01" value={item.total} placeholder="0.00"
                  onChange={(event) => updateItem(item.id, 'total', event.target.value)} /></td>
                {categoryReady && (
                  <td><input className="cell-input" aria-label={`Item ${index + 1} category`} list="receipt-category-options" value={item.category} maxLength={64}
                    placeholder={resolveCategory(categoryRules, activeStore, item.name)}
                    onChange={(event) => updateItem(item.id, 'category', event.target.value)} /></td>
                )}
                <td>
                  <button type="button" className="icon-button" aria-label={`Remove ${item.name.trim() || 'item ' + (index + 1)}`}
                    onClick={() => removeItem(item.id)}>
                    <Icon name="close" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-footer">
          <button type="button" className="btn btn-quiet" onClick={addItem}>
            <Icon name="plus" size={18} /> Add a line
          </button>
        </div>
      </div>
      {categoryReady && <p className="muted small spaced">Leave a category blank to use the suggestion. A category you enter is remembered for this store and item name.</p>}
    </>
  )
}

export function EditReceipt({ receipt, busy, categoryReady, categoryRules, choices, saveError, onCancel, onSave }) {
  const [original] = useState(receipt)
  const [store, setStore] = useState(original.store)
  const [date, setDate] = useState(original.purchased_on)
  const [error, setError] = useState('')
  const [items, setItems] = useState(() => original.receipt_items.map((item) => ({
    id: item.id,
    name: item.item_name,
    quantity: String(item.quantity),
    total: (item.line_total_cents / 100).toFixed(2),
    category: item.category ?? '',
  })))

  function updateItem(id, field, value) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  function submit(event) {
    event.preventDefault()
    if (!store.trim() || !date) {
      setError('Enter the store and purchase date.')
      return
    }

    const savedItems = Object.fromEntries(original.receipt_items.map((item) => [String(item.id), {
      item_name: item.item_name,
      quantity: Number(item.quantity),
      line_total_cents: item.line_total_cents,
      category: item.category ?? null,
    }]))
    const entered = items.filter((item) => Object.hasOwn(savedItems, item.id) || item.name.trim() || item.total.trim() || item.category.trim())
    const rows = receiptItemRows(entered, categoryReady, choices)
    if (hasInvalidReceiptItem(rows)) {
      setError('Every line needs a name, a quantity above zero, and a line total.')
      return
    }

    setError('')
    void onSave({
      p_id: original.id,
      p_store: store.trim(),
      p_purchased_on: date,
      p_original: { store: original.store, purchased_on: original.purchased_on, items: savedItems },
      p_items: rows.map((row, index) => ({
        ...row,
        id: Object.hasOwn(savedItems, entered[index].id) ? String(entered[index].id) : null,
      })),
    })
  }

  return (
    <form onSubmit={submit} aria-labelledby="receipt-edit-title">
      <fieldset className="plain-fieldset stack-lg" disabled={busy}>
        <h2 className="h-section" id="receipt-edit-title">Edit receipt</h2>
        <div className="field-pair">
          <label className="field">Store
            <input value={store} onChange={(event) => setStore(event.target.value)} required />
          </label>
          <label className="field">Purchase date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </label>
        </div>
        <ReceiptItemsEditor items={items} categoryReady={categoryReady} categoryRules={categoryRules}
          activeStore={store} updateItem={updateItem}
          removeItem={(id) => setItems((current) => current.filter((item) => item.id !== id))}
          addItem={() => setItems((current) => [...current, blankItem()])} />
        {(error || saveError) && <p className="note note-warn" role="alert">{error || saveError}</p>}
        <div className="toolbar">
          <button className="btn btn-primary" type="submit">{busy ? 'Saving…' : 'Save changes'}</button>
          <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </fieldset>
    </form>
  )
}
