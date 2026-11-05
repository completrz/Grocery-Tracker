// Finds a receipt's printed subtotal when Azure's `Subtotal` field is empty, which happens often with
// grocery receipts such as H-E-B's. Kept free of Deno APIs so it can be tested anywhere.

const AMOUNT = /-?\$?\s?\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g

function toNumber(text: string): number | null {
  const amounts = text.match(AMOUNT)
  if (!amounts) return null
  const value = Number(amounts[amounts.length - 1].replace(/[$,\s]/g, ''))
  return Number.isFinite(value) ? value : null
}

/** Reads the amount printed after a "SUBTOTAL" label in the receipt text, on the same line or the next one. */
export function subtotalFromText(text: string): number | null {
  const lines = text.split(/\r?\n/)
  let found: number | null = null
  for (let index = 0; index < lines.length; index++) {
    if (!/\bsub[\s-]*total\b/i.test(lines[index])) continue
    // Only look after the label so an amount printed before it (an item price) is never picked up.
    const after = lines[index].replace(/^.*?\bsub[\s-]*total\b/i, '')
    let value = toNumber(after)
    if (value === null) {
      // Some scans put the amount on its own line under the label.
      const next = (lines[index + 1] ?? '').trim()
      if (next && next.replace(AMOUNT, '').replace(/[\s$:]/g, '') === '') value = toNumber(next)
    }
    if (value !== null && value > 0) found = value
  }
  return found
}

type Money = { valueCurrency?: { amount?: number }; valueNumber?: number; content?: string } | undefined

const amountOf = (field: Money): number | null =>
  field?.valueCurrency?.amount ?? field?.valueNumber ?? (field?.content ? toNumber(field.content) : null)

/**
 * Picks the best available subtotal: Azure's own field, then the printed SUBTOTAL line, then Total minus Tax
 * when both were read. Returns the amount and where it came from.
 */
export function pickSubtotal(
  fields: { Subtotal?: Money; Total?: Money; TotalTax?: Money } | undefined,
  text: string,
): { amount: number | null; source: 'azure' | 'text' | 'total-minus-tax' | null } {
  const azure = amountOf(fields?.Subtotal)
  if (azure !== null && azure > 0) return { amount: azure, source: 'azure' }

  const printed = subtotalFromText(text)
  if (printed !== null) return { amount: printed, source: 'text' }

  const total = amountOf(fields?.Total)
  const tax = amountOf(fields?.TotalTax)
  if (total !== null && tax !== null && total - tax > 0) {
    return { amount: Math.round((total - tax) * 100) / 100, source: 'total-minus-tax' }
  }
  return { amount: null, source: null }
}
