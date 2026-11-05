import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import PlaceSearch from './PlaceSearch'
import 'leaflet/dist/leaflet.css'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const hasPoint = (receipt) => receipt.latitude != null && receipt.longitude != null

function groupLocations(receipts) {
  const groups = new Map()
  for (const receipt of receipts.filter(hasPoint)) {
    const key = [receipt.latitude, receipt.longitude].join(',')
    const group = groups.get(key) ?? {
      key, point: [receipt.latitude, receipt.longitude], stores: new Set(), cents: 0, count: 0,
    }
    group.stores.add(receipt.store)
    group.cents += receipt.receipt_items.reduce((total, item) => total + item.line_total_cents, 0)
    group.count += 1
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => b.cents - a.cents)
}

export default function SpendingMap({ receipts, onSave }) {
  const node = useRef(null)
  const map = useRef(null)
  const markers = useRef(new Map())
  const [receiptId, setReceiptId] = useState('')
  const [draft, setDraft] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [tileError, setTileError] = useState(false)
  const groups = useMemo(() => groupLocations(receipts), [receipts])
  const receipt = receipts.find((entry) => entry.id === receiptId) ?? receipts.find((entry) => !hasPoint(entry)) ?? receipts[0]
  const lat = draft?.id === receipt?.id ? draft.lat : receipt?.latitude ?? ''
  const lng = draft?.id === receipt?.id ? draft.lng : receipt?.longitude ?? ''

  useEffect(() => {
    const instance = L.map(node.current, { scrollWheelZoom: false, maxZoom: 19 }).setView([39, -98], 4)
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(instance)
    tiles.on('tileerror', () => setTileError(true))
    tiles.on('tileload', () => setTileError(false))
    map.current = instance
    return () => { instance.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const instance = map.current
    const layer = L.layerGroup().addTo(instance)
    const byKey = new Map()
    const max = Math.max(1, ...groups.map((group) => Math.abs(group.cents)))
    for (const group of groups) {
      const popup = document.createElement('div')
      const name = document.createElement('strong')
      name.textContent = [...group.stores].join(', ')
      const detail = document.createElement('div')
      detail.textContent = money.format(group.cents / 100) + ' · ' + group.count + ' receipt(s)'
      popup.append(name, detail)
      const marker = L.circleMarker(group.point, {
        radius: 7 + 13 * Math.sqrt(Math.abs(group.cents) / max),
        color: '#184faf', fillColor: '#3b82f6', fillOpacity: .68, weight: 2, bubblingMouseEvents: false,
      }).addTo(layer).bindPopup(popup)
      byKey.set(group.key, marker)
    }
    markers.current = byKey
    if (groups.length === 1) instance.setView(groups[0].point, 13)
    if (groups.length > 1) instance.fitBounds(groups.map((group) => group.point), { padding: [28, 28], maxZoom: 14 })
    return () => layer.remove()
  }, [groups])

  useEffect(() => {
    if (!receipt || busy) return
    const instance = map.current
    const click = ({ latlng }) => setDraft({
      id: receipt.id, lat: latlng.lat.toFixed(5), lng: latlng.wrap().lng.toFixed(5),
    })
    instance.on('click', click)
    return () => instance.off('click', click)
  }, [receipt, busy])

  useEffect(() => {
    if (!draft || draft.id !== receipt?.id || lat === '' || lng === '') return
    const point = [Number(lat), Number(lng)]
    if (!point.every(Number.isFinite) || Math.abs(point[0]) > 85 || Math.abs(point[1]) > 180) return
    const marker = L.circleMarker(point, {
      radius: 7, color: '#9a5010', fillColor: '#fbbf24', fillOpacity: .85, interactive: false,
    }).addTo(map.current)
    return () => marker.remove()
  }, [draft, receipt?.id, lat, lng])

  async function save(point) {
    setBusy(true)
    setMessage('')
    try {
      await onSave(receipt.id, point)
      setDraft(null)
      setMessage(point ? 'Location saved.' : 'Location removed.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  function submit(event) {
    event.preventDefault()
    const point = [Number(lat), Number(lng)]
    if (lat === '' || lng === '' || !point.every(Number.isFinite) ||
      Math.abs(point[0]) > 85 || Math.abs(point[1]) > 180) {
      setMessage('Enter a latitude from −85 to 85 and a longitude from −180 to 180.')
      return
    }
    save(point.map((value) => Number(value.toFixed(5))))
  }

  return (
    <div className="spending-map-body">
      <p className="trend-note">{receipts.filter(hasPoint).length} of {receipts.length} receipts in these filters are mapped. The basemap uses OpenStreetMap tiles.</p>
      <div ref={node} className="spending-map" aria-label="Map of pinned spending locations" />
      {tileError && <p className="trend-note" role="status">Some map tiles did not load. Saved locations remain available below.</p>}
      {groups.length > 0 && (
        <ul className="location-list">
          {groups.map((group) => (
            <li key={group.key}>
              <button type="button" className="button quiet" onClick={() => {
                map.current.setView(group.point, 14)
                markers.current.get(group.key)?.openPopup()
              }}>{[...group.stores].join(', ')}</button>
              <span>{group.count} receipt(s)</span><strong>{money.format(group.cents / 100)}</strong>
            </li>
          ))}
        </ul>
      )}
      {receipt && (
        <form className="map-form" onSubmit={submit}>
          <h3>Pin a receipt location</h3>
          <p className="trend-note">Choose a receipt, then click its store on the map or enter coordinates.</p>
          <fieldset disabled={busy}>
            <label>Receipt
              <select aria-label="Receipt to pin" value={receipt.id} onChange={(event) => { setReceiptId(event.target.value); setDraft(null); setMessage('') }}>
                {receipts.map((entry) => <option key={entry.id} value={entry.id}>
                  {entry.store} · {entry.purchased_on}{hasPoint(entry) ? ' · Pinned' : ''}
                </option>)}
              </select>
            </label>
            <PlaceSearch key={receipt.id} onSelect={(place) => {
              const lat = place.latitude.toFixed(5)
              const lng = place.longitude.toFixed(5)
              setDraft({ id: receipt.id, lat, lng })
              setMessage(place.name + ' · ' + place.address + '. Save to update the receipt location.')
              map.current.setView([Number(lat), Number(lng)], 15)
            }} />
            <div className="receipt-fields">
              <label>Latitude<input type="number" min="-85" max="85" step="any" required value={lat}
                onChange={(event) => setDraft({ id: receipt.id, lat: event.target.value, lng })} /></label>
              <label>Longitude<input type="number" min="-180" max="180" step="any" required value={lng}
                onChange={(event) => setDraft({ id: receipt.id, lat, lng: event.target.value })} /></label>
            </div>
            <div className="map-actions">
              <button className="button primary" type="submit">Save location</button>
              {hasPoint(receipt) && <button className="button quiet" type="button" onClick={() => save(null)}>Remove pin</button>}
            </div>
          </fieldset>
          <p className="form-status" role="status">{message}</p>
        </form>
      )}
    </div>
  )
}
