import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

// ---- Reading the printed subtotal ----
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
function subtotalFromText(text: string): number | null {
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

// Receipts like H-E-B's print no SUBTOTAL line, only "Total Sale ***" followed by the amount. Labels with extra
// words ("TOTAL SAVINGS", "TOTAL ITEMS") are rejected because the text after the label must hold no letters.
const TOTAL_LABEL = /^\W*(?:grand\s+)?total(?:\s+(?:sale|due))?\b|^\W*(?:amount|balance)\s+due\b/i
const TAX_LABEL = /^\W*(?:sales\s+)?tax\b/i

function labelledAmount(lines: string[], index: number, rest: string): number | null {
  let value = toNumber(rest)
  if (value === null) {
    const next = (lines[index + 1] ?? '').trim()
    if (next && next.replace(AMOUNT, '').replace(/[\s$:]/g, '') === '') value = toNumber(next)
  }
  return value
}

/** The amount printed after the receipt's final total label (the last one wins). */
function totalFromText(text: string): number | null {
  const lines = text.split(/\r?\n/)
  let found: number | null = null
  for (let index = 0; index < lines.length; index++) {
    const label = TOTAL_LABEL.exec(lines[index])
    if (!label) continue
    const rest = lines[index].slice(label[0].length)
    if (/[a-z]/i.test(rest)) continue
    const value = labelledAmount(lines, index, rest)
    if (value !== null && value > 0) found = value
  }
  return found
}

/** The sum of the amounts printed on tax lines, or null when the receipt shows none. */
function taxFromText(text: string): number | null {
  const lines = text.split(/\r?\n/)
  let sum: number | null = null
  for (let index = 0; index < lines.length; index++) {
    const label = TAX_LABEL.exec(lines[index])
    if (!label) continue
    const value = labelledAmount(lines, index, lines[index].slice(label[0].length))
    if (value !== null && value >= 0) sum = (sum ?? 0) + value
  }
  return sum === null ? null : Math.round(sum * 100) / 100
}

type Money = { valueCurrency?: { amount?: number }; valueNumber?: number; content?: string } | undefined

const amountOf = (field: Money): number | null =>
  field?.valueCurrency?.amount ?? field?.valueNumber ?? (field?.content ? toNumber(field.content) : null)

/**
 * Picks the best available subtotal: Azure's own field, then the printed SUBTOTAL line, then the receipt's total
 * minus any tax. Returns the amount and where it came from; `total` and `total-minus-tax` are derived, so the
 * app shows them for the user to confirm.
 */
function pickSubtotal(
  fields: { Subtotal?: Money; Total?: Money; TotalTax?: Money } | undefined,
  text: string,
): { amount: number | null; source: 'azure' | 'text' | 'total' | 'total-minus-tax' | null } {
  const azure = amountOf(fields?.Subtotal)
  if (azure !== null && azure > 0) return { amount: azure, source: 'azure' }

  const printed = subtotalFromText(text)
  if (printed !== null) return { amount: printed, source: 'text' }

  // No separate subtotal was printed (as on H-E-B receipts), so work back from the total.
  const total = amountOf(fields?.Total) ?? totalFromText(text)
  if (total === null || total <= 0) return { amount: null, source: null }
  const tax = amountOf(fields?.TotalTax) ?? taxFromText(text)
  if (tax === null || tax === 0) return { amount: total, source: 'total' }
  const amount = Math.round((total - tax) * 100) / 100
  return amount > 0 ? { amount, source: 'total-minus-tax' } : { amount: null, source: null }
}

// ---- Request handling ----

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405)
  }

  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) return json({ error: 'Sign in before scanning.' }, 401)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return json({ error: 'Your session expired. Sign in again.' }, 401)
    }

    if (request.headers.get('Content-Type')?.includes('application/json')) {
      const body = await request.json()
      if (body?.action === 'search-places') {
        const query = typeof body.query === 'string' ? body.query.trim() : ''
        if (query.length < 3 || query.length > 180) {
          return json({ error: 'Enter a store name and area between 3 and 180 characters.' }, 400)
        }
        const key = Deno.env.get('GEOAPIFY_API_KEY')
        if (!key) return json({ error: 'Store search is not configured. You can still enter the receipt address.' }, 503)

        const url = new URL('https://api.geoapify.com/v1/geocode/search')
        url.search = new URLSearchParams({
          text: query, type: 'amenity', format: 'json', limit: '6', apiKey: key,
        }).toString()
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
          if (!response.ok) return json({ error: 'Store search is temporarily unavailable.' }, 502)
          const result = await response.json()
          const places = []
          const seen = new Set()
          for (const place of result.results ?? []) {
            const name = typeof place.name === 'string' ? place.name.trim() : ''
            const street = [place.housenumber, place.street].filter(Boolean).join(' ')
            const address = street && place.address_line2
              ? street + ', ' + place.address_line2
              : place.formatted
            const latitude = place.lat
            const longitude = place.lon
            if (place.result_type !== 'amenity' || !name || typeof address !== 'string' || !address.trim() ||
                address.length > 500 || typeof latitude !== 'number' || typeof longitude !== 'number' ||
                !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
                Math.abs(latitude) > 85 || Math.abs(longitude) > 180) continue
            const id = [latitude, longitude, address].join(',')
            if (seen.has(id)) continue
            seen.add(id)
            places.push({ name, address, latitude, longitude })
          }
          return json({ places })
        } catch {
          return json({ error: 'Store search is temporarily unavailable.' }, 502)
        }
      }

      if (body?.action !== 'locate-address' || typeof body.address !== 'string' ||
          body.address.length > 500 || body.address.trim().length < 8) {
        return json({ error: 'Enter a complete street address.' }, 400)
      }
      const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress')
      url.searchParams.set('address', body.address.trim())
      url.searchParams.set('benchmark', 'Public_AR_Current')
      url.searchParams.set('format', 'json')
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8_000) })
        if (!response.ok) return json({ location: null })
        const result = await response.json()
        const matches = result.result?.addressMatches ?? []
        if (matches.length !== 1) return json({ location: null })
        const match = matches[0]
        const latitude = match.coordinates?.y
        const longitude = match.coordinates?.x
        if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
            !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
            Math.abs(latitude) > 85 || Math.abs(longitude) > 180) {
          return json({ location: null })
        }
        return json({ location: { address: match.matchedAddress, latitude, longitude } })
      } catch {
        return json({ location: null })
      }
    }

    const photo = (await request.formData()).get('photo')
    if (!(photo instanceof File) || !['image/jpeg', 'image/png', 'application/pdf'].includes(photo.type)) {
      return json({ error: 'Choose a JPEG, PNG or PDF receipt.' }, 400)
    }
    if (photo.size === 0 || photo.size > 4_000_000) {
      return json({ error: 'Choose a photo under 4 MB.' }, 400)
    }

    const endpoint = Deno.env.get('AZURE_DOCUMENT_ENDPOINT')?.replace(/\/+$/, '')
    const key = Deno.env.get('AZURE_DOCUMENT_KEY')
    if (!endpoint || !key) {
      return json({ error: 'The Azure scanner secrets are missing.' }, 500)
    }

    const headers = { 'Ocp-Apim-Subscription-Key': key }
    const signal = AbortSignal.timeout(45_000)
    const started = await fetch(
      `${endpoint}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=2024-11-30`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/octet-stream' },
        body: photo,
        signal,
      },
    )

    const resultUrl = started.headers.get('Operation-Location')
    if (!started.ok || !resultUrl) {
      return json({ error: `Azure could not start the scan (${started.status}).` }, 502)
    }

    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      const response = await fetch(resultUrl, { headers, signal })
      if (!response.ok) {
        return json({ error: `Azure could not return the scan (${response.status}).` }, 502)
      }

      const result = await response.json()
      if (result.status === 'failed' || result.status === 'canceled') {
        return json({ error: 'Azure could not read this receipt.' }, 422)
      }
      if (result.status !== 'succeeded') continue

      const analysis = result.analyzeResult
      const fields = analysis?.documents?.[0]?.fields
      const subtotal = pickSubtotal(fields, analysis?.content ?? '')

      return json({
        store: fields?.MerchantName?.valueString ?? '',
        address: fields?.MerchantAddress?.valueString ?? fields?.MerchantAddress?.content ?? '',
        country: fields?.CountryRegion?.valueCountryRegion ?? '',
        date: fields?.TransactionDate?.valueDate ?? '',
        subtotal: subtotal.amount,
        subtotalSource: subtotal.source,
        text: analysis?.content ?? '',
        items: (fields?.Items?.valueArray ?? []).map(
          ({ valueObject: item }: { valueObject: Record<string, {
            valueString?: string
            valueNumber?: number
            valueCurrency?: { amount: number }
          }> }) => ({
            name: item?.Description?.valueString ?? '',
            quantity: item?.Quantity?.valueNumber ?? 1,
            total: item?.TotalPrice?.valueCurrency?.amount ?? null,
          }),
        ),
      })
    }

    return json({ error: 'The scan timed out. Try again.' }, 504)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return json({ error: 'The scan timed out. Try again.' }, 504)
    }
    return json({ error: 'The scan could not be completed.' }, 500)
  }
})