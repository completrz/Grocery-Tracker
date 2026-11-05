import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

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
      if (body.action !== 'locate-address' || typeof body.address !== 'string' ||
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
    if (!(photo instanceof File) || !['image/jpeg', 'image/png'].includes(photo.type)) {
      return json({ error: 'Choose a JPEG or PNG receipt photo.' }, 400)
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

      return json({
        store: fields?.MerchantName?.valueString ?? '',
        address: fields?.MerchantAddress?.valueString ?? fields?.MerchantAddress?.content ?? '',
        country: fields?.CountryRegion?.valueCountryRegion ?? '',
        date: fields?.TransactionDate?.valueDate ?? '',
        subtotal: fields?.Subtotal?.valueCurrency?.amount ?? null,
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