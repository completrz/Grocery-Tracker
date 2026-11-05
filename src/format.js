export const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const wholeDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
export const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
export const shortDateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// purchased_on is a plain YYYY-MM-DD string, so it is formatted as UTC to avoid day shifts.
export const formatDate = (day) => dateLabel.format(new Date(day + 'T00:00:00Z'))
export const formatShortDate = (day) => shortDateLabel.format(new Date(day + 'T00:00:00Z'))

export function receiptTotal(receipt) {
  return receipt.receipt_items.reduce((sum, item) => sum + item.line_total_cents, 0)
}

export function localDayKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}

export const plural = (count, one, many = one + 's') => count + ' ' + (count === 1 ? one : many)

const receiptQuantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })

// Lines for <ReceiptPaper>: upper-case names like thermal print, prices without a currency sign.
export function receiptLines(items) {
  return items.map((item) => ({
    name: item.item_name.toUpperCase() + (Number(item.quantity) === 1 ? '' : ' × ' + receiptQuantity.format(item.quantity)),
    price: (item.line_total_cents / 100).toFixed(2),
  }))
}
