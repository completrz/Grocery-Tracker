import { useId, useState } from 'react'
import { supabase } from './supabase'

export default function PlaceSearch({ onSelect }) {
  const inputId = useId()
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function search() {
    const text = query.trim()
    if (text.length < 3 || busy) return

    setBusy(true)
    setPlaces([])
    setMessage('Searching for stores…')
    try {
      const { data, error } = await supabase.functions.invoke('hyper-handler', {
        body: { action: 'search-places', query: text },
      })
      if (error) {
        const details = error.context instanceof Response
          ? await error.context.json().catch(() => null)
          : null
        throw new Error(details?.error ?? 'Store search isn’t available right now. Try again, or enter the address instead.')
      }
      const matches = data.places
      setPlaces(matches)
      setMessage(matches.length ? 'Choose the branch that matches your receipt.' : 'No stores found. Add a city, street, or ZIP code and search again.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="place-search stack-sm">
      <label className="field" htmlFor={inputId}>Store name and area</label>
      <div className="place-search-controls">
        <input id={inputId} type="search" value={query} placeholder="e.g. H-E-B Burnet Road Austin"
          maxLength={180} disabled={busy} onChange={(event) => {
            setQuery(event.target.value)
            setPlaces([])
            setMessage('')
          }} onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              search()
            }
          }} />
        <button className="btn btn-secondary" type="button" disabled={busy || query.trim().length < 3}
          onClick={search}>Search stores</button>
      </div>
      <p className="small muted" role="status">{message}</p>
      {places.length > 0 && (
        <ul className="place-results">
          {places.map((place) => (
            <li key={place.latitude + ',' + place.longitude + ',' + place.address}>
              <button type="button" onClick={() => {
                onSelect(place)
                setPlaces([])
                setMessage('Branch selected.')
              }}>
                <strong>{place.name}</strong><span>{place.address}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted">Search sends your text to <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a>.</p>
    </div>
  )
}
